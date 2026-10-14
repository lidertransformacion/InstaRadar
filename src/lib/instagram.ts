import fs from "node:fs";
import { chromium, type BrowserContext, type Page } from "playwright";
import {
  AVATAR_GAP,
  avatarFetchAllowed,
  hasCachedAvatar,
  instagramCdnUrl,
  savedAvatarsThisRun,
  writeAvatarFile,
} from "@/lib/avatars";
import { resolveChromePath } from "@/lib/chrome";
import type { StoredPost, StoredProfile } from "@/lib/db";
import {
  backoffDelayMs,
  capDecision,
  capMessage,
  challengeMessage,
  detectChallenge,
  isAbortError,
  pageLooksLikeLogin,
  randomDelayMs,
  sleep,
  withinFollowerRange,
  type PacingConfig,
} from "@/lib/pacing";
import {
  isPrivateAccount,
  mediaTypeFromPath,
  parseEngagementText,
  parseProfileMeta,
  postPathsFromHrefs,
  usernamesFromHrefs,
} from "@/lib/parse";
import { profileCaps, logAction } from "@/lib/db";
import { fold } from "@/lib/text";
import type { CityBundle, Settings } from "@/lib/types";
import type { RawCompetitorPost } from "@/lib/competitor";

export class RadarPause extends Error {
  readonly runStatus: "challenge" | "paused";

  constructor(runStatus: "challenge" | "paused", message: string) {
    super(message);
    this.name = "RadarPause";
    this.runStatus = runStatus;
  }
}

type Snapshot = {
  hrefs: string[];
  og: string;
  title: string;
  header: string;
  article: string;
  body: string;
  avatar: string;
};

const POSTS_PER_TAG = 6;
const POSTS_PER_PROFILE = 4;
const POSTS_PER_SHOP = 3;
const COMMENTERS_PER_SHOP = 8;

export async function launchProfile(dir: string): Promise<BrowserContext> {
  fs.mkdirSync(dir, { recursive: true });
  const executablePath = resolveChromePath();
  return chromium.launchPersistentContext(dir, {
    headless: process.env.RADAR_HEADLESS === "1",
    viewport: { width: 1280, height: 900 },
    locale: "es-CO",
    timezoneId: "America/Bogota",
    ...(executablePath ? { executablePath } : {}),
  });
}

export async function openInstagramHome(context: BrowserContext): Promise<void> {
  const page = await firstPage(context);
  await page.goto("https://www.instagram.com/", {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });
}

export async function searchCity(input: {
  context: BrowserContext;
  city: CityBundle;
  settings: Settings;
  signal: AbortSignal;
  onStatus: (message: string) => void;
  onProfile: (profile: StoredProfile) => void;
  alreadyKnown: (username: string) => boolean;
}): Promise<{ seen: number; kept: number }> {
  const page = await firstPage(input.context);
  await ensureLoggedIn(page, input.signal, input.onStatus);
  let seen = 0;
  let kept = 0;
  const remember = (profile: StoredProfile | null) => {
    if (!profile) return;
    seen += 1;
    input.onProfile(profile);
    if (!profile.isPrivate) kept += 1;
  };

  for (const tag of input.city.hashtags) {
    input.onStatus(`Buscando en #${tag}…`);
    const paths = await collectPostPaths(
      page,
      `https://www.instagram.com/explore/tags/${encodeURIComponent(tag)}/`,
      input.settings,
      input.signal,
      POSTS_PER_TAG,
    );
    for (const postPath of paths) {
      const owner = await ownerOfPost(page, postPath, input.settings, input.signal);
      if (!owner || input.alreadyKnown(owner)) continue;
      guardCaps(input.settings);
      const profile = await inspectProfile(page, owner, input.city, input.settings, input.signal, {
        source: `#${tag}`,
        zone: null,
      });
      remember(profile);
    }
  }

  for (const zone of input.city.zones) {
    if (!zone.locationUrl.trim()) continue;
    input.onStatus(`Revisando lugares en ${zone.name}…`);
    const paths = await collectPostPaths(
      page,
      zone.locationUrl.trim(),
      input.settings,
      input.signal,
      POSTS_PER_TAG,
    );
    for (const postPath of paths) {
      const owner = await ownerOfPost(page, postPath, input.settings, input.signal);
      if (!owner || input.alreadyKnown(owner)) continue;
      guardCaps(input.settings);
      const profile = await inspectProfile(page, owner, input.city, input.settings, input.signal, {
        source: `lugar · ${zone.name}`,
        zone: zone.name,
      });
      remember(profile);
    }
  }

  for (const shop of input.city.watches) {
    input.onStatus(`Viendo quién comenta en @${shop}…`);
    const people = await commentersOf(page, shop, input.settings, input.signal);
    for (const username of people) {
      if (input.alreadyKnown(username)) continue;
      guardCaps(input.settings);
      const profile = await inspectProfile(page, username, input.city, input.settings, input.signal, {
        source: `comentario en @${shop}`,
        zone: null,
      });
      remember(profile);
    }
  }

  return { seen, kept };
}

