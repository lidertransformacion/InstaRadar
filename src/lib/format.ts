export function formatFollowers(value: number): string {
  return new Intl.NumberFormat("es-CO").format(value);
}

export function formatPercent(rate: number): string {
  const formatted = new Intl.NumberFormat("es-CO", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(rate * 100);
  return `${formatted}%`;
}

export function initials(name: string, username: string): string {
  const source = name.trim() || username;
  const parts = source.split(/\s+/).filter(Boolean).slice(0, 2);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

export function avatarHue(username: string): number {
  let hash = 0;
  for (const char of username) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  const warm = [18, 24, 32, 42, 152, 168];
  return warm[hash % warm.length];
}

export function csvCell(value: string | number): string {
  const raw = String(value ?? "");
  const guarded = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${guarded.replace(/"/g, '""')}"`;
}
