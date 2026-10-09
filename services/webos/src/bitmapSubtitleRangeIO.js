// Node HTTP I/O only. Keep it outside the reusable Matroska parser.
module.exports = function createRangeReader(dependencies) {
  var {
    http,
    https,
    net,
    bitmapSubtitleError,
    MIN_ADDRESS_ATTEMPT_TIMEOUT_MS,
    MAX_REDIRECTS,
    REQUEST_TIMEOUT_MS
  } = dependencies;
  function requestRange(url, start, end, maxBytes, redirects, requestContext) {
    var redirectCount = Number(redirects || 0);
    return new Promise(function (resolve, reject) {
      if (requestContext && requestContext.cancelled) {
        reject(bitmapSubtitleError("REQUEST_SUPERSEDED", "Bitmap subtitle request was superseded"));
        return;
      }
      var parsed;
      try {
        parsed = new URL(url);
      } catch (_) {
        reject(bitmapSubtitleError("INVALID_URL", "Invalid bitmap subtitle range URL"));
        return;
      }

      var transport = parsed.protocol === "https:" ? https : http;
      var req = transport.request(
        parsed,
        {
          method: "GET",
          // Node 20 can abandon a viable IPv4 connection after 250 ms, then
          // fail on unroutable IPv6. Keep dual-stack selection, but allow the
          // measured slow handshakes without changing process-wide defaults.
          autoSelectFamilyAttemptTimeout:
            typeof net.getDefaultAutoSelectFamilyAttemptTimeout === "function"
              ? Math.max(
                  MIN_ADDRESS_ATTEMPT_TIMEOUT_MS,
                  net.getDefaultAutoSelectFamilyAttemptTimeout()
                )
              : undefined,
          headers: {
            Range: "bytes=" + start + "-" + end,
            "Accept-Encoding": "identity",
            "User-Agent": "NuvioTV/bitmap-subtitles"
          }
        },
        function (res) {
          var statusCode = Number(res.statusCode || 0);
          if (statusCode >= 300 && statusCode < 400 && res.headers.location) {
            res.resume();
            if (requestContext) requestContext.requests.delete(req);
            if (redirectCount >= MAX_REDIRECTS) {
              reject(
                bitmapSubtitleError(
                  "TOO_MANY_REDIRECTS",
                  "Bitmap subtitle source redirected too many times"
                )
              );
              return;
            }
            var redirected = new URL(res.headers.location, parsed).href;
            requestRange(redirected, start, end, maxBytes, redirectCount + 1, requestContext).then(
              resolve,
              reject
            );
            return;
          }

          if (statusCode !== 206 && !(statusCode === 200 && start === 0)) {
            res.resume();
            if (requestContext) requestContext.requests.delete(req);
            reject(
              bitmapSubtitleError(
                "RANGE_UNAVAILABLE",
                "Bitmap subtitle source did not honor HTTP Range",
                { statusCode: statusCode }
              )
            );
            return;
          }

          var chunks = [];
          var received = 0;
          res.on("data", function (chunk) {
            received += chunk.length;
            if (received > maxBytes) {
              req.destroy(
                bitmapSubtitleError(
                  "RANGE_TOO_LARGE",
                  "Bitmap subtitle range exceeded its safety limit"
                )
              );
              return;
            }
            chunks.push(chunk);
          });
          res.on("end", function () {
            var totalSize = null;
            var contentRange = String(res.headers["content-range"] || "");
            var rangeMatch = contentRange.match(/bytes\s+\d+-\d+\/(\d+|\*)/i);
            if (rangeMatch && rangeMatch[1] !== "*") {
              totalSize = Number(rangeMatch[1]);
            } else if (statusCode === 200) {
              totalSize = Number(res.headers["content-length"] || 0) || null;
            }
            if (requestContext) requestContext.requests.delete(req);
            resolve({
              buffer: Buffer.concat(chunks),
              totalSize: totalSize,
              finalUrl: parsed.href,
              statusCode: statusCode
            });
          });
        }
      );

      if (requestContext) requestContext.requests.add(req);

      req.setTimeout(REQUEST_TIMEOUT_MS, function () {
        req.destroy(
          bitmapSubtitleError("RANGE_TIMEOUT", "Bitmap subtitle range request timed out")
        );
      });
      req.on("error", function (error) {
        if (requestContext) requestContext.requests.delete(req);
        reject(error);
      });
      req.end();
    });
  }
  return requestRange;
};