export async function readCompetitorPosts(input: {
  context: BrowserContext;
  username: string;
  settings: Settings;
  signal: AbortSignal;
  onStatus: (message: string) => void;
}): Promise<RawCompetitorPost[]> {
  const page = await firstPage(input.context);
  await ensureLoggedIn(page, input.signal, input.onStatus);
  input.onStatus(`Leyendo publicaciones de @${input.username}…`);
  const paths = await collectPostPaths(
    page,
    `https://www.instagram.com/${input.username}/`,
    input.settings,
    input.signal,
    8,
  );
  const posts: RawCompetitorPost[] = [];
  for (const postPath of paths) {
    const snapshot = await openAndRead(
      page,
      `https://www.instagram.com${postPath}`,
      input.settings,
      input.signal,
    );
    const engagement = parseEngagementText(`${snapshot.article}\n${snapshot.body}`);
    const caption = captionFrom(snapshot);
    posts.push({
      shortcode: postPath.split("/").filter(Boolean)[1] ?? postPath,
      caption,
      likes: engagement.likes ?? 0,
      comments: engagement.comments ?? 0,
      mediaType: mediaTypeFromPath(postPath) === "reel" ? "reel" : "image",
      takenAt: new Date().toISOString(),
      collaborators: handlesIn(caption).filter((handle) => handle !== input.username),
      commenters: usernamesFromHrefs(snapshot.hrefs).filter((handle) => handle !== input.username),
    });
  }
  return posts;
}

export async function sendDirectMessage(input: {
  context: BrowserContext;
  username: string;
  body: string;
  signal: AbortSignal;
}): Promise<void> {
  const page = await firstPage(input.context);
  await page.goto(`https://www.instagram.com/${input.username}/`, {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });
  await sleep(1200, input.signal);
  const snapshot = await readSnapshot(page);
  const challenge = detectChallenge({ url: page.url(), text: snapshot.body });
  if (challenge) throw new RadarPause("challenge", challengeMessage(challenge.kind));
  if (pageLooksLikeLogin(page.url(), snapshot.body)) {
    throw new Error("La cuenta de envío no tiene sesión. Entra en esa ventana. No se envió nada.");
  }

  const button = page.getByRole("button", { name: /mensaje|message/i }).first();
  const link = page.getByRole("link", { name: /mensaje|message/i }).first();
  if (await button.count()) await button.click({ timeout: 8000 });
  else if (await link.count()) await link.click({ timeout: 8000 });
  else throw new Error("No encontré el botón de mensaje. No se envió nada.");

  const box = page.locator("textarea, div[role='textbox']").first();
  await box.waitFor({ timeout: 12_000 });
  await box.click();
  await page.keyboard.type(input.body, { delay: 35 });
  const send = page.getByRole("button", { name: /enviar|send/i }).last();
  await send.click({ timeout: 8000 });
}

async function ensureLoggedIn(
  page: Page,
  signal: AbortSignal,
  onStatus: (message: string) => void,
): Promise<void> {
  await page.goto("https://www.instagram.com/", {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });
  const deadline = Date.now() + 8 * 60_000;
  while (Date.now() < deadline) {
    if (signal.aborted) throw new DOMException("aborted", "AbortError");
    const snapshot = await readSnapshot(page);
    const challenge = detectChallenge({ url: page.url(), text: snapshot.body });
    if (challenge) throw new RadarPause("challenge", challengeMessage(challenge.kind));
    if (!pageLooksLikeLogin(page.url(), snapshot.body)) return;
    onStatus("Entra a Instagram en la ventana que se abrió. La contraseña no se guarda aquí.");
    await sleep(2500, signal);
  }
  throw new Error("login-timeout");
}

