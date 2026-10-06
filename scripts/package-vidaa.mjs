import { access, cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { readAppMetadata } from "./appMetadata.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const vidaaDistDir = path.join(rootDir, "dist", "vidaa");
const installerSourceDir = path.join(rootDir, "installer");
const zipOutputPath = path.join(rootDir, "dist", "nuvio-vidaa.zip");

async function assertDistExists() {
  try {
    await access(path.join(distDir, "app.bundle.js"), fsConstants.R_OK);
    await access(path.join(distDir, "index.html"), fsConstants.R_OK);
  } catch {
    throw new Error(`Build output not found at ${distDir}. Run "npm run build" first.`);
  }
}

async function addDirectoryToZip(zip, currentDir, rootPath = currentDir) {
  const entries = await readdir(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    const relativePath = path.relative(rootPath, fullPath).replace(/\\/g, "/");

    if (entry.isDirectory()) {
      await addDirectoryToZip(zip, fullPath, rootPath);
    } else if (entry.isFile()) {
      const data = await readFile(fullPath);
      zip.file(relativePath, data);
    }
  }
}

async function packageVidaa() {
  console.log("Validating dist directory...");
  await assertDistExists();

  const { version, name } = await readAppMetadata();
  console.log(`Packaging Nuvio TV v${version} for VIDAA OS...`);

  // Clean staging
  await rm(vidaaDistDir, { recursive: true, force: true });
  await mkdir(vidaaDistDir, { recursive: true });

  // Copy dist contents (excluding vidaa subdirectory itself)
  const distEntries = await readdir(distDir, { withFileTypes: true });
  for (const entry of distEntries) {
    if (entry.name === "vidaa" || entry.name.endsWith(".zip")) continue;
    const srcPath = path.join(distDir, entry.name);
    const destPath = path.join(vidaaDistDir, entry.name);
    await cp(srcPath, destPath, { recursive: true });
  }

  // Give each VIDAA app shell its own asset URLs and offline cache. Keep the
  // shared dist unchanged for the Tizen and webOS packagers.
  const workerSource = await readFile(path.join(rootDir, "sw.js"), "utf8");
  const shellFiles = [
    "index.html",
    "app.bundle.js",
    "core-js.bundle.js",
    "css/bundle.css",
    "nuvio.env.js",
    "boot-guard.js",
    "assets/runtime/legacy-features.js"
  ];
  const shellHash = createHash("sha256").update(workerSource);
  for (const file of shellFiles) {
    shellHash.update(file).update(await readFile(path.join(vidaaDistDir, file)));
  }
  const buildId = shellHash.digest("hex").slice(0, 16);
  const indexPath = path.join(vidaaDistDir, "index.html");
  const indexSource = await readFile(indexPath, "utf8");
  const versionedIndex = indexSource.replace(
    /((?:src|href)=")([^"?#]+\.(?:js|css))(?:\?[^"#]*)?("|#[^"]*")/g,
    (match, prefix, asset, suffix) => {
      if (/^(?:[a-z]+:|\/\/)/i.test(asset)) return match;
      return `${prefix}${asset}?v=${buildId}${suffix}`;
    }
  );
  const versionedWorker = workerSource.replace(
    /^var CACHE_NAME = "[^"]+";/,
    `var CACHE_NAME = "nuvio-vidaa-${buildId}";`
  );
  await Promise.all([
    writeFile(indexPath, versionedIndex),
    writeFile(path.join(vidaaDistDir, "sw.js"), versionedWorker),
    cp(path.join(rootDir, "manifest.json"), path.join(vidaaDistDir, "manifest.json"))
  ]);

  // Copy installer directory
  try {
    await cp(installerSourceDir, path.join(vidaaDistDir, "installer"), { recursive: true });
  } catch (err) {
    console.warn("Notice: installer directory could not be copied:", err.message);
  }

  // Create ZIP package
  console.log("Generating ZIP package (nuvio-vidaa.zip)...");
  const zip = new JSZip();
  await addDirectoryToZip(zip, vidaaDistDir);
  const zipBuffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 }
  });

  await writeFile(zipOutputPath, zipBuffer);
  const zipStats = await stat(zipOutputPath);

  console.log("\n=======================================================");
  console.log("  Nuvio TV VIDAA web archive created");
  console.log("=======================================================");
  console.log(`  Package directory : ${vidaaDistDir}`);
  console.log(
    `  Release archive   : ${zipOutputPath} (${(zipStats.size / (1024 * 1024)).toFixed(2)} MB)`
  );
  console.log(`  Application ID    : space.nuvio.tv`);
  console.log("=======================================================\n");
}

try {
  await packageVidaa();
} catch (error) {
  console.error("\nVIDAA packaging failed:");
  console.error(error);
  process.exit(1);
}
