/**
 * extractJsonBlock
 *
 * Strips the ```json fence the Groq models wrap their structured replies in.
 *
 * LangChain's own fence handling stops at the *first* closing ```, which breaks
 * whenever a field value contains a nested code fence — the Colab assistant
 * routinely embeds a ```python snippet inside its `advice` string, and the
 * parser then sees a truncated object and throws. Matching the last fence
 * instead keeps nested blocks intact; they are plain characters inside a JSON
 * string and need no special treatment.
 *
 * Unfenced input is returned untouched.
 */
export function extractJsonBlock(raw) {
  const text = String(raw ?? "").trim();
  if (!text.startsWith("```")) return text;

  const afterOpener = text.indexOf("\n");
  const closer = text.lastIndexOf("```");
  if (afterOpener === -1 || closer <= afterOpener) return text;

  return text.slice(afterOpener + 1, closer).trim();
}
