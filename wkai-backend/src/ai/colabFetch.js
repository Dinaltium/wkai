/**
 * Colab notebook fetching.
 *
 * The Colab Assistant's URL mode was answering "I'm unable to open URLs
 * directly" — the prompt told it to say that, because nothing ever fetched
 * anything. A student pasting their notebook link got a request to paste the
 * notebook instead, which is the one thing the URL mode exists to avoid.
 *
 * Only Colab's own sources are reachable. This runs server-side, so an
 * unrestricted fetcher would let any student aim the backend at internal
 * addresses (SSRF); the allowlist is the control, not a convenience.
 */

const FETCH_TIMEOUT_MS = 10_000;
const MAX_NOTEBOOK_BYTES = 2_000_000;
const MAX_EXTRACTED_CHARS = 12_000;
const MAX_OUTPUT_CHARS_PER_CELL = 800;

/**
 * Colab URLs come in four shapes, each backed by a different host:
 *   /drive/<id>                    → Google Drive
 *   /github/<owner>/<repo>/blob/<ref>/<path> → raw.githubusercontent.com
 *   /gist/<user>/<id>              → gist.githubusercontent.com
 *   /notebooks/…                   → Colab's own samples, not user content
 */
export function resolveNotebookSource(rawUrl) {
  let url;
  try {
    url = new URL(String(rawUrl).trim());
  } catch {
    return { error: "That does not look like a URL." };
  }

  if (url.protocol !== "https:") {
    return { error: "Only https notebook links can be fetched." };
  }

  const host = url.hostname.toLowerCase();
  const path = url.pathname;

  if (host === "colab.research.google.com" || host === "colab.google.com") {
    const drive = path.match(/^\/drive\/([A-Za-z0-9_-]+)/);
    if (drive) {
      return { kind: "drive", fetchUrl: `https://drive.google.com/uc?export=download&id=${drive[1]}` };
    }
    const github = path.match(/^\/github\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/);
    if (github) {
      const [, owner, repo, ref, file] = github;
      return { kind: "github", fetchUrl: `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${file}` };
    }
    const gist = path.match(/^\/gist\/([^/]+)\/([A-Za-z0-9]+)/);
    if (gist) {
      return { kind: "gist", fetchUrl: `https://gist.githubusercontent.com/${gist[1]}/${gist[2]}/raw` };
    }
    return { error: "That Colab link is not a notebook this can open. Use the notebook's Share link." };
  }

  if (host === "drive.google.com") {
    const id = path.match(/\/file\/d\/([A-Za-z0-9_-]+)/)?.[1] ?? url.searchParams.get("id");
    if (id) return { kind: "drive", fetchUrl: `https://drive.google.com/uc?export=download&id=${id}` };
    return { error: "Could not find a file id in that Drive link." };
  }

  if (host === "raw.githubusercontent.com" || host === "gist.githubusercontent.com") {
    return { kind: "github", fetchUrl: url.toString() };
  }

  if (host === "github.com") {
    const github = path.match(/^\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/);
    if (github) {
      const [, owner, repo, ref, file] = github;
      return { kind: "github", fetchUrl: `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${file}` };
    }
  }

  return { error: "Only Colab, Google Drive, GitHub and Gist notebook links can be opened." };
}

/** Flatten an .ipynb into the code and output a model can reason about. */
export function extractNotebook(notebook) {
  const cells = Array.isArray(notebook?.cells) ? notebook.cells : [];
  if (!cells.length) return null;

  const parts = [];
  let codeCellNumber = 0;

  for (const cell of cells) {
    const source = Array.isArray(cell.source) ? cell.source.join("") : String(cell.source ?? "");
    if (!source.trim()) continue;

    if (cell.cell_type === "markdown") {
      parts.push(`[markdown] ${source.trim().slice(0, 400)}`);
      continue;
    }
    if (cell.cell_type !== "code") continue;

    codeCellNumber += 1;
    parts.push(`[cell ${codeCellNumber}]\n${source.trim()}`);

    // Outputs are where the failure actually lives — a traceback here is worth
    // more than the whole rest of the notebook.
    for (const output of cell.outputs ?? []) {
      const text = outputToText(output);
      if (text) parts.push(`[cell ${codeCellNumber} output]\n${text.slice(0, MAX_OUTPUT_CHARS_PER_CELL)}`);
    }
  }

  if (!parts.length) return null;
  return parts.join("\n\n").slice(0, MAX_EXTRACTED_CHARS);
}

function outputToText(output) {
  if (!output) return "";
  if (output.output_type === "error") {
    const traceback = Array.isArray(output.traceback) ? output.traceback.join("\n") : "";
    // Tracebacks carry ANSI colour codes when they come from IPython.
    return `${output.ename}: ${output.evalue}\n${traceback}`.replace(/\[[0-9;]*m/g, "");
  }
  if (output.output_type === "stream") {
    return Array.isArray(output.text) ? output.text.join("") : String(output.text ?? "");
  }
  const plain = output.data?.["text/plain"];
  if (plain) return Array.isArray(plain) ? plain.join("") : String(plain);
  return "";
}

/**
 * @returns {Promise<{ content: string } | { error: string }>}
 */
export async function fetchNotebook(rawUrl) {
  const source = resolveNotebookSource(rawUrl);
  if (source.error) return { error: source.error };

  let response;
  try {
    response = await fetch(source.fetchUrl, {
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { Accept: "application/json, text/plain, */*" },
    });
  } catch (err) {
    return { error: `Could not reach the notebook (${err.name === "TimeoutError" ? "timed out" : err.message}).` };
  }

  if (!response.ok) {
    return {
      error:
        response.status === 404
          ? "That notebook was not found. Check the link."
          : `The notebook could not be downloaded (HTTP ${response.status}).`,
    };
  }

  const body = await response.text();
  if (body.length > MAX_NOTEBOOK_BYTES) {
    return { error: "That notebook is too large to analyze. Paste the failing cell instead." };
  }

  let notebook;
  try {
    notebook = JSON.parse(body);
  } catch {
    // Drive serves an HTML sign-in or virus-scan interstitial rather than a
    // 4xx when a file is private, so a parse failure here is almost always a
    // permissions problem, not a corrupt notebook.
    return {
      error:
        "That notebook is not publicly readable. In Colab use Share → General access → 'Anyone with the link', or paste the failing cell instead.",
    };
  }

  const content = extractNotebook(notebook);
  if (!content) return { error: "That notebook has no code cells to analyze." };
  return { content };
}
