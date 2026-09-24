import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { load } from "cheerio";
import { decodeAndroidStringEscapes } from "../js/i18n/androidStringEscapes.js";

async function readStringsFile(directory) {
  for (const fileName of ["strings.xml", "string.xml"]) {
    try {
      return {
        filePath: path.join(directory, fileName),
        source: await readFile(path.join(directory, fileName), "utf8")
      };
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw error;
      }
    }
  }
  throw new Error(`Missing strings.xml in ${directory}`);
}

function parseStringsXml(source, filePath) {
  const $ = load(source, { xmlMode: true, decodeEntities: true });
  const resourceNodes = $("resources");
  const stringNodes = $("string[name]");
  if (resourceNodes.length !== 1 || stringNodes.length === 0) {
    throw new Error(`Invalid or empty translations XML: ${filePath}`);
  }

  const messages = {};
  stringNodes.each((_, node) => {
    const name = String($(node).attr("name") || "").trim();
    if (name) {
      messages[name] = decodeAndroidStringEscapes($(node).text());
    }
  });
  if (Object.keys(messages).length === 0) {
    throw new Error(`No named string entries found in ${filePath}`);
  }
  return messages;
}

export async function buildI18nBundles({ rootDir, distDir }) {
  const sourceResDir = path.join(rootDir, "res");
  const outputDir = path.join(distDir, "res", "i18n");
  const baseFile = await readStringsFile(path.join(sourceResDir, "values"));
  const baseMessages = parseStringsXml(baseFile.source, baseFile.filePath);
  const localeDirectories = (await readdir(sourceResDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("values-"))
    .sort((left, right) => left.name.localeCompare(right.name));

  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });

  const messagesByLocale = new Map([["en", baseMessages]]);
  for (const entry of localeDirectories) {
    const locale = entry.name.slice("values-".length).toLowerCase();
    const localizedFile = await readStringsFile(path.join(sourceResDir, entry.name));
    const localizedMessages = parseStringsXml(localizedFile.source, localizedFile.filePath);
    messagesByLocale.set(locale, {
      ...(messagesByLocale.get(locale) || baseMessages),
      ...localizedMessages
    });
  }

  const locales = Array.from(messagesByLocale, ([locale, messages]) => ({ locale, messages }));
  for (const { locale, messages } of locales) {
    if (Object.values(messages).some((message) => typeof message !== "string")) {
      throw new Error(`Invalid translation values for locale ${locale}`);
    }
    await writeFile(path.join(outputDir, `${locale}.json`), JSON.stringify(messages), "utf8");
  }

  // Packages use the compiled dictionaries. Keep the base English XML as a
  // last-resort fallback and remove only duplicate localized XML from dist.
  for (const entry of localeDirectories) {
    for (const fileName of ["strings.xml", "string.xml"]) {
      await rm(path.join(distDir, "res", entry.name, fileName), { force: true });
    }
  }

  console.log(`precompiled translations for ${locales.length} locales`);
  return locales.length;
}
