// Vercel serverless implementation of the same-origin plugin network proxy
// (see scripts/pluginProxyCore.mjs for the protocol and the rationale).
//
// The hosted app on nuviotvsmart.vercel.app is a static bundle: without this
// endpoint every plugin provider fetch is a cross-origin browser fetch blocked
// by CORS, and stream discovery finds almost nothing. This function relays the
// validated provider requests server-side from the app's own origin.
import { PLUGIN_PROXY_HEADER, runPluginProxyHttp } from "../scripts/pluginProxyCore.mjs";

const MAX_REQUEST_BODY_BYTES = 6 * 1024 * 1024;

function readRawBody(req) {
  // Vercel's Node helper may already have parsed application/json bodies.
  if (req.body != null) {
    if (typeof req.body === "string") return Promise.resolve(req.body);
    if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body.toString("utf8"));
    return Promise.resolve(JSON.stringify(req.body));
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    let length = 0;
    req.on("data", (chunk) => {
      length += chunk.length;
      if (length > MAX_REQUEST_BODY_BYTES) {
        reject(new Error("Plugin proxy request body is too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  res.setHeader(PLUGIN_PROXY_HEADER, "1");
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Allow", "POST");
    res.setHeader("Cache-Control", "no-store");
    res.end("Method not allowed");
    return;
  }
  let rawBody;
  try {
    rawBody = await readRawBody(req);
  } catch (error) {
    res.statusCode = 413;
    res.setHeader("Cache-Control", "no-store");
    res.end(String(error?.message || error));
    return;
  }
  const result = await runPluginProxyHttp(rawBody);
  res.statusCode = result.status;
  Object.entries(result.headers).forEach(([name, value]) => {
    res.setHeader(name, value);
  });
  res.setHeader("Cache-Control", "no-store");
  res.end(result.body);
}
