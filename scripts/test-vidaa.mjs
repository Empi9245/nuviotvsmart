import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const directory = new URL("../tests/", import.meta.url);
const tests = (await readdir(directory)).filter(name=>/^test-vidaa-.+\.mjs$/.test(name)).sort();
for (const test of tests) {
  const result = spawnSync(process.execPath,[fileURLToPath(new URL(test,directory))],{stdio:"inherit"});
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`PASS: ${tests.length} VIDAA test suites. The real DOM Home check runs separately in tests/test-vidaa-home-patching.html.`);
