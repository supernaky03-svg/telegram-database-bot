/** Exact caption normalization. Punctuation remains significant; no fuzzy matching. */
export function normalizeCaption(value) {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .toLocaleLowerCase("en");
}

export function isVideoPost(message) {
  if (!message || typeof message !== "object") return false;
  if (message.video) return true;
  return message.document?.mime_type?.toLowerCase().startsWith("video/") === true;
}
