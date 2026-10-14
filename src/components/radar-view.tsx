"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { avatarHue, formatFollowers, formatPercent, initials } from "@/lib/format";
import type { PanelState, ProfileCard } from "@/lib/types";

const SLIDER_MIN = 500;
const SLIDER_MAX = 100_000;

type SortKey = "score" | "engagement" | "followers";
type ReviewFilter = "todos" | "verificados";

export function RadarView(props: {
  state: PanelState;
  cityName: string;
  zones: string[];
  loading: boolean;
  onCity: (cityId: string) => void;
  onRange: (min: number, max: number) => void;
  onSearch: (action: "start" | "stop") => void;
  onInvite: (profileId: number) => void;
  onOpenDraft: () => void;
}) {
  const { settings, run, profiles, cities } = props.state;
  const [range, setRange] = useState<number[] | null>(null);
  const [zone, setZone] = useState("todas");
  const [sort, setSort] = useState<SortKey>("score");
  const [review, setReview] = useState<ReviewFilter>("todos");
  const [includeUnknown, setIncludeUnknown] = useState(true);
  const [openId, setOpenId] = useState<number | null>(null);
  const active = useMemo(
    () =>
      [range?.[0] ?? settings.minFollowers, range?.[1] ?? settings.maxFollowers] as [
        number,
        number,
      ],
    [range, settings.minFollowers, settings.maxFollowers],
  );
  const running = run.status === "running";

  const visible = useMemo(() => {
    const filtered = profiles.filter((profile) => {
      if (review === "verificados" && !profile.verified) return false;
      if (profile.followers == null) {
        if (!includeUnknown) return false;
      } else if (profile.followers < active[0] || profile.followers > active[1]) {
        return false;
      }
      if (zone !== "todas" && profile.zone !== zone) return false;
      return true;
    });
    const copy = [...filtered];
    copy.sort((a, b) => {
      if (sort === "engagement") return b.engagementRate - a.engagementRate;
      if (sort === "followers") return compareFollowers(a.followers, b.followers);
      return b.score - a.score;
    });
    return copy;
  }, [profiles, active, zone, sort, review, includeUnknown]);

  const presentZones = props.zones.filter((name) => profiles.some((profile) => profile.zone === name));

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border bg-card p-4 shadow-[0_10px_30px_-24px_rgba(70,40,20,0.8)]">
        <div className="flex flex-wrap gap-2">
          {cities.map((city) => {
            const selected = city.id === settings.cityId;
            return (
              <button
                key={city.id}
                type="button"
                aria-pressed={selected}
                onClick={() => props.onCity(city.id)}
                className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  selected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background hover:bg-secondary"
                }`}
              >
                {city.name}
                <span className={`ml-1.5 text-xs ${selected ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                  {city.country}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-4">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <p className="text-sm">Seguidores</p>
            <p className="font-heading text-lg tabular-nums tracking-tight">
              {formatFollowers(active[0])} – {formatFollowers(active[1])}
            </p>
          </div>
          <Slider
            min={SLIDER_MIN}
            max={SLIDER_MAX}
            step={500}
            value={[clamp(active[0]), clamp(active[1])]}
            onValueChange={(value) => {
              const next: [number, number] = [
                Math.min(value[0] ?? SLIDER_MIN, value[1] ?? SLIDER_MAX),
                Math.max(value[0] ?? SLIDER_MIN, value[1] ?? SLIDER_MAX),
              ];
              setRange(next);
            }}
            onValueCommit={(value) => {
              const min = Math.min(value[0] ?? SLIDER_MIN, value[1] ?? SLIDER_MAX);
              const max = Math.max(value[0] ?? SLIDER_MIN, value[1] ?? SLIDER_MAX);
              props.onRange(min, max);
            }}
            aria-label="Rango de seguidores"
          />
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            className="h-11 flex-1"
            disabled={running}
            onClick={() => props.onSearch("start")}
          >
            Buscar
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11 flex-1"
            disabled={!running}
            onClick={() => props.onSearch("stop")}
          >
            Detener
          </Button>
          <Button type="button" variant="outline" className="h-11" asChild>
            <a
              href={`/api/export?city=${settings.cityId}&min=${active[0]}&max=${active[1]}&unknown=${includeUnknown ? "1" : "0"}${review === "verificados" ? "&verified=1" : ""}${zone !== "todas" ? `&zone=${encodeURIComponent(zone)}` : ""}`}
            >
              Exportar CSV
            </a>
          </Button>
        </div>

        {settings.mockMode ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Modo demo. La búsqueda simula el ritmo y no abre Instagram.
          </p>
        ) : null}
      </section>

      <p role="status" aria-live="polite" className="flex items-center gap-2 px-1 text-sm">
        <span
          className={`size-2 rounded-full ${running ? "live-dot bg-primary" : "bg-muted-foreground/50"}`}
        />
        <span>{statusLine(run.status, run.message, props.cityName, run.cityId)}</span>
        <span className="ml-auto text-muted-foreground tabular-nums">{visible.length}</span>
      </p>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <Chip active={review === "todos"} onClick={() => setReview("todos")}>
          Todos
        </Chip>
        <Chip active={review === "verificados"} onClick={() => setReview("verificados")}>
          Verificados
        </Chip>
        <Chip active={includeUnknown} onClick={() => setIncludeUnknown((current) => !current)}>
          Incluir sin dato
        </Chip>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <Chip active={zone === "todas"} onClick={() => setZone("todas")}>
          Todas
        </Chip>
        {presentZones.map((name) => (
          <Chip key={name} active={zone === name} onClick={() => setZone(name)}>
            {name}
          </Chip>
        ))}
        <span className="ml-auto flex shrink-0 gap-1">
          <Chip active={sort === "score"} onClick={() => setSort("score")}>
            Ajuste
          </Chip>
          <Chip active={sort === "engagement"} onClick={() => setSort("engagement")}>
            Engagement
          </Chip>
          <Chip active={sort === "followers"} onClick={() => setSort("followers")}>
            Seguidores
          </Chip>
        </span>
      </div>

      {props.loading && profiles.length === 0 ? (
        <p className="text-sm text-muted-foreground">Cargando perfiles…</p>
      ) : null}

      {!props.loading && visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          {review === "verificados"
            ? "Nadie verificado en este rango."
            : "Nadie en este rango. Mueve los seguidores o dale a Buscar."}
        </p>
      ) : null}

      <div className="space-y-2.5">
        {visible.map((profile, index) => (
          <ProfileRow
            key={profile.id}
            profile={profile}
            delay={Math.min(index, 8) * 40}
            open={openId === profile.id}
            showSample={!settings.mockMode && profile.sample}
            onToggle={() => setOpenId((current) => (current === profile.id ? null : profile.id))}
            onInvite={() => (profile.hasDraft ? props.onOpenDraft() : props.onInvite(profile.id))}
          />
        ))}
      </div>
    </div>
  );
}

function ProfileRow(props: {
  profile: ProfileCard;
  delay: number;
  open: boolean;
  showSample: boolean;
  onToggle: () => void;
  onInvite: () => void;
}) {
  const { profile } = props;
  return (
    <article
      className="rise-in rounded-2xl border border-border bg-card px-3 py-3 sm:px-4"
      style={{ animationDelay: `${props.delay}ms` }}
    >
      <div className="flex items-start gap-3">
        <AvatarMark profile={profile} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-medium">{profile.fullName || profile.username}</p>
              <p className="truncate text-sm text-muted-foreground">@{profile.username}</p>
            </div>
            <div className="text-right">
              <p className={`font-heading text-2xl leading-none tabular-nums ${scoreTone(profile.score)}`}>
                {profile.score}
              </p>
              <div className="mt-1.5 ml-auto h-1 w-14 overflow-hidden rounded-full bg-muted">
                <div className="score-bar h-full bg-primary" style={{ width: `${profile.score}%` }} />
              </div>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {profile.zone ? <Badge variant="secondary">{profile.zone}</Badge> : null}
            {profile.verified ? null : (
              <Badge className="border-amber-800/25 bg-amber-100 text-amber-950">Por verificar</Badge>
            )}
            {props.showSample ? <Badge variant="outline">Ejemplo</Badge> : null}
            <span className="tabular-nums">{followerLabel(profile.followers)}</span>
            <span aria-hidden>·</span>
            <span className="tabular-nums">{formatPercent(profile.engagementRate)}</span>
          </div>
          <button
            type="button"
            className="mt-2 text-left text-sm leading-snug"
            aria-expanded={props.open}
            onClick={props.onToggle}
          >
            {profile.reason}
          </button>
          {props.open ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Contenido {profile.breakdown.content} · Zona {profile.breakdown.location} · Engagement{" "}
              {profile.breakdown.engagement} · Real {profile.breakdown.authenticity} · Ritmo{" "}
              {profile.breakdown.frequency}
              {profile.breakdown.penalty ? ` · Colaboración −${profile.breakdown.penalty}` : ""}
              {profile.source ? ` · ${profile.source}` : ""}
            </p>
          ) : null}
          {props.open && profile.notes ? (
            <p className="mt-1 line-clamp-1 text-xs text-muted-foreground" title={profile.notes}>
              {profile.notes}
            </p>
          ) : null}
          {props.open && profile.evidenceUrl ? (
            <a
              className="mt-1 inline-flex text-xs underline underline-offset-2"
              href={profile.evidenceUrl}
              target="_blank"
              rel="noreferrer"
            >
              Fuente
            </a>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="secondary" className="h-9" onClick={props.onInvite}>
              {profile.hasDraft ? "Ver invitación" : "Invitar"}
            </Button>
            <Button type="button" variant="ghost" className="h-9" asChild>
              <a href={profile.profileUrl} target="_blank" rel="noreferrer">
                Ver perfil
                <ExternalLink />
              </a>
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}

function AvatarMark(props: { profile: ProfileCard }) {
  const { profile } = props;
  const [broken, setBroken] = useState(false);
  const hue = avatarHue(profile.username);
  if (profile.avatarUrl && !broken) {
    return (
      // The file is already local. onError returns to the initials circle.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={profile.avatarUrl}
        alt=""
        className="size-11 shrink-0 rounded-full object-cover"
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <div
      className="grid size-11 shrink-0 place-items-center rounded-full text-sm font-medium text-white"
      style={{ background: `oklch(0.48 0.08 ${hue})` }}
      aria-hidden
    >
      {initials(profile.fullName, profile.username)}
    </div>
  );
}

function Chip(props: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={`shrink-0 rounded-full border px-3 py-1 text-xs transition-colors ${
        props.active ? "border-foreground bg-foreground text-background" : "border-border bg-card"
      }`}
    >
      {props.children}
    </button>
  );
}

function followerLabel(value: number | null): string {
  return value == null ? "sin dato" : formatFollowers(value);
}

function compareFollowers(a: number | null, b: number | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return b - a;
}

function clamp(value: number): number {
  return Math.min(SLIDER_MAX, Math.max(SLIDER_MIN, value));
}

function scoreTone(score: number): string {
  if (score >= 80) return "text-emerald-900";
  if (score >= 60) return "text-amber-900";
  return "text-muted-foreground";
}

function statusLine(
  status: string,
  message: string,
  cityName: string,
  runCityId: string | null,
): string {
  if (status === "idle") return `Listo en ${cityName}.`;
  if (!message) return `Listo en ${cityName}.`;
  if (status !== "running" && runCityId && !message.toLowerCase().includes(cityName.toLowerCase())) {
    return message;
  }
  return message;
}
