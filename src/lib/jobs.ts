import path from "node:path";
import type { BrowserContext } from "playwright";
import { resetAvatarRun } from "@/lib/avatars";
import { summarizeCompetitor } from "@/lib/competitor";
import {
  attemptsToday,
  getCity,
  getDb,
  getDraft,
  getNextSendAt,
  getProfileDetail,
  getSettings,
  knownUsernames,
  listCities,
  logSend,
  setNextSendAt,
  setRun,
  saveStudy,
  storeDiscovered,
  updateDraft,
} from "@/lib/db";
import {
  launchProfile,
  openInstagramHome,
  RadarPause,
  readCompetitorPosts,
  searchCity,
  sendDirectMessage,
} from "@/lib/instagram";
import { capDecision, capMessage, isAbortError, randomDelayMs, sleep } from "@/lib/pacing";
import { evaluateSend, nextSendGapMs } from "@/lib/policy";
import { cleanUsername } from "@/lib/text";
import type { CityBundle, Settings } from "@/lib/types";

type Slot = {
  abort: AbortController | null;
  running: boolean;
  context: BrowserContext | null;
  outreach: BrowserContext | null;
};

function slot(): Slot {
  const root = globalThis as typeof globalThis & { __radarSlot?: Slot };
  if (!root.__radarSlot) {
    root.__radarSlot = { abort: null, running: false, context: null, outreach: null };
  }
  return root.__radarSlot;
}

export function searchRunning(): boolean {
  return slot().running;
}

export async function startSearch(): Promise<{ ok: boolean; message: string }> {
  const current = slot();
  if (current.running) return { ok: false, message: "Ya hay una búsqueda en curso." };
  const settings = getSettings();
  const city = listCities().find((item) => item.id === settings.cityId);
  if (!city) return { ok: false, message: "No está esa ciudad." };
  const hasWork =
    city.hashtags.length > 0 ||
    city.watches.length > 0 ||
    city.zones.some((zone) => zone.locationUrl.trim());
  if (!hasWork) {
    return { ok: false, message: "Agrega hashtags o lugares antes de buscar." };
  }

  current.running = true;
  current.abort = new AbortController();
  resetAvatarRun();
  const signal = current.abort.signal;
  setRun({
    status: "running",
    cityId: city.id,
    mode: settings.mockMode ? "mock" : "live",
    message: settings.mockMode ? "Simulando el ritmo de búsqueda…" : "Abriendo el navegador…",
    seen: 0,
    kept: 0,
  });

  void executeSearch(city, settings, signal)
    .catch((error: unknown) => {
      if (isAbortError(error)) {
        setRun({ status: "stopped", message: "Búsqueda detenida." });
        return;
      }
      if (error instanceof RadarPause) {
        setRun({ status: error.runStatus, message: error.message });
        return;
      }
      console.error("[radar] search failed", error);
      setRun({ status: "error", message: publicError(error) });
    })
    .finally(async () => {
      current.running = false;
      const status = (await import("@/lib/db")).getRun().status;
      if (status !== "challenge") await closeResearch();
    });

  return { ok: true, message: "Búsqueda en curso." };
}

export async function stopSearch(): Promise<{ ok: boolean; message: string }> {
  const current = slot();
  current.abort?.abort();
  if (!current.running) {
    setRun({ status: "stopped", message: "Búsqueda detenida." });
  }
  await closeResearch();
  return { ok: true, message: "Búsqueda detenida." };
}

export async function openBrowser(
  kind: "research" | "outreach",
): Promise<{ ok: boolean; message: string }> {
  if (slot().running) return { ok: false, message: "Espera a que termine la búsqueda." };
  const settings = getSettings();
  if (settings.mockMode && kind === "research") {
    return { ok: false, message: "Apaga el modo demo para abrir Instagram." };
  }
  const relative = kind === "research" ? settings.researchProfileDir : settings.outreachProfileDir;
  const dir = path.resolve(process.cwd(), relative);
  try {
    const context = await launchProfile(dir);
    await openInstagramHome(context);
    if (kind === "research") slot().context = context;
    else slot().outreach = context;
    return {
      ok: true,
      message: "Se abrió la ventana. Entra a mano. La contraseña no se guarda en el radar.",
    };
  } catch (error) {
    console.error("[radar] browser open failed", error);
    return { ok: false, message: publicError(error) };
  }
}

