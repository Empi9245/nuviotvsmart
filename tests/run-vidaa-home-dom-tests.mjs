import http from "node:http";
import path from "node:path";
import os from "node:os";
import { access, mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { spawn, execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

const workspace = fileURLToPath(new URL("../", import.meta.url));
const defaultFixtures = [
  "test-vidaa-home-patching.html",
  "test-vidaa-home-window.html",
  "test-vidaa-home-poster-expansion.html",
  "test-vidaa-navigation-stress.html",
  "test-vidaa-home-row-updates.html"
];
const fixtures = process.argv.slice(2).length ? process.argv.slice(2) : defaultFixtures;
const allowedFixtures = new Set(defaultFixtures.map((fixture) => fixture.split("?")[0]));
for (const fixture of fixtures) {
  if (!allowedFixtures.has(fixture.split("?")[0]))
    throw Error(`Unknown Home DOM fixture: ${fixture}`);
}
const timeoutMs = 30000;
const activeBrowsers = new Set();
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm"
};

async function findBrowser() {
  const candidates = [
    process.env.NUVIO_TV_TEST_BROWSER,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      /* Try the next installed browser. */
    }
  }
  throw Error(
    "Chrome or Edge was not found. Set NUVIO_TV_TEST_BROWSER to an installed browser executable."
  );
}

function insideDirectory(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return (
    relative !== "" &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

async function stopBrowser(child) {
  if (!activeBrowsers.has(child)) return;
  if (process.platform === "win32" && Number.isInteger(child.pid) && child.pid > 0) {
    await new Promise((resolve) => {
      execFile(
        "taskkill.exe",
        ["/PID", String(child.pid), "/T", "/F"],
        { windowsHide: true, timeout: 5000 },
        () => resolve()
      );
    });
  } else child.kill("SIGKILL");
  activeBrowsers.delete(child);
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function captureBrowser(browser, profile, url) {
  const child = spawn(
    browser,
    [
      "--headless=new",
      "--remote-debugging-pipe",
      "--window-size=1920,1080",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-extensions",
      "--disable-sync",
      "--metrics-recording-only",
      "--mute-audio",
      `--user-data-dir=${profile}`,
      "about:blank"
    ],
    { windowsHide: true, stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"] }
  );
  activeBrowsers.add(child);
  let nextCommandId = 0,
    protocolBuffer = "",
    stderr = "",
    closed = false,
    closeError;
  const commands = new Map();
  let resolveClosed;
  const browserClosed = new Promise((resolve) => {
    resolveClosed = resolve;
  });
  const failCommands = (error) => {
    closeError = error;
    commands.forEach(({ reject }) => reject(error));
    commands.clear();
  };
  child.stderr.on("data", (chunk) => {
    stderr = (stderr + chunk).slice(-4000);
  });
  child.on("error", failCommands);
  child.on("close", (code) => {
    closed = true;
    activeBrowsers.delete(child);
    failCommands(closeError || Error(`Browser exited with ${code}: ${stderr.trim()}`));
    resolveClosed();
  });
  child.stdio[4].on("data", (chunk) => {
    protocolBuffer += chunk;
    let delimiter;
    while ((delimiter = protocolBuffer.indexOf("\0")) >= 0) {
      const message = JSON.parse(protocolBuffer.slice(0, delimiter));
      protocolBuffer = protocolBuffer.slice(delimiter + 1);
      const command = commands.get(message.id);
      if (!command) continue;
      commands.delete(message.id);
      if (message.error) command.reject(Error(message.error.message));
      else command.resolve(message.result);
    }
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      if (closed || closeError) {
        reject(closeError || Error("Browser closed"));
        return;
      }
      const id = ++nextCommandId;
      commands.set(id, { resolve, reject });
      child.stdio[3].write(
        `${JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })}\0`,
        (error) => {
          if (error) {
            commands.delete(id);
            reject(error);
          }
        }
      );
    });
  const timer = setTimeout(() => {
    failCommands(Error(`Browser fixture timed out after ${timeoutMs / 1000}s: ${url}`));
    void stopBrowser(child);
  }, timeoutMs);
  try {
    // Read only the fixture result over a local pipe. Real browser time keeps
    // RAF/timer maintenance representative; virtual time distorts stress tests.
    const { targetId } = await send("Target.createTarget", { url });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    for (;;) {
      const sample = await send(
        "Runtime.evaluate",
        {
          expression:
            "(() => { const result = document.getElementById('result'); return result ? { status: result.dataset.status || '', text: result.textContent || '' } : null; })()",
          returnByValue: true
        },
        sessionId
      );
      const result = sample.result?.value;
      if (result && (result.status || /\b(?:PASS|FAIL)\s*:/i.test(result.text))) return result;
      await delay(75);
    }
  } finally {
    clearTimeout(timer);
    if (!closed && !closeError) {
      await send("Browser.close").catch(() => {});
      await Promise.race([browserClosed, delay(2000)]);
    }
    if (!closed) await stopBrowser(child);
  }
}

function fixtureResult(result) {
  const text = result.text.trim();
  const status = result.status.toLowerCase();
  if (["failed", "fail", "error"].includes(status) || /\bFAIL\s*:/i.test(text)) throw Error(text);
  if (["passed", "pass", "success"].includes(status) || /\bPASS\s*:/i.test(text)) return text;
  throw Error(`Fixture did not complete with PASS or FAIL: ${text}`);
}

const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1/").pathname);
    const file = path.resolve(workspace, `.${pathname}`);
    if (!insideDirectory(workspace, file) || !mimeTypes[path.extname(file).toLowerCase()]) {
      response.writeHead(404).end();
      return;
    }
    const contents = await readFile(file);
    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(file).toLowerCase()],
      "Cache-Control": "no-store"
    });
    response.end(contents);
  } catch {
    response.writeHead(404).end();
  }
});
let profileRoot;
try {
  const browser = await findBrowser();
  // This server reads the source checkout directly; dist never shadows fixtures
  // or imported source modules. It binds only the local loopback interface.
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  profileRoot = await mkdtemp(path.join(os.tmpdir(), "nuvio-vidaa-dom-"));
  console.log(`Home DOM browser: ${path.basename(browser)}`);
  for (const [index, fixture] of fixtures.entries()) {
    await access(path.join(workspace, "tests", fixture.split("?")[0]));
    const profile = path.join(profileRoot, String(index));
    await mkdir(profile);
    const url = `http://127.0.0.1:${server.address().port}/tests/${fixture}`;
    const result = fixtureResult(await captureBrowser(browser, profile, url));
    console.log(`${fixture}: ${result}`);
  }
  console.log(
    `PASS: ${fixtures.length} Home DOM browser fixtures. These checks do not measure TV FPS.`
  );
} finally {
  await Promise.all([...activeBrowsers].map(stopBrowser));
  if (server.listening) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  if (profileRoot) {
    // Validate the exact generated target before recursive deletion on Windows.
    if (
      !insideDirectory(os.tmpdir(), profileRoot) ||
      !path.basename(profileRoot).startsWith("nuvio-vidaa-dom-")
    )
      throw Error("Refusing to remove a profile outside the allocated test directory");
    await rm(profileRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
  }
}
