export function createDownloadToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function isValidDownloadToken(token) {
  return typeof token === "string" && /^[A-Za-z0-9_-]{20,40}$/.test(token);
}

export function makeStartLink(username, token) {
  if (!/^[A-Za-z0-9_]{5,32}$/.test(String(username || ""))) {
    throw new Error("Invalid bot username");
  }
  if (!isValidDownloadToken(token)) throw new Error("Invalid download token");
  return `https://t.me/${username}?start=dl_${token}`;
}

export function parseStartPayload(messageText) {
  const parts = String(messageText || "").trim().split(/\s+/);
  const command = parts[0] || "";
  if (!/^\/start(?:@[A-Za-z0-9_]{5,32})?$/.test(command)) return { type: "invalid" };
  if (!parts[1]) return { type: "home" };
  if (!parts[1].startsWith("dl_")) return { type: "invalid" };
  const token = parts[1].slice(3);
  return isValidDownloadToken(token) ? { type: "download", token } : { type: "invalid" };
}
