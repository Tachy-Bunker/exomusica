// Every fetch of an address that a user can influence goes through here. A plain fetch() would happily reach the
// machine's own services (127.0.0.1, Postgres on the Docker network, the cloud metadata address 169.254.169.254).
//
// Three checks, in this order:
//  1. the address shape: http or https only, no login in the address, only the ordinary web ports;
//  2. the address itself, if it is written as an IP: it must be public;
//  3. at connect time, every address the name resolves to must be public. The check runs inside the connection's own
//     lookup, so a name that changes its answer between the check and the connection cannot slip through.
// Redirects are followed by hand, so each new address gets all three checks again.
import net, { type LookupFunction } from "node:net";
import { lookup as dnsLookup } from "node:dns";
import { request as httpRequest, type IncomingMessage, type OutgoingHttpHeaders } from "node:http";
import { request as httpsRequest } from "node:https";

export class BlockedAddressError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlockedAddressError";
  }
}

export function isPublicAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224);
  }
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    if (l === "::1" || l === "::" || l.startsWith("fe80") || l.startsWith("fc") || l.startsWith("fd")) return false;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(l);
    if (mapped) return isPublicAddress(mapped[1]);
    return true;
  }
  return false;
}

/** Checks the shape of an address before anything is connected. Throws BlockedAddressError when it is not allowed. */
export function checkUrlShape(u: URL): void {
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new BlockedAddressError("only http and https addresses can be read");
  if (u.username || u.password) throw new BlockedAddressError("addresses with a login in them are not read");
  if (u.port && u.port !== "80" && u.port !== "443") throw new BlockedAddressError("only the ordinary web ports are read");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host) && !isPublicAddress(host)) throw new BlockedAddressError("that address points inside a private network");
}

/** Used as the connection's lookup: resolves the name, refuses the connection if any answer is not public. */
const guardedLookup = ((hostname: string, options: { all?: boolean; family?: number }, callback: (...args: unknown[]) => void) => {
  dnsLookup(hostname, { all: true, family: options.family }, (err, addresses) => {
    if (err) return callback(err);
    if (!addresses.length) return callback(new BlockedAddressError(`${hostname} has no address`));
    if (addresses.some((a) => !isPublicAddress(a.address))) return callback(new BlockedAddressError(`${hostname} points inside a private network`));
    if (options.all) return callback(null, addresses);
    callback(null, addresses[0].address, addresses[0].family);
  });
}) as unknown as LookupFunction;

function sendOnce(url: URL, headers: OutgoingHttpHeaders, timeoutMs: number): Promise<IncomingMessage> {
  const send = url.protocol === "https:" ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const req = send(url, { method: "GET", headers, lookup: guardedLookup, timeout: timeoutMs }, (res) => resolve(res));
    req.on("timeout", () => req.destroy(new Error("the address did not answer in time")));
    req.on("error", reject);
    req.end();
  });
}

export interface SafeGetOptions {
  headers?: OutgoingHttpHeaders;
  /** How long the connection may stay silent. Not a cap on the whole download. */
  timeoutMs?: number;
  maxRedirects?: number;
}

/** GET an address, with every check above. Resolves to the response (its body is not read) and the final address. */
export async function safeGet(start: string | URL, opts: SafeGetOptions = {}): Promise<{ res: IncomingMessage; url: URL }> {
  let url = new URL(start.toString());
  const maxRedirects = opts.maxRedirects ?? 3;
  for (let hop = 0; ; hop++) {
    checkUrlShape(url);
    const res = await sendOnce(url, { ...(opts.headers ?? {}) }, opts.timeoutMs ?? 8000);
    const code = res.statusCode ?? 0;
    const location = res.headers.location;
    if (code >= 300 && code < 400 && location) {
      res.resume();
      if (hop >= maxRedirects) throw new Error("too many redirects");
      url = new URL(location, url);
      continue;
    }
    return { res, url };
  }
}

/** Reads a response body up to `cap` bytes, then stops and drops the connection. Resolves with what was read. */
export function readBody(res: IncomingMessage, cap: number, maxMs = 15000): Promise<Buffer> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let n = 0;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(Buffer.concat(chunks));
    };
    const timer = setTimeout(() => { res.destroy(); finish(); }, maxMs);
    res.on("data", (c: Buffer) => {
      chunks.push(c);
      n += c.length;
      if (n >= cap) { res.destroy(); finish(); }
    });
    res.on("end", finish);
    res.on("error", finish);
    res.on("close", finish);
  });
}