async function collectPostPaths(
  page: Page,
  url: string,
  settings: Settings,
  signal: AbortSignal,
  limit: number,
): Promise<string[]> {
  const snapshot = await openAndRead(page, url, settings, signal);
  await humanScroll(page, signal);
  const after = await readSnapshot(page);
  const challenge = detectChallenge({ url: page.url(), text: after.body });
  if (challenge) throw new RadarPause("challenge", challengeMessage(challenge.kind));
  return postPathsFromHrefs([...snapshot.hrefs, ...after.hrefs]).slice(0, limit);
}

async function ownerOfPost(
  page: Page,
  postPath: string,
  settings: Settings,
  signal: AbortSignal,
): Promise<string | null> {
  const snapshot = await openAndRead(
    page,
    `https://www.instagram.com${postPath}`,
    settings,
    signal,
  );
  const names = usernamesFromHrefs(snapshot.hrefs);
  const header = fold(snapshot.header);
  return names.find((name) => header.includes(name)) ?? names[0] ?? null;
}

async function commentersOf(
  page: Page,
  shop: string,
  settings: Settings,
  signal: AbortSignal,
): Promise<string[]> {
  const paths = await collectPostPaths(
    page,
    `https://www.instagram.com/${shop}/`,
    settings,
    signal,
    POSTS_PER_SHOP,
  );
  const people: string[] = [];
  for (const postPath of paths) {
    const snapshot = await openAndRead(
      page,
      `https://www.instagram.com${postPath}`,
      settings,
      signal,
    );
    for (const username of usernamesFromHrefs(snapshot.hrefs)) {
      if (username === shop || people.includes(username)) continue;
      people.push(username);
      if (people.length >= COMMENTERS_PER_SHOP) return people;
    }
  }
  return people;
}

async function inspectProfile(
  page: Page,
  username: string,
  city: CityBundle,
  settings: Settings,
  signal: AbortSignal,
  origin: { source: string; zone: string | null },
): Promise<StoredProfile | null> {
  let failures = 0;
  while (failures < 3) {
    try {
      const snapshot = await openAndRead(
        page,
        `https://www.instagram.com/${username}/`,
        settings,
        signal,
      );
      logAction("profile_visit");
      const meta = parseProfileMeta(`${snapshot.og}\n${snapshot.header}`);
      if (meta.followers == null) return null;
      const blob = `${snapshot.header}\n${snapshot.og}\n${snapshot.body}`;
      const isPrivate = isPrivateAccount(blob);
      const inRange = withinFollowerRange(
        meta.followers,
        settings.minFollowers,
        settings.maxFollowers,
      );
      const avatarUrl = await saveAvatarFromOpenProfile(page, username, snapshot.avatar, signal);
      const posts: StoredPost[] = [];
      if (!isPrivate && inRange) {
        const paths = postPathsFromHrefs(snapshot.hrefs).slice(0, POSTS_PER_PROFILE);
        for (const postPath of paths) {
          const post = await openAndRead(
            page,
            `https://www.instagram.com${postPath}`,
            settings,
            signal,
          );
          const engagement = parseEngagementText(`${post.article}\n${post.body}`);
          posts.push({
            caption: captionFrom(post),
            likes: engagement.likes ?? 0,
            comments: engagement.comments ?? 0,
            takenAt: null,
            mediaType: mediaTypeFromPath(postPath),
          });
        }
      }
      const textForZone = `${snapshot.header}\n${posts.map((post) => post.caption).join("\n")}`;
      return {
        username,
        fullName: meta.fullName || username,
        bio: bioFrom(snapshot.header),
        followers: meta.followers,
        following: meta.following ?? 0,
        postsCount: meta.posts ?? posts.length,
        cityId: city.id,
        zone: origin.zone ?? inferZone(textForZone, city),
        source: origin.source,
        sample: false,
        isPrivate,
        verified: true,
        followersSource: "",
        evidenceUrl: "",
        notes: "",
        avatarUrl,
        posts,
      };
    } catch (error) {
      if (error instanceof RadarPause || isAbortError(error)) throw error;
      failures += 1;
      if (failures >= 3) throw error;
      const wait = backoffDelayMs(failures);
      await sleep(wait, signal);
    }
  }
  return null;
}

