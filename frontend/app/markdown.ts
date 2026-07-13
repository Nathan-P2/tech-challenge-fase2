const MARKDOWN_FENCE = /^`{2,}(?:markdown|md)?\s*$/i;

export function normalizeMarkdown(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .trim()
    .split("\n")
    .filter((line) => !MARKDOWN_FENCE.test(line.trim()))
    .join("\n")
    .trim();
}
