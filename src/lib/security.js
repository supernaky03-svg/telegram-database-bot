const TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,40}$/;

export function createDownloadToken() {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function isValidDownloadToken(token) {
  return typeof token === "string" && TOKEN_PATTERN.test(token);
}

export function makeStartLink(botUsername, token) {
  return `https://t.me/${botUsername}?start=dl_${token}`;
}

export function parseStartPayload(text) {
  if (typeof text !== "string") return null;
  const match = text.trim().match(/^\/start(?:@\w+)?(?:\s+([A-Za-z0-9_-]{1,64}))?/);
  if (!match) return null;

  const payload = match[1] ?? "";
  if (!payload.startsWith("dl_")) return { type: "home" };

  const token = payload.slice(3);
  if (!isValidDownloadToken(token)) return { type: "invalid" };
  return { type: "download", token };
}
