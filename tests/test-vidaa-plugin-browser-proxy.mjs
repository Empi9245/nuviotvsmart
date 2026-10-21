import assert from "node:assert/strict";

// Same-origin plugin proxy behaviour of the browser transport. The TV browser
// enforces CORS on provider fetches, so cross-origin plugin requests are
// relayed through /api/plugin-proxy when the serving host implements it and
// fall back to direct fetch when it does not.

const encoder = new TextEncoder();
const originalFetch = globalThis.fetch;
const originalLocation = globalThis.location;
globalThis.location = {
  protocol: "http:",
  origin: "http://127.0.0.1:4173",
  href: "http://127.0.0.1:4173/?wrapper=vidaa"
};

let checks = 0;

async function check(name, run) {
  await run();
  checks += 1;
  console.log(`✓ ${name}`);
}

// Each case imports a fresh module so the cached proxy availability state
// ("unknown" | "available" | "unavailable") cannot leak between cases.
async function loadTransport(caseId) {
  return await import(`../js/platform/pluginBrowserTransport.js?case=${caseId}`);
}

function streamed(chunks, { status = 200, headers = {} } = {}) {
  return new Response(
    new ReadableStream({
      start(controller) {
        chunks.forEach((chunk) => controller.enqueue(chunk));
        controller.close();
      }
    }),
    { status, headers }
  );
}

try {
  await check("relays cross-origin requests through the proxy and maps the response", async () => {
    const { fetchBrowserPluginRequest } = await loadTransport("relay");
    const providerUrl = "https://provider.example/api";
    let proxied;
    globalThis.fetch = async (requestedUrl, options) => {
      assert.equal(requestedUrl, "/api/plugin-proxy");
      assert.equal(options.method, "POST");
      assert.equal(options.headers["Content-Type"], "application/json");
      proxied = JSON.parse(options.body);
      return streamed([encoder.encode("Italiano: città €")], {
        headers: {
          "x-nuvio-plugin-proxy": "1",
          "x-nuvio-proxy-final-url": "https://provider.example/final",
          "x-nuvio-proxy-status-text": "OK",
          "content-type": "application/json; charset=utf-8",
          "x-provider-token": "exposed",
          "x-nuvio-proxy-set-cookie": JSON.stringify(["session=abc"])
        }
      });
    };
    const result = await fetchBrowserPluginRequest({
      url: providerUrl,
      headers: { Accept: "application/json" }
    });
    assert.equal(proxied.url, providerUrl);
    assert.equal(proxied.method, "GET");
    assert.equal(proxied.followRedirects, true);
    assert.equal(proxied.bodyKind, "none");
    assert.equal(proxied.headers.Accept, "application/json");
    assert.match(proxied.headers["User-Agent"], /Mozilla/);
    assert.equal(result.body, "Italiano: città €");
    assert.equal(result.url, "https://provider.example/final");
    assert.equal(result.statusText, "OK");
    assert.equal(result.ok, true);
    assert.equal(result.truncated, false);
    assert.equal(result.headers["x-provider-token"], "exposed");
    assert.equal(result.headers["x-nuvio-proxy-set-cookie"], JSON.stringify(["session=abc"]));
    assert.equal(result.headers["x-nuvio-plugin-proxy"], undefined);
    assert.equal(result.headers["x-nuvio-proxy-final-url"], undefined);
    assert.equal(result.headers["x-nuvio-proxy-status-text"], undefined);
  });

  await check("manual redirects keep the status and Location contract", async () => {
    const { fetchBrowserPluginRequest } = await loadTransport("redirect");
    let proxied;
    globalThis.fetch = async (_url, options) => {
      proxied = JSON.parse(options.body);
      return streamed([encoder.encode("moved")], {
        status: 302,
        headers: {
          "x-nuvio-plugin-proxy": "1",
          location: "/next",
          "content-type": "text/plain"
        }
      });
    };
    const result = await fetchBrowserPluginRequest({
      url: "https://provider.example/start",
      redirect: "manual"
    });
    assert.equal(proxied.followRedirects, false);
    assert.equal(result.status, 302);
    assert.equal(result.ok, false);
    assert.equal(result.headers.location, "/next");
  });

  await check("upstream transport failures reject like a direct fetch", async () => {
    const { fetchBrowserPluginRequest } = await loadTransport("failure");
    globalThis.fetch = async () =>
      streamed([encoder.encode("boom")], {
        status: 502,
        headers: {
          "x-nuvio-plugin-proxy": "1",
          "x-nuvio-proxy-error": "upstream refused",
          "content-type": "text/plain"
        }
      });
    await assert.rejects(
      fetchBrowserPluginRequest({ url: "https://provider.example/api" }),
      /Plugin provider request failed: upstream refused/
    );
  });

  await check("same-origin targets are fetched directly", async () => {
    const { fetchBrowserPluginRequest } = await loadTransport("same-origin");
    const calls = [];
    globalThis.fetch = async (requestedUrl) => {
      calls.push(requestedUrl);
      return streamed([encoder.encode("local")]);
    };
    const result = await fetchBrowserPluginRequest({
      url: "http://127.0.0.1:4173/api/local"
    });
    assert.equal(result.body, "local");
    assert.deepEqual(calls, ["http://127.0.0.1:4173/api/local"]);
  });

  await check("falls back to direct fetch when the host has no proxy endpoint", async () => {
    const { fetchBrowserPluginRequest } = await loadTransport("fallback");
    const calls = [];
    globalThis.fetch = async (requestedUrl) => {
      calls.push(requestedUrl);
      if (requestedUrl === "/api/plugin-proxy") {
        return new Response("Not found", { status: 404 });
      }
      return streamed([encoder.encode("direct result")]);
    };
    const first = await fetchBrowserPluginRequest({ url: "https://provider.example/api" });
    assert.equal(first.body, "direct result");
    assert.deepEqual(calls, ["/api/plugin-proxy", "https://provider.example/api"]);
    const second = await fetchBrowserPluginRequest({ url: "https://provider.example/other" });
    assert.equal(second.body, "direct result");
    assert.deepEqual(calls, [
      "/api/plugin-proxy",
      "https://provider.example/api",
      "https://provider.example/other"
    ]);
  });

  console.log(`VIDAA plugin browser proxy: ${checks} checks passed`);
} finally {
  globalThis.fetch = originalFetch;
  globalThis.location = originalLocation;
}
