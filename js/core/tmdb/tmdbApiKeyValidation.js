import { fetchTmdbJson } from "./tmdbTransport.js";

export async function validateTmdbApiKey(value) {
  const apiKey = String(value || "").trim();
  if (!apiKey) return false;
  try {
    const data = await fetchTmdbJson(
      `https://api.themoviedb.org/3/authentication?api_key=${encodeURIComponent(apiKey)}`,
      { throwOnHttpError: true }
    );
    return data?.success === true;
  } catch (error) {
    if (Number(error?.status) === 401 || Number(error?.status) === 403) return false;
    throw error;
  }
}
