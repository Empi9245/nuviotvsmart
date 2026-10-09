import assert from "node:assert/strict";

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.__NUVIO_PLATFORM__ = "vidaa";
const { PluginServiceClient } = await import("../js/platform/pluginServiceClient.js");
const originalFetch = globalThis.fetch;
const encoder = new TextEncoder();
const url = "https://provider.example/api";
let checks = 0;

function streamed(
  chunks,
  { headers = {}, status = 200, finalUrl = url, close = true, cancel = () => {} } = {}
) {
  const response = new Response(
    new ReadableStream({
      start(controller) {
        chunks.forEach((chunk) => controller.enqueue(chunk));
        if (close) controller.close();
      },
      cancel
    }),
    { status, headers }
  );
  Object.defineProperty(response, "url", { value: finalUrl });
  return response;
}

async function check(name, run) {
  await run();
  checks += 1;
  console.log(`✓ ${name}`);
}

try {
  await check("preserves exposed headers, final URL and UTF-8 split across chunks", async () => {
    const bytes = encoder.encode("Italiano: città €");
    globalThis.fetch = async (requestedUrl, options) => {
      assert.equal(requestedUrl, url);
      assert.equal(options.method, "GET");
      assert.equal(options.headers.Accept, "application/json");
      assert.equal(options.body, undefined);
      return streamed([bytes.subarray(0, bytes.length - 1), bytes.subarray(bytes.length - 1)], {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "X-Provider-Token": "exposed",
          Location: "/next"
        },
        finalUrl: "https://provider.example/final"
      });
    };
    const result = await PluginServiceClient.fetch({
      url,
      headers: { Accept: "application/json" }
    });
    assert.equal(result.body, "Italiano: città €");
    assert.equal(result.headers["x-provider-token"], "exposed");
    assert.equal(result.headers.location, "/next");
    assert.equal(result.url, "https://provider.example/final");
    assert.equal(result.truncated, false);
  });

  await check(
    "text and base64 use the same bounded bytes and cancel excess response data",
    async () => {
      const bytes = encoder.encode("A€Z");
      let cancelled = 0;
      globalThis.fetch = async () =>
        streamed([bytes.subarray(0, 2), bytes.subarray(2)], {
          close: false,
          cancel: () => {
            cancelled += 1;
          }
        });
      const result = await PluginServiceClient.fetch({
        url,
        maxResponseBytes: 3,
        responseEncoding: "base64"
      });
      assert.equal(result.status, 200);
      assert.equal(result.ok, true);
      assert.equal(result.truncated, true);
      assert.equal(result.body, Buffer.from(bytes.subarray(0, 3)).toString("utf8"));
      assert.equal(result.bodyBase64, Buffer.from(bytes.subarray(0, 3)).toString("base64"));
      assert.equal(cancelled, 1);
    }
  );

  await check("exact byte limit is complete, larger response is truncated", async () => {
    globalThis.fetch = async () => streamed([encoder.encode("ab"), encoder.encode("c")]);
    const exact = await PluginServiceClient.fetch({ url, maxResponseBytes: 3 });
    assert.equal(exact.body, "abc");
    assert.equal(exact.truncated, false);
    globalThis.fetch = async () => streamed([encoder.encode("abc"), encoder.encode("d")]);
    const extra = await PluginServiceClient.fetch({ url, maxResponseBytes: 3 });
    assert.equal(extra.body, "abc");
    assert.equal(extra.truncated, true);
  });

  await check(
    "uses service default, maxBodyBytes fallback and 5 MiB response ceiling",
    async () => {
      globalThis.fetch = async () => streamed([new Uint8Array(1024 * 1024 + 1).fill(65)]);
      const defaultLimit = await PluginServiceClient.fetch({ url });
      assert.equal(defaultLimit.body.length, 1024 * 1024);
      assert.equal(defaultLimit.truncated, true);
      globalThis.fetch = async () => streamed([encoder.encode("12345")]);
      const bodyLimit = await PluginServiceClient.fetch({ url, maxBodyBytes: 4 });
      assert.equal(bodyLimit.body, "1234");
      assert.equal(bodyLimit.truncated, true);
      globalThis.fetch = async () => streamed([new Uint8Array(5 * 1024 * 1024 + 1).fill(65)]);
      const ceiling = await PluginServiceClient.fetch({ url, maxResponseBytes: 20 * 1024 * 1024 });
      assert.equal(ceiling.body.length, 5 * 1024 * 1024);
      assert.equal(ceiling.truncated, true);
    }
  );

  await check(
    "keeps HTTP failures and empty responses distinct from transport failures",
    async () => {
      globalThis.fetch = async () => streamed([encoder.encode("not found")], { status: 404 });
      const missing = await PluginServiceClient.fetch({ url });
      assert.equal(missing.status, 404);
      assert.equal(missing.ok, false);
      assert.equal(missing.body, "not found");
      globalThis.fetch = async () => new Response(null, { status: 204 });
      const empty = await PluginServiceClient.fetch({ url, responseEncoding: "base64" });
      assert.equal(empty.status, 204);
      assert.equal(empty.body, "");
      assert.equal(empty.bodyBase64, "");
      assert.equal(empty.truncated, false);
    }
  );

  await check("charset decoding matches the service and binary bytes stay unchanged", async () => {
    const latin = new Uint8Array([0xe9, 0x80]);
    globalThis.fetch = async () =>
      streamed([latin], { headers: { "Content-Type": "text/plain; charset=windows-1252" } });
    const result = await PluginServiceClient.fetch({ url, responseEncoding: "base64" });
    assert.equal(result.body, Buffer.from(latin).toString("latin1"));
    assert.equal(result.bodyBase64, Buffer.from(latin).toString("base64"));
    const utf16 = new Uint8Array([0xff, 0xfe, 0x41, 0x00, 0x42]);
    globalThis.fetch = async () =>
      streamed([utf16], { headers: { "Content-Type": "text/plain; charset=utf-16le" } });
    const wide = await PluginServiceClient.fetch({ url });
    assert.equal(wide.body, Buffer.from(utf16).toString("utf16le"));
  });

  await check(
    "forwards validated binary request bodies and preserves method defaults",
    async () => {
      globalThis.fetch = async (_url, options) => {
        assert.equal(options.method, "PUT");
        assert.deepEqual(Array.from(options.body), [0, 255, 128]);
        assert.equal(options.headers["Content-Type"], "application/json");
        return streamed([encoder.encode("ok")]);
      };
      await PluginServiceClient.fetch({
        url,
        method: "PUT",
        bodyKind: "base64",
        bodyBase64: "AP+A"
      });
    }
  );

  await check(
    "does not mistake unavailable streaming for an empty successful response",
    async () => {
      globalThis.fetch = async () => ({
        status: 200,
        headers: new Headers(),
        text: async () => "must not read all"
      });
      await assert.rejects(
        PluginServiceClient.fetch({ url }),
        /Streaming plugin responses are unavailable/
      );
    }
  );

  await check("decodes bounded UTF-8 without a global TextDecoder and preserves BOM", async () => {
    const bytes = encoder.encode("\uFEFFcittà €");
    globalThis.fetch = async () => streamed([bytes]);
    const originalDecoder = globalThis.TextDecoder;
    try {
      globalThis.TextDecoder = undefined;
      const result = await PluginServiceClient.fetch({ url });
      assert.equal(result.body, Buffer.from(bytes).toString("utf8"));
    } finally {
      globalThis.TextDecoder = originalDecoder;
    }
  });

  await check("does not start fetch for an already-aborted signal", async () => {
    let fetches = 0;
    globalThis.fetch = async () => {
      fetches += 1;
      return streamed([]);
    };
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(PluginServiceClient.fetch({ url, signal: controller.signal }), {
      name: "AbortError"
    });
    const android = await PluginServiceClient.fetch({
      url,
      signal: controller.signal,
      androidResponseContract: true
    });
    assert.equal(android.status, 0);
    assert.equal(android.ok, false);
    assert.equal(fetches, 0);
  });

  await check(
    "cancels one request by ID without cancelling another and cleans the registry",
    async () => {
      const pending = new Map();
      globalThis.fetch = (_url, options) =>
        new Promise((resolve, reject) => {
          pending.set(options.headers["X-Test"], { resolve, signal: options.signal });
          options.signal.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true }
          );
        });
      const first = PluginServiceClient.fetch({
        url,
        requestId: "first",
        headers: { "X-Test": "first" }
      });
      const second = PluginServiceClient.fetch({
        url,
        requestId: "second",
        headers: { "X-Test": "second" }
      });
      const firstRejected = assert.rejects(first, { name: "AbortError" });
      assert.equal(await PluginServiceClient.cancel("first"), true);
      await firstRejected;
      assert.equal(pending.get("first").signal.aborted, true);
      assert.equal(pending.get("second").signal.aborted, false);
      pending.get("second").resolve(streamed([encoder.encode("second result")]));
      assert.equal((await second).body, "second result");
      assert.equal(await PluginServiceClient.cancel("first"), false);
      assert.equal(await PluginServiceClient.cancel("second"), false);
      assert.equal(await PluginServiceClient.cancel("unknown"), false);
      globalThis.fetch = async () => streamed([encoder.encode("reused")]);
      assert.equal((await PluginServiceClient.fetch({ url, requestId: "first" })).body, "reused");
    }
  );

  await check("cancellation interrupts a pending response-body read", async () => {
    let reading;
    const readStarted = new Promise((resolve) => {
      reading = resolve;
    });
    let cancelled = 0;
    globalThis.fetch = async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode("first"));
          },
          pull() {
            reading();
          },
          cancel() {
            cancelled += 1;
          }
        })
      );
    const request = PluginServiceClient.fetch({ url, requestId: "stream-cancel" });
    const rejected = assert.rejects(request, { name: "AbortError" });
    await readStarted;
    assert.equal(await PluginServiceClient.cancel("stream-cancel"), true);
    await rejected;
    assert.equal(cancelled, 1);
    assert.equal(await PluginServiceClient.cancel("stream-cancel"), false);
  });

  await check(
    "timeout resolves Android transport failure and cleans cancellation state",
    async () => {
      let signal;
      globalThis.fetch = (_url, options) =>
        new Promise((_, reject) => {
          signal = options.signal;
          signal.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true }
          );
        });
      const result = await PluginServiceClient.fetch({
        url,
        requestId: "timeout",
        timeoutMs: 10,
        androidResponseContract: true
      });
      assert.equal(result.status, 0);
      assert.match(result.statusText, /timed out/);
      assert.equal(signal.aborted, true);
      assert.equal(await PluginServiceClient.cancel("timeout"), false);
    }
  );

  console.log(`VIDAA browser plugin transport: ${checks} checks passed`);
} finally {
  globalThis.fetch = originalFetch;
}
