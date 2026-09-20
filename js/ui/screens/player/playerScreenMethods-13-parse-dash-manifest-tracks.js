export function createPlayerScreenMethods13() {
  return {
    parseDashManifestTracks(manifestText) {
      const parseErrorResult = {
        audioTracks: [],
        subtitleTracks: [],
        variants: []
      };

      const parser = typeof DOMParser === "function" ? new DOMParser() : null;
      if (!parser) {
        return parseErrorResult;
      }

      let xmlDocument = null;
      try {
        xmlDocument = parser.parseFromString(String(manifestText || ""), "application/xml");
      } catch (_) {
        return parseErrorResult;
      }
      if (!xmlDocument) {
        return parseErrorResult;
      }
      if (xmlDocument.getElementsByTagName("parsererror").length > 0) {
        return parseErrorResult;
      }

      const adaptationSets = Array.from(xmlDocument.getElementsByTagName("AdaptationSet"));
      if (!adaptationSets.length) {
        return parseErrorResult;
      }

      const audioTracks = [];
      const subtitleTracks = [];
      adaptationSets.forEach((adaptationSet, setIndex) => {
        const contentType = String(adaptationSet.getAttribute("contentType") || "").toLowerCase();
        const mimeType = String(adaptationSet.getAttribute("mimeType") || "").toLowerCase();
        const representation = adaptationSet.getElementsByTagName("Representation")[0] || null;
        const codecs = String(adaptationSet.getAttribute("codecs") || representation?.getAttribute("codecs") || "").toLowerCase();
        const roleValues = Array.from(adaptationSet.getElementsByTagName("Role"))
          .map((node) => String(node.getAttribute("value") || "").trim())
          .filter(Boolean);
        const accessibilityValues = Array.from(adaptationSet.getElementsByTagName("Accessibility"))
          .map((node) => String(node.getAttribute("value") || "").trim())
          .filter(Boolean);
        const audioChannelConfiguration =
          adaptationSet.getElementsByTagName("AudioChannelConfiguration")[0] ||
          representation?.getElementsByTagName("AudioChannelConfiguration")?.[0] ||
          null;
        const language = String(adaptationSet.getAttribute("lang") || representation?.getAttribute("lang") || "").trim();
        const label = String(adaptationSet.getAttribute("label") || representation?.getAttribute("label") || roleValues[0] || "").trim();
        const setId = String(adaptationSet.getAttribute("id") || setIndex).trim();
        const channels = String(audioChannelConfiguration?.getAttribute("value") || "").trim();
        const role = roleValues.join(" ");
        const accessibility = accessibilityValues.join(" ");

        const isAudio = contentType === "audio" || mimeType.startsWith("audio/");
        const isSubtitle =
          contentType === "text" ||
          mimeType.startsWith("text/") ||
          mimeType.includes("ttml") ||
          mimeType.includes("vtt") ||
          codecs.includes("stpp") ||
          codecs.includes("wvtt");

        if (isAudio) {
          audioTracks.push({
            id: `DASH::AUDIO::${setId}::${language || label || audioTracks.length + 1}`,
            groupId: setId,
            name: label || `Audio ${audioTracks.length + 1}`,
            language,
            channels,
            role,
            accessibility,
            codecs,
            uri: null,
            isDefault: audioTracks.length === 0
          });
        } else if (isSubtitle) {
          subtitleTracks.push({
            id: `DASH::SUBTITLES::${setId}::${language || label || subtitleTracks.length + 1}`,
            groupId: setId,
            name: label || `Subtitle ${subtitleTracks.length + 1}`,
            language,
            role,
            accessibility,
            uri: null,
            isDefault: subtitleTracks.length === 0
          });
        }
      });

      return {
        audioTracks,
        subtitleTracks,
        variants: []
      };
    },
    parseManifestTracks(manifestText, manifestUrl) {
      const text = String(manifestText || "");
      if (!text) {
        return { audioTracks: [], subtitleTracks: [], variants: [] };
      }
      if (text.includes("#EXTM3U")) {
        return this.parseHlsManifestTracks(text, manifestUrl);
      }
      if (/<\s*MPD[\s>]/i.test(text)) {
        return this.parseDashManifestTracks(text);
      }
      return { audioTracks: [], subtitleTracks: [], variants: [] };
    }
  };
}
