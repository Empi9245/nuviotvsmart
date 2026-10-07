import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";

const source = await fs.readFile(new URL("../sw.js", import.meta.url), "utf8");
const listeners = new Map();
const entries = new Map();
const deleted = [];
const currentName = source.match(/var CACHE_NAME = "([^"]+)"/)[1];
const key = (request) => new URL(typeof request === "string" ? request : request.url, "https://nuvio.test/").href;
const cache = {
  async match(request) {
    return entries.get(key(request))?.clone();
  },
  async put(request, response) {
    entries.set(key(request), response.clone());
  }
};
let network = async () => new Response("new build");
let fetched = 0;
let claimed = false;
vm.runInNewContext(source, {
  self: {
    location: { origin: "https://nuvio.test" },
    addEventListener(name, callback) {
      listeners.set(name, callback);
    },
    clients: { claim: async () => { claimed = true; } }
  },
  caches: {
    async open(name) {
      assert.equal(name, currentName);
      return cache;
    },
    async keys() {
      return [currentName, "nuvio-vidaa-old", "another-app-cache"];
    },
    async delete(name) {
      deleted.push(name);
    }
  },
  fetch(request, options) {
    fetched++;
    assert.equal(options.cache, "no-store");
    return network(request);
  },
  URL,
  Request,
  console
});
function request(path, options = {}) {
  return {
    url: new URL(path, "https://nuvio.test/").href,
    method: "GET",
    mode: "cors",
    destination: "",
    headers: new Headers(),
    ...options
  };
}
function handle(req) {
  let result;
  listeners.get("fetch")({ request: req, respondWith(promise) { result = promise; } });
  return result;
}
entries.set(key("./app.bundle.js"), new Response("old cached build"));
assert.equal(await (await handle(request("/app.bundle.js?v=new"))).text(), "new build");
assert.equal(await (await cache.match("./app.bundle.js")).text(), "new build");
network = async () => { throw new Error("offline"); };
assert.equal(await (await handle(request("/app.bundle.js?v=new"))).text(), "new build");
entries.set(key("./index.html"), new Response("offline app shell"));
assert.equal(await (await handle(request("/?wrapper=vidaa", { mode: "navigate" }))).text(), "offline app shell");
await assert.rejects(handle(request("/missing-script.js")), /offline/);
network = async () => new Response("server unavailable", { status: 503 });
assert.equal(await (await handle(request("/app.bundle.js?v=new"))).text(), "new build");
const beforeBypass = fetched;
for (const req of [
  request("/movie.mkv"),
  request("/playlist.m3u8"),
  request("/stream", { headers: new Headers({ range: "bytes=0-" }) }),
  request("https://external.test/script.js")
]) assert.equal(handle(req), undefined);
assert.equal(fetched, beforeBypass);
let activation;
listeners.get("activate")({ waitUntil(promise) { activation = promise; } });
await activation;
assert.deepEqual(deleted, ["nuvio-vidaa-old"]);
assert.equal(claimed, true);
console.log("VIDAA cache checks passed: online freshness, offline fallback, media bypass and scoped cleanup.");