export async function startStudy(rawUsername: string): Promise<{ ok: boolean; message: string }> {
  const current = slot();
  if (current.running) return { ok: false, message: "Espera a que termine lo que está en curso." };
  const username = cleanUsername(rawUsername);
  if (!username) return { ok: false, message: "Ese usuario no parece válido." };
  const settings = getSettings();
  const cityId = settings.cityId;
  current.running = true;
  current.abort = new AbortController();
  const signal = current.abort.signal;
  setRun({
    status: "running",
    cityId,
    mode: settings.mockMode ? "mock" : "live",
    message: settings.mockMode
      ? "El modo demo no inventa cifras de la competencia."
      : `Leyendo @${username}…`,
    seen: 0,
    kept: 0,
  });

  void executeStudy(username, cityId, settings, signal)
    .catch((error: unknown) => {
      if (isAbortError(error)) {
        setRun({ status: "stopped", message: "Estudio detenido." });
        return;
      }
      if (error instanceof RadarPause) {
        setRun({ status: error.runStatus, message: error.message });
        return;
      }
      console.error("[radar] study failed", error);
      setRun({ status: "error", message: publicError(error) });
    })
    .finally(async () => {
      current.running = false;
      const status = (await import("@/lib/db")).getRun().status;
      if (status !== "challenge") await closeResearch();
    });

  return { ok: true, message: "Estudio en curso." };
}

export async function startSend(
  draftId: number,
  confirm: boolean,
): Promise<{ ok: boolean; message: string }> {
  const current = slot();
  const settings = getSettings();
  const draft = getDraft(draftId);
  if (!draft) return { ok: false, message: "No está ese borrador." };
  if (settings.mockMode) {
    return { ok: false, message: "Apaga el modo demo antes de enviar." };
  }
  const detail = getProfileDetail(draft.profileId);
  if (detail?.card.sample) {
    return { ok: false, message: "Ese perfil es de ejemplo. No se envía." };
  }
  const decision = evaluateSend({
    sendEnabled: settings.sendEnabled,
    status: draft.status,
    attemptsToday: attemptsToday(),
    dailyCap: settings.sendDailyCap,
    nextSendAt: getNextSendAt() ? Date.parse(getNextSendAt() as string) : null,
    now: Date.now(),
    researchDir: path.resolve(process.cwd(), settings.researchProfileDir),
    outreachDir: path.resolve(process.cwd(), settings.outreachProfileDir),
    confirm,
    searchRunning: current.running,
  });
  if (!decision.ok) return { ok: false, message: decision.reason };

  current.running = true;
  current.abort = new AbortController();
  updateDraft(draft.id, { status: "sending", error: null });
  setRun({
    status: "running",
    message: `Enviando a @${draft.username}…`,
    mode: "live",
    cityId: draft.cityId,
  });

  void executeSend(draft.id, draft.username, draft.body, settings, current.abort.signal)
    .catch((error: unknown) => {
      console.error("[radar] send failed", error);
      const message =
        error instanceof RadarPause ? error.message : publicError(error);
      updateDraft(draft.id, { status: "failed", error: message });
      logSend(draft.id, "failed");
      setNextSendAt(new Date(Date.now() + nextSendGapMs()).toISOString());
      setRun({ status: "error", message });
    })
    .finally(() => {
      current.running = false;
    });

  return { ok: true, message: "Envío en curso." };
}

async function executeSearch(
  city: CityBundle,
  settings: Settings,
  signal: AbortSignal,
): Promise<void> {
  if (settings.mockMode) {
    await runMock(city, settings, signal);
    return;
  }
  const context = await researchContext(settings);
  const seen = new Set(knownUsernames());
  const result = await searchCity({
    context,
    city,
    settings,
    signal,
    onStatus: (message) => setRun({ status: "running", message, cityId: city.id, mode: "live" }),
    alreadyKnown: (username) => seen.has(username),
    onProfile: (profile) => {
      seen.add(profile.username);
      if (!profile.isPrivate) storeDiscovered(profile);
      const run = countKept(city.id);
      setRun({
        seen: run.seen,
        kept: run.kept,
        message: profile.isPrivate
          ? `Salté a @${profile.username}, es privada.`
          : `Encontré a @${profile.username}.`,
      });
    },
  });
  setRun({
    status: "done",
    message: `Listo. ${result.kept} perfiles nuevos en la lista.`,
    seen: result.seen,
    kept: result.kept,
  });
}

