/** Calendar day used for the "Nuevos hoy" badge. Medellín has no daylight-saving shift. */
export const NUEVO_HOY_TIME_ZONE = "America/Bogota";

export function bogotaDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: NUEVO_HOY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** A profile is new today when the daily import stamped today's Bogota date. */
export function isNuevoHoy(
  profile: { newToday?: boolean; foundOn?: string | null },
  now = new Date(),
): boolean {
  if (typeof profile.foundOn === "string" && profile.foundOn.length > 0) {
    return profile.foundOn === bogotaDate(now);
  }
  return profile.newToday === true;
}
