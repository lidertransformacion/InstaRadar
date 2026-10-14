import fs from "node:fs";
import path from "node:path";
import { cleanUsername } from "@/lib/text";

/** Photos saved while a profile page is already open. Not a bulk download. */
export const AVATAR_CAP_PER_RUN = 8;

export const AVATAR_GAP = { minDelayMs: 3_000, maxDelayMs: 6_000 };

const MAX_BYTES = 1_500_000;

type Budget = { saved: number };

function budget(): Budget {
  const slot = globalThis as typeof globalThis & { __radarAvatarBudget?: Budget };
  if (!slot.__radarAvatarBudget) slot.__radarAvatarBudget = { saved: 0 };
  return slot.__radarAvatarBudget;
}

export function resetAvatarRun(): void {
  budget().saved = 0;
}

export function savedAvatarsThisRun(): number {
  return budget().saved;
}

export function avatarFetchAllowed(input: {
  platform: string;
  headless: boolean;
  cached: boolean;
  savedThisRun: number;
}): boolean {
  if (input.platform !== "darwin") return false;
  if (input.headless) return false;
  if (input.cached) return false;
  if (input.savedThisRun >= AVATAR_CAP_PER_RUN) return false;
  return true;
}

export function cleanAvatarUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 500) return "";
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return "";
  }
  if (url.protocol !== "https:") return "";
  if (url.username || url.password) return "";
  return url.toString();
}

export function instagramCdnUrl(value: string): boolean {
  const cleaned = cleanAvatarUrl(value);
  if (!cleaned) return false;
  const host = new URL(cleaned).hostname.toLowerCase();
  return (
    host === "instagram.com" ||
    host.endsWith(".instagram.com") ||
    host.endsWith(".cdninstagram.com") ||
    host.endsWith(".fbcdn.net")
  );
}

export function avatarDir(root = path.join(process.cwd(), "data", "avatars")): string {
  return root;
}

export function avatarFile(username: string, root = avatarDir()): string | null {
  const cleaned = cleanUsername(username);
  if (!cleaned) return null;
  const file = path.join(root, `${cleaned}.jpg`);
  if (path.dirname(file) !== root) return null;
  return file;
}

export function hasCachedAvatar(username: string, root = avatarDir()): boolean {
  const file = avatarFile(username, root);
  if (!file || !fs.existsSync(file)) return false;
  return fs.statSync(file).size > 0;
}

export function cachedAvatarUrl(username: string, root = avatarDir()): string | null {
  const cleaned = cleanUsername(username);
  if (!cleaned || !hasCachedAvatar(cleaned, root)) return null;
  return `/api/avatars/${cleaned}`;
}

export function imageMediaType(bytes: Buffer): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  return null;
}

export function writeAvatarFile(username: string, bytes: Buffer, root = avatarDir()): boolean {
  const file = avatarFile(username, root);
  if (!file) return false;
  if (bytes.length < 32 || bytes.length > MAX_BYTES) return false;
  if (!imageMediaType(bytes)) return false;
  fs.mkdirSync(root, { recursive: true });
  const temporary = `${file}.part`;
  fs.writeFileSync(temporary, bytes);
  fs.renameSync(temporary, file);
  budget().saved += 1;
  return true;
}

export function readAvatarFile(
  username: string,
  root = avatarDir(),
): { bytes: Buffer; type: "image/jpeg" | "image/png" | "image/webp" } | null {
  const file = avatarFile(username, root);
  if (!file || !fs.existsSync(file)) return null;
  const bytes = fs.readFileSync(file);
  const type = imageMediaType(bytes);
  if (!type || bytes.length > MAX_BYTES) return null;
  return { bytes, type };
}
