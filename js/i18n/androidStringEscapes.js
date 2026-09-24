export function decodeAndroidStringEscapes(value) {
  return String(value ?? "")
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/\\n/g, "\n");
}
