// Unit tests for Colab notebook resolution and extraction (no network calls).
import { test } from "node:test";
import assert from "node:assert/strict";

const { resolveNotebookSource, extractNotebook } = await import("../src/ai/colabFetch.js");

test("a Colab drive link resolves to a Drive download URL", () => {
  const source = resolveNotebookSource(
    "https://colab.research.google.com/drive/1CxsGpgtemfDk4YsMe71SKtec79eEGvG1#scrollTo=GwQ"
  );
  assert.equal(source.kind, "drive");
  assert.equal(
    source.fetchUrl,
    "https://drive.google.com/uc?export=download&id=1CxsGpgtemfDk4YsMe71SKtec79eEGvG1"
  );
});

test("a Colab GitHub link resolves to the raw file", () => {
  const source = resolveNotebookSource(
    "https://colab.research.google.com/github/googlecolab/colabtools/blob/main/notebooks/demo.ipynb"
  );
  assert.equal(source.kind, "github");
  assert.equal(
    source.fetchUrl,
    "https://raw.githubusercontent.com/googlecolab/colabtools/main/notebooks/demo.ipynb"
  );
});

test("a gist link resolves to its raw form", () => {
  const source = resolveNotebookSource("https://colab.research.google.com/gist/someone/abc123");
  assert.equal(source.kind, "gist");
  assert.match(source.fetchUrl, /^https:\/\/gist\.githubusercontent\.com\/someone\/abc123\/raw$/);
});

// The fetch runs on the server, so an unrestricted resolver would let a student
// point the backend at internal addresses.
test("non-https and non-allowlisted hosts are refused", () => {
  const metadata = resolveNotebookSource("http://169.254.169.254/latest/meta-data/");
  assert.ok(metadata.error, "cloud metadata address must be refused");
  assert.equal(metadata.fetchUrl, undefined);

  const internal = resolveNotebookSource("https://internal.corp.local/admin");
  assert.ok(internal.error, "arbitrary internal host must be refused");
  assert.equal(internal.fetchUrl, undefined);

  const nonsense = resolveNotebookSource("not a url at all");
  assert.ok(nonsense.error);
});

test("notebook extraction keeps code cells and their error output", () => {
  const notebook = {
    cells: [
      { cell_type: "markdown", source: ["# Wallet demo"] },
      {
        cell_type: "code",
        source: ["import ecdsa\n", "print(ecdsa.__version__)"],
        outputs: [
          {
            output_type: "error",
            ename: "ModuleNotFoundError",
            evalue: "No module named 'ecdsa'",
            traceback: ["[0;31m---[0m", "ModuleNotFoundError: No module named 'ecdsa'"],
          },
        ],
      },
      { cell_type: "code", source: ["x = 1"], outputs: [] },
    ],
  };

  const extracted = extractNotebook(notebook);
  assert.match(extracted, /\[markdown\] # Wallet demo/);
  assert.match(extracted, /\[cell 1\]/);
  assert.match(extracted, /import ecdsa/);
  assert.match(extracted, /ModuleNotFoundError: No module named 'ecdsa'/);
  assert.match(extracted, /\[cell 2\]/, "code cells are numbered independently of markdown");
  // IPython colours its tracebacks; the escape codes must not reach the model.
  assert.ok(!extracted.includes("[0;31m"), "ANSI colour codes are stripped");
});

test("a notebook with no code cells returns null rather than an empty prompt", () => {
  assert.equal(extractNotebook({ cells: [] }), null);
  assert.equal(extractNotebook({ cells: [{ cell_type: "markdown", source: [""] }] }), null);
  assert.equal(extractNotebook({}), null);
});
