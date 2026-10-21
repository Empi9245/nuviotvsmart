// Shared protocol constants for the same-origin plugin network proxy.
// The browser transport (js/platform/pluginBrowserTransport.js) and the server
// side (scripts/pluginProxyCore.mjs) must agree on these values.
export const PLUGIN_PROXY_PATH = "/api/plugin-proxy";
export const PLUGIN_PROXY_HEADER = "x-nuvio-plugin-proxy";

// A response with one of these statuses and without PLUGIN_PROXY_HEADER means
// the serving host does not implement the proxy endpoint: the transport falls
// back to direct browser fetch.
export function isPluginProxyMissingStatus(status, hasProxyHeader) {
  return [404, 405, 501].includes(Number(status)) && !hasProxyHeader;
}
