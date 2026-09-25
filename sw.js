var CACHE_NAME = "nuvio-vidaa-v3";
var ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./boot-guard.js",
  "./core-js.bundle.js",
  "./nuvio.env.js",
  "./app.bundle.js",
  "./assets/runtime/legacy-features.js",
  "./assets/runtime/plugin-worker.js",
  "./assets/libs/qrcode-generator.js",
  "./assets/libs/quickjs-emscripten.global.js",
  "./assets/libs/ass.min.js",
  "./assets/libs/hls.min.js",
  "./assets/libs/dash.all.min.js",
  "./css/bundle.css"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(function (cache) {
        return cache.addAll(
          ASSETS.map(function (asset) {
            return new Request(asset, { cache: "reload" });
          })
        );
      })
      .then(function () {
        return self.skipWaiting();
      })
      .catch(function (err) {
        console.warn("[SW] Cache install warning:", err);
      })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches
      .keys()
      .then(function (names) {
        return Promise.all(
          names
            .filter(function (n) {
              return n !== CACHE_NAME;
            })
            .map(function (n) {
              return caches.delete(n);
            })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  if (req.url.indexOf(self.location.origin) !== 0) return;

  // Never touch media range requests or video stream files
  if (req.headers && req.headers.get("range")) return;
  if (/\.(mkv|mp4|m4v|webm|m3u8|ts|mpd|mov)(\?|$)/i.test(req.url)) return;

  var normalizedRequest = req;
  if (req.url.indexOf("?") !== -1) {
    var url = new URL(req.url);
    url.search = "";
    normalizedRequest = new Request(url.toString());
  }

  function updateCacheFromNetwork() {
    return fetch(req).then(function (response) {
      if (response && response.status === 200) {
        var clone = response.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put(normalizedRequest, clone);
        });
      }
      return response;
    });
  }

  var isAppShellRequest =
    req.mode === "navigate" ||
    req.destination === "document" ||
    req.destination === "script" ||
    req.destination === "worker" ||
    req.destination === "style" ||
    req.destination === "font" ||
    req.destination === "image" ||
    req.url.endsWith(".html") ||
    req.url.endsWith(".js") ||
    req.url.endsWith(".css") ||
    req.url.endsWith(".wasm");

  if (isAppShellRequest) {
    e.respondWith(
      caches.match(normalizedRequest).then(function (cached) {
        if (cached) {
          // Serve from cache and update in background
          updateCacheFromNetwork().catch(function () {});
          return cached;
        }
        return updateCacheFromNetwork().catch(function () {
          return caches.match("./index.html");
        });
      })
    );
    return;
  }

  e.respondWith(
    caches.match(normalizedRequest).then(function (response) {
      return response || fetch(req);
    })
  );
});