async function runMock(city: CityBundle, settings: Settings, signal: AbortSignal): Promise<void> {
  const steps = [
    ...city.hashtags.map((tag) => `Buscando en #${tag}…`),
    ...city.zones.filter((zone) => zone.locationUrl.trim()).map((zone) => `Revisando lugares en ${zone.name}…`),
    ...city.watches.map((watch) => `Viendo quién comenta en @${watch}…`),
  ];
  if (steps.length === 0) steps.push("Revisando la ciudad…");
  let seen = 0;
  for (const message of steps) {
    const decision = capDecision({
      actionsThisHour: seen,
      actionsToday: seen,
      hourlyCap: settings.hourlyCap,
      dailyCap: settings.dailyCap,
    });
    if (decision.pause && decision.reason) {
      setRun({ status: "paused", message: capMessage(decision.reason), seen, kept: seen });
      return;
    }
    setRun({ status: "running", message, seen, kept: seen, cityId: city.id, mode: "mock" });
    await sleep(Math.max(420, Math.round(randomDelayMs(settings) * 0.12)), signal);
    seen += 1;
  }
  setRun({
    status: "done",
    message: "Listo. Simulé el ritmo y no agregué perfiles.",
    seen,
    kept: seen,
    cityId: city.id,
    mode: "mock",
  });
}

async function executeStudy(
  username: string,
  cityId: string,
  settings: Settings,
  signal: AbortSignal,
): Promise<void> {
  if (settings.mockMode) {
    await sleep(400, signal);
    setRun({
      status: "done",
      message: "El modo demo no inventa un estudio. Apágalo para leer la cuenta real.",
    });
    return;
  }
  const context = await researchContext(settings);
  const posts = await readCompetitorPosts({
    context,
    username,
    settings,
    signal,
    onStatus: (message) => setRun({ status: "running", message, mode: "live", cityId }),
  });
  const study = {
    ...summarizeCompetitor(username, cityId, posts, new Date().toISOString()),
    mock: false,
    account: null,
  };
  saveStudy(study);
  setRun({ status: "done", message: `Listo el estudio de @${username}.` });
}

async function executeSend(
  draftId: number,
  username: string,
  body: string,
  settings: Settings,
  signal: AbortSignal,
): Promise<void> {
  const dir = path.resolve(process.cwd(), settings.outreachProfileDir);
  const context = slot().outreach ?? (await launchProfile(dir));
  slot().outreach = context;
  try {
    await sendDirectMessage({ context, username, body, signal });
    updateDraft(draftId, { status: "sent", error: null });
    logSend(draftId, "sent");
    setNextSendAt(new Date(Date.now() + nextSendGapMs()).toISOString());
    setRun({ status: "done", message: `Mensaje enviado a @${username}.` });
  } finally {
    await context.close().catch(() => undefined);
    slot().outreach = null;
  }
}

async function researchContext(settings: Settings): Promise<BrowserContext> {
  const existing = slot().context;
  if (existing) return existing;
  const dir = path.resolve(process.cwd(), settings.researchProfileDir);
  const context = await launchProfile(dir);
  slot().context = context;
  return context;
}

async function closeResearch(): Promise<void> {
  const current = slot();
  await current.context?.close().catch(() => undefined);
  current.context = null;
}

function countKept(cityId: string): { seen: number; kept: number } {
  const db = getDb();
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM profiles WHERE city_id = ? AND sample = 0")
    .get(cityId) as { n?: number } | undefined;
  const kept = Number(row?.n ?? 0);
  return { seen: kept, kept };
}

function publicError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("login-timeout")) {
    return "No hubo inicio de sesión a tiempo. Abre el navegador e inténtalo de nuevo.";
  }
  if (message.includes("No se envió") || message.includes("no tiene sesión") || message.includes("botón de mensaje")) {
    return message;
  }
  if (/executable doesn't exist|browserType\.launch|failed to launch/i.test(message)) {
    return "No pude abrir Chrome. Instálalo o corre npx playwright install chromium.";
  }
  if (/profile|user data|in use|SingletonLock/i.test(message)) {
    return "Esa ventana de Chrome ya está abierta. Ciérrala e inténtalo otra vez.";
  }
  return "Algo se detuvo. El detalle quedó en la consola del servidor.";
}

export function cityOrNull(cityId: string): CityBundle | null {
  return getCity(getDb(), cityId);
}
