import { access, readFile, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";

export const ENV_PROPERTY_KEYS = [
  "NUVIO_ACCOUNT_BACKEND_MODE",
  "NUVIO_SUPABASE_URL",
  "NUVIO_SUPABASE_ANON_KEY",
  "NUVIO_SUPABASE_FALLBACK_URL",
  "TV_LOGIN_WEB_BASE_URL",
  "DEVICE_LOGIN_WEB_BASE_URL",
  "YOUTUBE_PROXY_URL",
  "INTRODB_API_URL",
  "IMDB_RATINGS_API_BASE_URL",
  "IMDB_TAPFRAME_API_BASE_URL",
  "AVATAR_PUBLIC_BASE_URL",
  "UNIQUE_CONTRIBUTIONS_BASE_URL",
  "SUPPORTERS_API_BASE_URL",
  "SUPPORT_URL",
  "SPONSOR_NAMES",
  "TMDB_API_KEY",
  "TRAKT_CLIENT_ID",
  "TRAKT_CLIENT_SECRET",
  "SIMKL_CLIENT_ID",
  "SIMKL_APP_NAME",
  "PREMIUMIZE_CLIENT_ID"
];

const DEFAULT_ENV_VALUES = {
  NUVIO_ACCOUNT_BACKEND_MODE: "",
  NUVIO_SUPABASE_URL: "https://api.nuvio.tv",
  NUVIO_SUPABASE_ANON_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzgxNTIxMzQ2LCJleHAiOjE5MzkyMDEzNDZ9.tmQaj682pwzehpqlgCDMnySOqiUvpgRbrE43T4VJpDI",
  NUVIO_SUPABASE_FALLBACK_URL: "",
  TV_LOGIN_WEB_BASE_URL: "https://nuvio.tv/tv-login",
  DEVICE_LOGIN_WEB_BASE_URL: "https://nuvio.tv/link",
  YOUTUBE_PROXY_URL: "youtube-proxy.html",
  INTRODB_API_URL: "https://api.introdb.app/",
  IMDB_RATINGS_API_BASE_URL: "",
  IMDB_TAPFRAME_API_BASE_URL: "",
  AVATAR_PUBLIC_BASE_URL: "",
  UNIQUE_CONTRIBUTIONS_BASE_URL: "",
  SUPPORTERS_API_BASE_URL: "https://nuvio.tv/",
  SUPPORT_URL: "https://nuvio.tv/support",
  SPONSOR_NAMES: "ragmehos.",
  TMDB_API_KEY: "",
  TRAKT_CLIENT_ID: "",
  TRAKT_CLIENT_SECRET: "",
  SIMKL_CLIENT_ID: "",
  SIMKL_APP_NAME: "nuvio",
  PREMIUMIZE_CLIENT_ID: ""
};

async function pathExists(filePath) {
  try {
    await access(filePath, fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function unescapePropertyValue(value = "") {
  return String(value)
    .replace(/\\:/g, ":")
    .replace(/\\=/g, "=")
    .replace(/\\#/g, "#")
    .replace(/\\!/g, "!")
    .replace(/\\\\/g, "\\");
}

export function parseProperties(source = "") {
  const properties = {};
  String(source || "")
    .split(/\r?\n/)
    .forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("!")) {
        return;
      }
      const separatorIndex = trimmed.search(/[:=]/);
      if (separatorIndex < 0) {
        properties[trimmed] = "";
        return;
      }
      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim();
      if (key) {
        properties[key] = unescapePropertyValue(value);
      }
    });
  return properties;
}

export function normalizeEnvProperties(properties = {}) {
  properties = { ...properties, NUVIO_ACCOUNT_BACKEND_MODE: String(properties.NUVIO_ACCOUNT_BACKEND_MODE || "").trim().toLowerCase() };
  const env = {};
  ENV_PROPERTY_KEYS.forEach((key) => {
    const rawValue = Object.prototype.hasOwnProperty.call(properties, key)
      ? properties[key]
      : properties.NUVIO_ACCOUNT_BACKEND_MODE === "shared" && (key === "NUVIO_SUPABASE_URL" || key === "NUVIO_SUPABASE_ANON_KEY")
        ? ""
        : DEFAULT_ENV_VALUES[key];
    const normalizedValue = String(rawValue ?? "");
    const shouldUseDefault =
      (key === "INTRODB_API_URL" ||
        key === "SPONSOR_NAMES" ||
        ((key === "NUVIO_SUPABASE_URL" || key === "NUVIO_SUPABASE_ANON_KEY") && properties.NUVIO_ACCOUNT_BACKEND_MODE !== "shared")) &&
      !normalizedValue.trim();
    env[key] = shouldUseDefault ? DEFAULT_ENV_VALUES[key] : normalizedValue;
  });
  const key = env.NUVIO_SUPABASE_ANON_KEY.trim();
  env.NUVIO_SUPABASE_ANON_KEY = key;
  let isPublicKey = key.startsWith("sb_publishable_") && key.length > 20;
  if (key.startsWith("sb_secret_")) throw new Error("The app requires a public Supabase key, never a secret key.");
  if (key.split(".").length === 3) {
    let payload = null;
    try { payload = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString("utf8")); } catch (_) {}
    if (payload?.role && payload.role !== "anon") throw new Error("The app requires an anon or publishable Supabase key.");
    isPublicKey = payload?.role === "anon";
  }
  if (env.NUVIO_ACCOUNT_BACKEND_MODE === "shared") {
    if (!isPublicKey) throw new Error("Shared backend requires a valid publishable or anon key.");
    const url = new URL(env.NUVIO_SUPABASE_URL);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
      throw new Error("Shared backend requires a public HTTPS URL without credentials.");
    }
  }
  return env;
}

