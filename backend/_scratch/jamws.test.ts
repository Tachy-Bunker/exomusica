import Fastify from "fastify";
import websocketPlugin from "@fastify/websocket";
import { WebSocket } from "ws";
import assert from "node:assert/strict";
import { jamRoutes } from "../src/routes/jam.js";
import { signToken } from "../src/lib/auth.js";

const app = Fastify(); await app.register(websocketPlugin); await app.register(jamRoutes);
await app.listen({ port: 0 }); const port = (app.server.address() as { port: number }).port;
const tok = signToken({ id: 5, username: "tachy", isAdmin: false } as never);
// room made by hand through the same module is private to it, so make one through the API as a member (auth needs a DB-less path: skip) -> use the lib directly via a POST with a token if requireAuth allows
const res = await app.inject({ method: "POST", url: "/api/jam", headers: { authorization: `Bearer ${tok}` }, payload: { listed: true } });
console.log("create", res.statusCode);
if (res.statusCode !== 201) { console.log("skip: requireAuth needs the database here"); await app.close(); process.exit(0); }
const code = res.json().code as string;
const open = (token?: string) => new Promise<{ ws: WebSocket; msgs: any[] }>((resolve) => {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/jam/${code}${token ? `?token=${token}` : ""}`); const msgs: any[] = [];
  ws.on("message", (d) => msgs.push(JSON.parse(d.toString()))); ws.on("open", () => setTimeout(() => resolve({ ws, msgs }), 80));
});
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const a = await open(tok), g = await open();
assert.equal(a.msgs[0].guest, false); assert.equal(g.msgs[0].guest, true); assert.match(g.msgs[0].you, /^guest-\d{4}$/);
assert.equal((await app.inject({ url: "/api/jam/rooms" })).json()[0].people, 2);
a.ws.send(JSON.stringify({ type: "cur", x: 0.5, y: 2 })); await wait(80);
const cur = g.msgs.find((m) => m.type === "cur"); assert.deepEqual([cur.u, cur.x, cur.y], ["tachy", 0.5, 1.2]); assert.equal(a.msgs.some((m) => m.type === "cur"), false, "not echoed to the sender");
g.ws.send(JSON.stringify({ type: "chat", text: "  hello   <b>x</b> " })); await wait(80);
assert.equal(a.msgs.find((m) => m.type === "chat").line.text, "hello <b>x</b>"); assert.ok(g.msgs.some((m) => m.type === "chat"), "sender sees it too");
const late = await open(tok); assert.equal(late.msgs[0].chat.length, 1, "newcomers get the recent chat");
for (let i = 0; i < 12; i++) g.ws.send(JSON.stringify({ type: "chat", text: "spam" + i })); await wait(150);
assert.ok(a.msgs.filter((m) => m.type === "chat").length <= 6, "chat is rate-limited");
g.ws.send(JSON.stringify({ type: "cur", x: "a", y: 1 })); a.ws.send("not json"); await wait(50);
g.ws.close(); await wait(100); assert.ok(a.msgs.some((m) => m.type === "gone" && /^guest/.test(m.u)));
console.log("ok"); a.ws.close(); late.ws.close(); await app.close(); process.exit(0);
