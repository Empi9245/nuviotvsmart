import { access, cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
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

  // VIDAA-only hosted/PWA assets must not leak into Tizen/webOS dist packages.
  await Promise.all([
    cp(path.join(rootDir, "sw.js"), path.join(vidaaDistDir, "sw.js")),
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
  console.log("  Nuvio TV VIDAA OS Package Created Successfully!");
  console.log("=======================================================");
  console.log(`  Package directory : ${vidaaDistDir}`);
  console.log(
    `  Release archive   : ${zipOutputPath} (${(zipStats.size / (1024 * 1024)).toFixed(2)} MB)`
  );
  console.log(`  Application ID    : space.nuvio.tv`);
  console.log(`  Target Platforms  : Hisense VIDAA U5/U6/U7/U8+ TVs & Projectors`);
  console.log("-------------------------------------------------------");
  console.log("  How to install on Hisense U7Q:");
  console.log("   1. Method 1 (Universal Web / PWA):");
  console.log("      Host this directory or use 'npm run serve:vidaa'");
  console.log("      Open the URL in the TV browser and bookmark it.");
  console.log("   2. Method 2 (Home Screen Launcher Icon):");
  console.log("      Run 'sudo python3 installer/server.py'");
  console.log("      Set TV DNS to your PC IP, go to https://vidaahub.com on TV,");
  console.log("      and click 'Install to TV Launcher'.");
  console.log("=======================================================\n");
}

try {
  await packageVidaa();
} catch (error) {
  console.error("\nVIDAA packaging failed:");
  console.error(error);
  process.exit(1);
}
