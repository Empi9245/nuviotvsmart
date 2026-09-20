/* eslint-disable no-unused-vars */
import * as internals from "./playerScreenContext.js";

export function createPlayerScreenMethods42() {
  const {
    localMediaSubtitleRepository,
    Environment,
    TizenEngineFsService,
    isAssSubtitle,
    convertAssBodyToVtt,
    decodeSubtitleResponseBody,
    sanitizeSubtitleMojibake
  } = internals;

  return {
    createSubtitleObjectUrl(body, sourceUrl = "", contentType = "") {
      const normalizedContentType = String(contentType || "").toLowerCase();
      const assBody = isAssSubtitle(body, { sourceUrl, contentType: normalizedContentType });
      const shouldConvertToVtt =
        this.isLikelySrtSubtitleUrl(sourceUrl) ||
        normalizedContentType.includes("subrip") ||
        (!normalizedContentType.includes("vtt") && !/^\s*WEBVTT/i.test(body));
      const vttText = assBody
        ? convertAssBodyToVtt(body)
        : shouldConvertToVtt
          ? this.convertSrtToVtt(body)
          : this.applySubtitleAssAlignmentToVtt(body);
      const objectUrl = URL.createObjectURL(new Blob([vttText], { type: "text/vtt" }));
      this.externalSubtitleObjectUrls.push(objectUrl);
      return objectUrl;
    },
    sanitizeSubtitleText(content, { preserveBasicStyle = false } = {}) {
      const source = String(content || "");
      const openTags = [];
      const closeTag = (tag) => {
        const output = [];
        for (let index = openTags.length - 1; index >= 0; index -= 1) {
          const activeTag = openTags[index];
          output.push(`</${activeTag}>`);
          openTags.splice(index, 1);
          if (activeTag === tag) {
            break;
          }
        }
        return output.join("");
      };
      const openTag = (tag) => {
        if (openTags.includes(tag)) {
          return "";
        }
        openTags.push(tag);
        return `<${tag}>`;
      };

      const normalized = source.replace(/\\[Nn]/g, "\n").replace(/\\h/g, " ");

      const converted = normalized.replace(/\{[^}]*\}/g, (block) => {
        if (!preserveBasicStyle) {
          return "";
        }
        let output = "";
        const commandPattern = /\\([ibu])([01])\b|\\r\b/gi;
        let match;
        while ((match = commandPattern.exec(block)) !== null) {
          if (match[0].toLowerCase() === "\\r") {
            output += closeTag("u") + closeTag("i") + closeTag("b");
            continue;
          }
          const tag = String(match[1] || "").toLowerCase();
          const enabled = String(match[2] || "") === "1";
          if (tag === "i") {
            output += enabled ? openTag("i") : closeTag("i");
          } else if (tag === "b") {
            output += enabled ? openTag("b") : closeTag("b");
          } else if (tag === "u") {
            output += enabled ? openTag("u") : closeTag("u");
          }
        }
        return output;
      });

      return `${converted}${closeTag("u")}${closeTag("i")}${closeTag("b")}`;
    },
    buildVttAlignmentSettings(alignment) {
      const settings = this.getSubtitleAssAlignmentSettings(alignment);
      if (!settings) {
        return "";
      }
      return `line:${settings.line}% align:${settings.align}`;
    },
    applySubtitleAssAlignmentToVtt(content) {
      const normalized = String(content || "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n");
      if (!this.hasSubtitleAssSyntax(normalized)) {
        return normalized;
      }
      return normalized
        .split(/\n{2,}/)
        .map((block) => {
          const alignment = this.getSubtitleAssAlignment(block);
          const settings = this.buildVttAlignmentSettings(alignment);
          if (!settings) {
            return this.sanitizeSubtitleText(block, { preserveBasicStyle: true });
          }

          const lines = block.split("\n");
          const timingIndex = lines.findIndex((line) => line.includes("-->"));
          if (timingIndex < 0) {
            return this.sanitizeSubtitleText(block, { preserveBasicStyle: true });
          }

          const timingLine = lines[timingIndex];
          const alignmentSettings = this.getSubtitleAssAlignmentSettings(alignment);
          const nextTimingLine = [
            /\sline:/i.test(timingLine) ? "" : `line:${alignmentSettings.line}%`,
            /\salign:/i.test(timingLine) ? "" : `align:${alignmentSettings.align}`
          ]
            .filter(Boolean)
            .join(" ");
          if (nextTimingLine) {
            lines[timingIndex] = `${timingLine} ${nextTimingLine}`;
          }
          return this.sanitizeSubtitleText(lines.join("\n"), { preserveBasicStyle: true });
        })
        .join("\n\n");
    },
    convertSrtToVtt(content) {
      const raw = String(content || "")
        .replace(/^\uFEFF/, "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n");
      if (!raw.trim()) {
        return "WEBVTT\n\n";
      }
      if (/^\s*WEBVTT/i.test(raw)) {
        return this.applySubtitleAssAlignmentToVtt(raw);
      }
      const withHours = raw.replace(/(\b\d{1,2}:\d{2}:\d{2}),(\d{3}\b)/g, "$1.$2");
      const normalized = withHours.replace(/(\b\d{1,2}:\d{2}),(\d{3}\b)/g, "00:$1.$2");
      return this.applySubtitleAssAlignmentToVtt(`WEBVTT\n\n${normalized}`);
    },
    async fetchSubtitleRawBody(url, { timeoutMs = 0, languageHint = "", subtitleHeaders = {}, originalSubtitleUrl = url } = {}) {
      const original = String(url || "").trim();
      if (!original) {
        return null;
      }
      if (/^(blob:|data:)/i.test(original)) {
        return { body: null, sourceUrl: original, contentType: "", resolvedUrl: original };
      }
      const effectiveTimeoutMs = Number(timeoutMs) > 0 ? Number(timeoutMs) : Environment.isWebOS() ? 5000 : 0;
      const requestController = typeof AbortController === "function" && effectiveTimeoutMs > 0 ? new AbortController() : null;
      let requestTimeoutId = null;
      try {
        const performRequest = async () => {
          const requestOptions = {
            mode: "cors",
            redirect: "manual",
            ...(requestController ? { signal: requestController.signal } : {})
          };
          let currentUrl = original;
          for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
            const response = await fetch(currentUrl, {
              ...requestOptions,
              headers: this.getSubtitleRequestHeaders(currentUrl, {
                subtitleHeaders,
                originalSubtitleUrl
              })
            });
            if (response.type === "opaqueredirect" || response.status === 0) {
              // Some TV browsers hide Location for a cross-origin redirect.
              // Retry with no custom headers so unknown redirect targets never
              // receive stream or subtitle credentials.
              return fetch(original, {
                ...requestOptions,
                redirect: "follow",
                headers: {}
              });
            }
            if (response.status < 300 || response.status >= 400) {
              return response;
            }
            const location = response.headers?.get?.("location") || "";
            if (!location || redirectCount === 3) {
              return fetch(original, {
                ...requestOptions,
                redirect: "follow",
                headers: {}
              });
            }
            try {
              currentUrl = new URL(location, currentUrl).toString();
            } catch (_) {
              return fetch(original, {
                ...requestOptions,
                redirect: "follow",
                headers: {}
              });
            }
          }
          throw new Error("Subtitle redirect chain exceeded the safe limit");
        };
        const response =
          effectiveTimeoutMs > 0
            ? await Promise.race([
                performRequest(),
                new Promise((_, reject) => {
                  requestTimeoutId = setTimeout(() => {
                    try {
                      requestController?.abort();
                    } catch (_) {
                      // Ignore abort failures.
                    }
                    reject(new Error("Subtitle request timed out"));
                  }, effectiveTimeoutMs);
                })
              ])
            : await performRequest();
        if (!response.ok) {
          throw new Error(`Subtitle request failed with HTTP ${response.status}`);
        }
        const contentType = String(response.headers?.get("content-type") || "").toLowerCase();
        const decodedBody =
          typeof TextDecoder === "function" ? await decodeSubtitleResponseBody(response, { languageHint, contentType }) : null;
        const body = sanitizeSubtitleMojibake(decodedBody ?? (await response.text()));
        return { body, sourceUrl: original, contentType, resolvedUrl: response.url || original };
      } catch (directError) {
        if (Environment.isWebOS()) {
          try {
            const resolved = await localMediaSubtitleRepository.getExternalSubtitleText(original);
            return {
              body: sanitizeSubtitleMojibake(resolved.body),
              sourceUrl: original,
              contentType: resolved.contentType,
              resolvedUrl: resolved.resolvedUrl || original
            };
          } catch (proxyError) {
            console.warn("webOS subtitle resolver failed", {
              subtitleUrl: original,
              directError: directError?.message || String(directError || ""),
              proxyError: proxyError?.message || String(proxyError || "")
            });
            return null;
          }
        }
        throw directError;
      } finally {
        if (requestTimeoutId) {
          clearTimeout(requestTimeoutId);
        }
      }
    },
    async resolveSubtitlePlaybackUrl(url, { timeoutMs = 0, languageHint = "", subtitleHeaders = {}, originalSubtitleUrl = url } = {}) {
      const original = String(url || "").trim();
      if (!original) {
        return "";
      }
      if (/^(blob:|data:)/i.test(original)) {
        return original;
      }
      try {
        const raw = await this.fetchSubtitleRawBody(url, {
          timeoutMs,
          languageHint,
          subtitleHeaders,
          originalSubtitleUrl
        });
        if (!raw) {
          return "";
        }
        return this.createSubtitleObjectUrl(raw.body, raw.sourceUrl, raw.contentType);
      } catch (_) {
        // Direct fetch failed on a non-webOS platform: fall back to the
        // original URL so the browser <track> can try it directly.
        return original;
      }
    },
    async resolveTizenAvPlaySubtitleUrl(url) {
      const original = String(url || "").trim();
      if (!original || !Environment.isTizen()) {
        return "";
      }
      if (!/^https?:\/\//i.test(original)) {
        return original;
      }
      try {
        const service = await TizenEngineFsService.ensureStarted();
        const baseUrl = String(service?.baseUrl || "").replace(/\/+$/, "");
        if (service?.status !== "success" || !baseUrl) {
          return original;
        }
        return `${baseUrl}/subtitles.vtt?from=${encodeURIComponent(original)}`;
      } catch (error) {
        console.warn("Tizen subtitle proxy unavailable", {
          subtitleUrl: original,
          error: error?.message || String(error || "")
        });
        return original;
      }
    },
    parseSubtitleTimestamp(value = "") {
      const match = String(value || "")
        .trim()
        .match(/(?:(\d+):)?(\d{1,2}):(\d{2})[,.](\d{1,3})/);
      if (!match) {
        return NaN;
      }
      const hours = Number(match[1] || 0);
      const minutes = Number(match[2] || 0);
      const seconds = Number(match[3] || 0);
      const milliseconds = Number(
        String(match[4] || "0")
          .padEnd(3, "0")
          .slice(0, 3)
      );
      return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
    },
    decodeSubtitleEntities(value = "") {
      const text = String(value || "");
      if (!text.includes("&")) {
        return text;
      }
      try {
        const textarea = document.createElement("textarea");
        textarea.innerHTML = text;
        return textarea.value;
      } catch (_) {
        return text
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'");
      }
    },
    parseSubtitleCueText(text = "") {
      return this.decodeSubtitleEntities(
        this.sanitizeSubtitleText(String(text || ""), { preserveBasicStyle: false }).replace(/<[^>]*>/g, "")
      ).trim();
    }
  };
}
