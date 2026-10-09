import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { createEmbeddedTextFixture } from "../scripts/create-vidaa-embedded-text-fixture.mjs";

const source = await readFile(
  new URL("../scripts/vidaa-embedded-text-access-probe.js", import.meta.url),
  "utf8"
);
const fixture = createEmbeddedTextFixture();
const plan = { url: "https://media.invalid/sample.mkv?secret=private", ...fixture.manifest };
const tests = [];
const test = (name, run) => tests.push({ name, run });

function harness(change = () => {}) {
  const calls = [];
  const events = new Map();
  const timers = new Map();
  let nextId = 0;
  let cancelled = 0;
  let released = 0;
  let readCalls = 0;
  const context = {
    URL,
    Headers,
    AbortController,
    Uint8Array,
    location: { origin: "https://tv.invalid" },
    setTimeout(callback) {
      const id = ++nextId;
      timers.set(id, callback);
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    addEventListener(name, handler) {
      events.set(name, handler);
    },
    removeEventListener(name) {
      events.delete(name);
    },
    async fetch(url, options) {
      const match = /bytes=(\d+)-(\d+)/.exec(options.headers.get("range"));
      const start = Number(match[1]);
      const end = Number(match[2]);
      const config = {
        status: 206,
        type: "cors",
        redirected: false,
        contentRange: `bytes ${start}-${end}/${fixture.buffer.length}`,
        contentLength: String(end - start + 1),
        chunks: [new Uint8Array(fixture.buffer.subarray(start, end + 1))]
      };
      calls.push({ url, options, start, end });
      change(config, calls.length, options);
      if (config.fetchError) throw config.fetchError;
      if (config.fetchPending)
        return new Promise((resolve) => {
          config.resolveFetch = resolve;
        });
      const headers = new Headers();
      if (config.contentRange !== null) headers.set("Content-Range", config.contentRange);
      if (config.contentLength !== null) headers.set("Content-Length", config.contentLength);
      let offset = 0;
      const response = {
        status: config.status,
        type: config.type,
        redirected: config.redirected,
        headers,
        body: config.noStream
          ? null
          : {
              getReader: () => ({
                async read() {
                  readCalls++;
                  if (options.signal.aborted && !config.ignoreAbort)
                    throw new DOMException("aborted", "AbortError");
                  if (config.readPending) return new Promise(() => {});
                  return offset < config.chunks.length
                    ? { done: false, value: config.chunks[offset++] }
                    : { done: true };
                },
                async cancel() {
                  cancelled++;
                },
                releaseLock() {
                  released++;
                }
              })
            }
      };
      return response;
    }
  };
  vm.runInNewContext(source, context);
  const probe = context.createVidaaEmbeddedTextAccessProbe();
  return {
    probe,
    calls,
    events,
    timers,
    context,
    stats: () => ({ cancelled, released, readCalls })
  };
}

test("inert until run; three exact ranges and a real abort; bounded resident bytes; redacted report", async () => {
  const h = harness();
  assert.equal(h.calls.length, 0);
  assert.equal(h.events.size, 0);
  const report = await h.probe.run(plan);
  assert.equal(report.status, "access-verified");
  assert.equal(report.requests, 4);
  assert.ok(report.requestedBytes < fixture.buffer.length / 100);
  assert.equal(
    report.receivedBytes,
    fixture.header.length + fixture.cues.length + fixture.clusters[1].buffer.length
  );
  assert.ok(report.peakResidentBytes <= report.limits.residentBytes);
  assert.equal(report.residentBytes, 0);
  assert.deepEqual(
    Array.from(report.phases.slice(0, 3), (phase) => phase.expectedBytesMatch),
    [true, true, true]
  );
  for (const call of h.calls) {
    assert.equal(call.options.redirect, "error");
    assert.equal(call.options.mode, "cors");
    assert.equal(call.options.credentials, "omit");
    assert.equal(call.options.signal.aborted, true);
  }
  assert.equal(h.events.size, 0);
  assert.equal(h.timers.size, 0);
  assert.deepEqual(h.stats(), { cancelled: 4, released: 4, readCalls: 7 });
  assert.ok(!JSON.stringify(report).includes("secret"));
  assert.ok(!JSON.stringify(report).includes("Cue sul"));
  await assert.rejects(h.probe.run(plan), { code: "ONE_SHOT" });
});
for (const [name, change, expected] of [
  [
    "Range denied",
    (c) => {
      c.status = 200;
    },
    "RANGE_OR_REDIRECT_DENIED"
  ],
  [
    "redirect is rejected before following",
    (c) => {
      c.fetchError = new TypeError("secret redirect");
    },
    "TRANSPORT_UNAVAILABLE"
  ],
  [
    "opaque response",
    (c) => {
      c.type = "opaque";
    },
    "RANGE_OR_REDIRECT_DENIED"
  ],
  [
    "CORS hides Content-Range",
    (c) => {
      c.contentRange = null;
    },
    "CONTENT_RANGE_UNREADABLE_OR_MISMATCH"
  ],
  [
    "wrong range",
    (c) => {
      c.contentRange = "bytes 1-2/999";
    },
    "CONTENT_RANGE_UNREADABLE_OR_MISMATCH"
  ],
  [
    "auth denied",
    (c) => {
      c.status = 403;
    },
    "AUTH_DENIED"
  ],
  [
    "too large before reading",
    (c) => {
      c.contentLength = "999999999";
    },
    "RESPONSE_SIZE_MISMATCH"
  ],
  [
    "too large streamed",
    (c) => {
      c.contentLength = null;
      c.chunks = [new Uint8Array(300 * 1024)];
    },
    "BODY_BUDGET"
  ],
  [
    "short body",
    (c) => {
      c.chunks = [new Uint8Array(1)];
    },
    "TRUNCATED_BODY"
  ],
  [
    "wrong sample bytes",
    (c) => {
      c.chunks[0][0] ^= 1;
    },
    "SAMPLE_BYTES_MISMATCH"
  ],
  [
    "no streaming fallback to whole body",
    (c) => {
      c.noStream = true;
    },
    "STREAM_READER_UNAVAILABLE"
  ]
]) {
  test(name, async () => {
    const h = harness(change);
    const report = await h.probe.run(plan);
    assert.equal(report.status, "stopped");
    assert.equal(report.errorCode, expected);
    assert.equal(report.requests, 1);
    assert.equal(report.residentBytes, 0);
    assert.equal(h.events.size + h.timers.size, 0);
  });
}
test("already delivered abort is explicitly unverified", async () => {
  const h = harness((c, index) => {
    if (index === 4) c.ignoreAbort = true;
  });
  const report = await h.probe.run(plan);
  assert.equal(report.status, "abort-unverified");
  assert.equal(report.abortObserved, false);
  assert.equal(report.receivedBytes, report.requestedBytes);
});
test("timeout settles even when transport ignores the signal", async () => {
  const h = harness((c) => {
    c.readPending = true;
  });
  const pending = h.probe.run(plan);
  for (let i = 0; i < 10; i++) await Promise.resolve();
  [...h.timers.values()][0]();
  const report = await pending;
  assert.equal(report.errorCode, "TIMEOUT");
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].options.signal.aborted, true);
  assert.equal(h.events.size + h.timers.size, 0);
});
test("pagehide and explicit abort stop without any following range", async () => {
  for (const pagehide of [false, true]) {
    let config;
    const h = harness((c) => {
      c.fetchPending = true;
      config = c;
    });
    const pending = h.probe.run(plan);
    if (pagehide) h.events.get("pagehide")();
    else h.probe.stop();
    config.resolveFetch({});
    const report = await pending;
    assert.equal(report.errorCode, "CANCELLED");
    assert.equal(h.calls.length, 1);
    assert.equal(h.events.size + h.timers.size, 0);
  }
});
test("pre-aborted signal, oversized plan and whole-file plan cause zero traffic", async () => {
  const abort = new AbortController();
  abort.abort();
  const invalid = [
    { ...plan, signal: abort.signal },
    { ...plan, ranges: [{ ...plan.ranges[0], end: 129 * 1024 }, ...plan.ranges.slice(1)] },
    { ...plan, fileSize: plan.ranges[0].end + 1 },
    {
      ...plan,
      ranges: [{ ...plan.ranges[0], expectedHex: "ff".repeat(1025) }, ...plan.ranges.slice(1)]
    }
  ];
  for (const input of invalid) {
    const h = harness();
    assert.equal((await h.probe.run(input)).status, "stopped");
    assert.equal(h.calls.length, 0);
  }
});
test("auth configuration is applied without export of secrets or override of Range", async () => {
  const h = harness();
  const probe = h.context.createVidaaEmbeddedTextAccessProbe({
    headers: { Authorization: "Bearer SECRET" },
    credentials: "include"
  });
  const report = await probe.run(plan);
  assert.equal(report.status, "access-verified");
  assert.equal(h.calls[0].options.headers.get("Authorization"), "Bearer SECRET");
  assert.ok(!JSON.stringify(report).includes("SECRET"));
  const other = harness();
  const forbidden = other.context.createVidaaEmbeddedTextAccessProbe({
    headers: { Range: "bytes=0-" }
  });
  assert.equal((await forbidden.run(plan)).errorCode, "RESERVED_HEADER");
  assert.equal(other.calls.length, 0);
});

for (const { name, run } of tests) {
  await run();
  console.log(`PASS ${name}`);
}
console.log(
  `${tests.length}/${tests.length} access experiments passed (simulated transport; no TV/network).`
);
