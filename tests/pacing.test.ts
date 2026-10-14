import { describe, expect, it } from "vitest";
import {
  backoffDelayMs,
  capDecision,
  dayStartIso,
  detectChallenge,
  hourAgoIso,
  pageLooksLikeLogin,
  randomDelayMs,
  scrollPlan,
  withinFollowerRange,
} from "@/lib/pacing";
import { evaluateSend, nextSendGapMs, SEND_DAILY_CAP } from "@/lib/policy";

const pacing = { minDelayMs: 1000, maxDelayMs: 5000, hourlyCap: 12, dailyCap: 40 };

describe("pacing", () => {
  it("keeps delays inside the configured window", () => {
    expect(randomDelayMs(pacing, () => 0)).toBe(1000);
    expect(randomDelayMs(pacing, () => 1)).toBe(5000);
    const sequence = [0, 1];
    expect(randomDelayMs(pacing, () => sequence.shift() ?? 0)).toBe(3000);
    expect(randomDelayMs({ ...pacing, minDelayMs: 8000, maxDelayMs: 2000 }, () => 0)).toBe(2000);
  });

  it("backs off exponentially and never passes the cap", () => {
    expect(backoffDelayMs(1, () => 0)).toBe(25_500);
    expect(backoffDelayMs(2, () => 0)).toBe(51_000);
    expect(backoffDelayMs(2, () => 0)).toBeGreaterThan(backoffDelayMs(1, () => 0));
    expect(backoffDelayMs(10, () => 1)).toBe(15 * 60_000);
    expect(backoffDelayMs(10, () => 0)).toBeLessThanOrEqual(15 * 60_000);
  });

  it("pauses for the daily cap before the hourly one", () => {
    expect(
      capDecision({ actionsThisHour: 3, actionsToday: 40, hourlyCap: 12, dailyCap: 40 }),
    ).toEqual({ pause: true, reason: "day" });
    expect(
      capDecision({ actionsThisHour: 12, actionsToday: 12, hourlyCap: 12, dailyCap: 40 }),
    ).toEqual({ pause: true, reason: "hour" });
    expect(
      capDecision({ actionsThisHour: 2, actionsToday: 4, hourlyCap: 12, dailyCap: 40 }),
    ).toEqual({ pause: false, reason: null });
  });

  it("recognizes checkpoints and rate limits in Spanish and English", () => {
    expect(detectChallenge({ url: "https://www.instagram.com/challenge/123" })?.kind).toBe(
      "challenge",
    );
    expect(detectChallenge({ text: "Please wait a few minutes before you try again." })?.kind).toBe(
      "rate_limit",
    );
    expect(detectChallenge({ text: "Inténtalo más tarde" })?.kind).toBe("rate_limit");
    expect(detectChallenge({ text: "Suspicious login attempt" })?.kind).toBe("checkpoint");
    expect(detectChallenge({ text: "Confirma que eres tú" })?.kind).toBe("checkpoint");
    expect(detectChallenge({ url: "https://www.instagram.com/luna.mesa/", text: "Luna Mesa" })).toBe(
      null,
    );
  });

  it("treats the login form as a login page and ignores a normal profile", () => {
    expect(pageLooksLikeLogin("https://www.instagram.com/accounts/login/", "")).toBe(true);
    expect(pageLooksLikeLogin("https://www.instagram.com/", "Usuario\nContraseña")).toBe(true);
    expect(pageLooksLikeLogin("https://www.instagram.com/luna.mesa/", "18400 seguidores")).toBe(
      false,
    );
  });

  it("filters follower counts and plans a short human scroll", () => {
    expect(withinFollowerRange(800, 2000, 25000)).toBe(false);
    expect(withinFollowerRange(18400, 25000, 2000)).toBe(true);
    expect(withinFollowerRange(null, 2000, 25000)).toBe(false);
    const plan = scrollPlan(() => 0, { min: 900, max: 2200 });
    expect(plan.steps).toBe(3);
    expect(plan.pausesMs).toHaveLength(3);
    expect(plan.pausesMs.every((pause) => pause === 900)).toBe(true);
  });

  it("measures rolling hour and local day from a fixed clock", () => {
    const now = new Date("2026-10-13T15:30:00.000Z");
    expect(Date.parse(hourAgoIso(now))).toBe(now.getTime() - 3_600_000);
    const start = new Date(dayStartIso(now));
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
  });
});

describe("send policy", () => {
  const base = {
    sendEnabled: true,
    status: "approved",
    attemptsToday: 0,
    dailyCap: SEND_DAILY_CAP,
    nextSendAt: null,
    now: 1_000_000,
    researchDir: "/tmp/radar-research",
    outreachDir: "/tmp/radar-outreach",
    confirm: true,
    searchRunning: false,
  };

  it("spaces sends by three to eight minutes", () => {
    expect(nextSendGapMs(() => 0)).toBe(3 * 60_000);
    expect(nextSendGapMs(() => 1)).toBe(8 * 60_000);
  });

  it("refuses unless every manual gate is open", () => {
    expect(evaluateSend({ ...base, sendEnabled: false }).ok).toBe(false);
    expect(evaluateSend({ ...base, status: "draft" }).ok).toBe(false);
    expect(evaluateSend({ ...base, confirm: false }).ok).toBe(false);
    expect(evaluateSend({ ...base, outreachDir: base.researchDir }).ok).toBe(false);
    expect(evaluateSend({ ...base, attemptsToday: 15 }).ok).toBe(false);
    expect(evaluateSend({ ...base, searchRunning: true }).ok).toBe(false);
    expect(evaluateSend({ ...base, nextSendAt: base.now + 60_000 }).ok).toBe(false);
    expect(evaluateSend(base)).toEqual({ ok: true });
  });

  it("does not let the daily cap rise above 15", () => {
    const decision = evaluateSend({ ...base, attemptsToday: 15, dailyCap: 500 });
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.reason).toContain("15");
  });
});
