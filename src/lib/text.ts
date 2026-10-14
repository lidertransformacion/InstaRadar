/** Shared string helpers. UI copy stays in the callers; this file only normalizes. */

export function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

export function cleanUsername(raw: string): string | null {
  const username = raw.trim().replace(/^@+/, "").toLowerCase();
  if (!/^[a-z0-9._]{1,30}$/.test(username)) return null;
  if (username.startsWith(".") || username.endsWith(".")) return null;
  return username;
}

export function cleanHashtag(raw: string): string | null {
  const tag = raw.trim().replace(/^#+/, "");
  const folded = fold(tag).replace(/\s+/g, "");
  if (!/^[\p{L}\p{N}_.]{2,50}$/u.test(tag.replace(/\s+/g, ""))) return null;
  return folded;
}

export function mentionsHandle(text: string, handle: string): boolean {
  const normalized = fold(text);
  const name = fold(handle).replace(/^@/, "");
  if (!name) return false;
  const pattern = new RegExp(`(^|[^a-z0-9._])@?${name}([^a-z0-9._]|$)`, "i");
  return pattern.test(normalized);
}

export function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