export async function resolveLocalPropertiesSource({ rootDir, sourcePath = "" } = {}) {
  const candidates = [];
  if (sourcePath) {
    candidates.push(path.resolve(sourcePath));
  } else if (process.env.NUVIO_LOCAL_PROPERTIES) {
    candidates.push(path.resolve(process.env.NUVIO_LOCAL_PROPERTIES));
  } else {
    candidates.push(path.join(rootDir, "local.properties"));
    candidates.push(path.join(rootDir, "supabase", "shared.properties"));
    candidates.push(path.join(rootDir, "local.example.properties"));
  }

  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }
  return "";
}

export async function readEnvProperties({ rootDir, sourcePath = "" } = {}) {
  const resolvedSourcePath = await resolveLocalPropertiesSource({ rootDir, sourcePath });
  if (!resolvedSourcePath) {
    return {
      sourcePath: "",
      env: normalizeEnvProperties({})
    };
  }
  if (/\.js$/i.test(resolvedSourcePath)) {
    throw new Error(
      `Runtime env JavaScript files are no longer supported as config sources. Use local.properties instead: ${resolvedSourcePath}`
    );
  }
  const properties = parseProperties(await readFile(resolvedSourcePath, "utf8"));
  return {
    sourcePath: resolvedSourcePath,
    env: normalizeEnvProperties(properties)
  };
}

export function buildRuntimeEnvScript(env = {}) {
  const values = normalizeEnvProperties(env);
  return `(function defineNuvioEnv() {
  var root = typeof globalThis !== "undefined" ? globalThis : window;
  var env = root.__NUVIO_ENV__ || {};
  var values = ${JSON.stringify(values, null, 2)};
  for (var key in values) {
    if (Object.prototype.hasOwnProperty.call(values, key)) {
      env[key] = values[key];
    }
  }
  root.__NUVIO_ENV__ = env;
}());
`;
}

export async function writeRuntimeEnvScriptFile(targetPath, { rootDir, sourcePath = "" } = {}) {
  const result = await readEnvProperties({ rootDir, sourcePath });
  await writeFile(targetPath, buildRuntimeEnvScript(result.env), "utf8");
  return result;
}
