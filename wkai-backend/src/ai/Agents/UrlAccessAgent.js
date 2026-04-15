import { createBaseAgent } from "./BaseAgent.js";

function summarizeSnippet(text) {
  if (!text) return "";
  return String(text)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

export async function inspectUrlAccess({ url, status, statusText, bodySnippet, errorMessage }) {
  return UrlAccessAgent.invoke({ url, status, statusText, bodySnippet, errorMessage });
}

export const UrlAccessAgent = createBaseAgent({
  name: "UrlAccessAgent",
  version: "1.0.0",
  tags: ["url", "network", "diagnostics"],
  async invoke({ url, status, statusText, bodySnippet, errorMessage }) {
    if (errorMessage) {
      if (/ENOTFOUND|DNS|getaddrinfo/i.test(errorMessage)) {
        return {
          accessible: false,
          reason:
            "The domain could not be resolved. Please verify the URL spelling and ensure DNS/network access is available.",
          technical:
            `URL: ${url}; error: ${summarizeSnippet(errorMessage)}`,
        };
      }
      if (/ECONNREFUSED|timed out|timeout|aborted/i.test(errorMessage)) {
        return {
          accessible: false,
          reason:
            "The URL is reachable but the host did not respond in time or refused the connection.",
          technical: `URL: ${url}; error: ${summarizeSnippet(errorMessage)}`,
        };
      }
      return {
        accessible: false,
        reason: "The URL could not be fetched due to a network or request error.",
        technical: `URL: ${url}; error: ${summarizeSnippet(errorMessage)}`,
      };
    }

    if (status >= 400) {
      let reason = `The server returned HTTP ${status} ${statusText || ""}.`.trim();
      if (status === 401 || status === 403) {
        reason = "The URL requires authentication/permissions and cannot be accessed publicly.";
      } else if (status === 404) {
        reason = "The URL points to a page or file that does not exist (404).";
      } else if (status >= 500) {
        reason = "The remote server is currently failing (5xx) and could not provide file content.";
      }
      return {
        accessible: false,
        reason,
        technical: summarizeSnippet(bodySnippet),
      };
    }

    return {
      accessible: true,
      reason: "URL is accessible.",
      technical: summarizeSnippet(bodySnippet),
    };
  },
  async healthCheck() {
    return { status: "healthy", enabled: true, name: "UrlAccessAgent", version: "1.0.0" };
  },
});