function inferZone(text: string, city: CityBundle): string | null {
  const blob = fold(text);
  return (
    city.zones.find((zone) => {
      const name = fold(zone.name);
      return name.length > 2 && blob.includes(name);
    })?.name ?? null
  );
}

async function saveAvatarFromOpenProfile(
  page: Page,
  username: string,
  imageUrl: string,
  signal: AbortSignal,
): Promise<string> {
  try {
    const allowed = avatarFetchAllowed({
      platform: process.platform,
      headless: process.env.RADAR_HEADLESS === "1",
      cached: hasCachedAvatar(username),
      savedThisRun: savedAvatarsThisRun(),
    });
    if (!allowed || !instagramCdnUrl(imageUrl)) return "";
    await sleep(randomDelayMs(AVATAR_GAP), signal);
    const response = await page.request.get(imageUrl, { timeout: 20_000 });
    if (!response.ok()) return "";
    const bytes = Buffer.from(await response.body());
    if (!writeAvatarFile(username, bytes)) return "";
    return imageUrl;
  } catch (error) {
    if (error instanceof RadarPause || isAbortError(error)) throw error;
    return "";
  }
}

function guardCaps(settings: Settings): void {
  const caps = profileCaps();
  const decision = capDecision({
    actionsThisHour: caps.hour,
    actionsToday: caps.day,
    hourlyCap: settings.hourlyCap,
    dailyCap: settings.dailyCap,
  });
  if (decision.pause && decision.reason) {
    throw new RadarPause("paused", capMessage(decision.reason));
  }
}

async function openAndRead(
  page: Page,
  url: string,
  settings: PacingConfig,
  signal: AbortSignal,
): Promise<Snapshot> {
  await sleep(randomDelayMs(settings), signal);
  let failures = 0;
  while (failures < 3) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await sleep(700, signal);
      const snapshot = await readSnapshot(page);
      const challenge = detectChallenge({
        url: page.url(),
        text: `${snapshot.body}\n${snapshot.header}`,
      });
      if (challenge) throw new RadarPause("challenge", challengeMessage(challenge.kind));
      return snapshot;
    } catch (error) {
      if (error instanceof RadarPause || isAbortError(error)) throw error;
      failures += 1;
      if (failures >= 3) throw error;
      await sleep(backoffDelayMs(failures), signal);
    }
  }
  throw new Error("navigation-failed");
}

async function humanScroll(page: Page, signal: AbortSignal): Promise<void> {
  const steps = 3 + Math.floor(Math.random() * 3);
  for (let index = 0; index < steps; index += 1) {
    if (signal.aborted) throw new DOMException("aborted", "AbortError");
    await page.mouse.wheel(0, 500 + Math.round(Math.random() * 600));
    await sleep(900 + Math.round(Math.random() * 1200), signal);
  }
}

async function readSnapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(() => {
    const hrefs = Array.from(document.querySelectorAll("a[href]")).map(
      (anchor) => anchor.getAttribute("href") || "",
    );
    const og =
      document.querySelector('meta[property="og:description"]')?.getAttribute("content") || "";
    const headerImage = document.querySelector("header img")?.getAttribute("src") || "";
    const ogImage =
      document.querySelector('meta[property="og:image"]')?.getAttribute("content") || "";
    return {
      hrefs,
      og,
      title: document.title || "",
      header: document.querySelector("header")?.innerText?.slice(0, 2000) || "",
      article: document.querySelector("article")?.innerText?.slice(0, 4000) || "",
      body: document.body?.innerText?.slice(0, 2500) || "",
      avatar: headerImage || ogImage,
    };
  });
}

function bioFrom(header: string): string {
  return header
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 12)
    .filter((line) => !/seguidor|following|publicacion|posts|follower/i.test(line))
    .slice(0, 4)
    .join(" ")
    .slice(0, 400);
}

function captionFrom(snapshot: Snapshot): string {
  const lines = snapshot.article
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 20);
  return (lines[0] ?? "").slice(0, 500);
}

function handlesIn(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(/@([a-z0-9._]{1,30})/gi)) {
    found.add(match[1].toLowerCase());
  }
  return [...found];
}

async function firstPage(context: BrowserContext): Promise<Page> {
  return context.pages()[0] ?? context.newPage();
}
