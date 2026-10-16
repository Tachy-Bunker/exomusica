/** Takes secret values out of a URL before it is written to the logs: tokens, tickets and passwords in the query string. */
const SECRET_PARAM = /([?&](?:token|ticket|password|key)=)[^&#]*/gi;
export function redactUrl(url: string): string {
  return url.replace(SECRET_PARAM, "$1[redacted]");
}
