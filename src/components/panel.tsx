"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CompetitorView } from "@/components/competitor-view";
import { OutreachView } from "@/components/outreach-view";
import { RadarView } from "@/components/radar-view";
import { SettingsView } from "@/components/settings-view";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { DraftStatus, PanelState, Settings, Shop, Zone } from "@/lib/types";

const TABS = [
  { id: "radar", label: "Radar" },
  { id: "competencia", label: "Competencia" },
  { id: "invitaciones", label: "Invitaciones" },
  { id: "ajustes", label: "Ajustes" },
] as const;

type TabId = (typeof TABS)[number]["id"];

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json().catch(() => ({}))) as Record<string, unknown>;
}

export function Panel() {
  const params = useSearchParams();
  const initial = params.get("tab");
  const [tab, setTab] = useState<TabId>(
    TABS.some((item) => item.id === initial) ? (initial as TabId) : "radar",
  );
  const [state, setState] = useState<PanelState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const response = await fetch("/api/state", { cache: "no-store" });
    const payload = await readJson(response);
    if (!response.ok) throw new Error(String(payload.error ?? "state"));
    setState(payload as unknown as PanelState);
    setError(null);
  }, []);

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        await load();
      } catch {
        if (!stop) setError("No pude leer los datos locales.");
      } finally {
        if (!stop) setLoading(false);
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), 1500);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [load]);

  function chooseTab(next: string) {
    const value = (TABS.some((item) => item.id === next) ? next : "radar") as TabId;
    setTab(value);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", value);
    window.history.replaceState(null, "", url);
  }

  async function post(url: string, body: unknown): Promise<string | null> {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await readJson(response);
    await load();
    if (!response.ok) {
      const message = String(payload.message ?? payload.error ?? "No se pudo completar.");
      setNotice(message);
      return message;
    }
    const message = payload.message ? String(payload.message) : null;
    if (message && message !== "ok") setNotice(message);
    return null;
  }

  async function saveSettings(patch: Partial<Settings>) {
    const response = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!response.ok) setNotice("No pude guardar los ajustes.");
    await load();
  }

  async function saveCatalog(
    cityId: string,
    catalog: {
      competitor?: string;
      zones?: Zone[];
      hashtags?: string[];
      watches?: string[];
      shops?: Shop[];
    },
  ) {
    const response = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cityId, catalog }),
    });
    const payload = await readJson(response);
    if (!response.ok) setNotice(String(payload.error ?? "No pude guardar la ciudad."));
    else setNotice("Ciudad guardada.");
    await load();
  }

  async function importFile(raw: string) {
    const response = await fetch("/api/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: raw,
    });
    const payload = await readJson(response);
    if (!response.ok) setNotice(String(payload.error ?? "No pude cargar el archivo."));
    else setNotice(String(payload.message ?? "Archivo cargado."));
    await load();
  }

  async function updateDraft(id: number, patch: { body?: string; status?: DraftStatus }) {
    const response = await fetch("/api/drafts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    const payload = await readJson(response);
    if (!response.ok) setNotice(String(payload.error ?? "No pude actualizar el borrador."));
    await load();
  }

  const city = state?.cities.find((item) => item.id === state.settings.cityId) ?? state?.cities[0];

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-border/80 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="font-heading text-[1.45rem] leading-none tracking-[-0.03em]">Libertario</p>
            <p className="mt-1 text-xs tracking-wide text-muted-foreground">Radar de influencers</p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            {state?.settings.mockMode ? (
              <span className="rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground">
                Demo
              </span>
            ) : null}
            <span className="font-medium">{city?.name ?? "…"}</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-16 pt-4">
        {error ? (
          <p className="mb-3 rounded-xl border border-destructive/30 bg-card px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="mb-3 rounded-xl border border-border bg-card px-3 py-2 text-sm">{notice}</p>
        ) : null}

        <Tabs value={tab} onValueChange={chooseTab}>
          <TabsList className="grid h-11 w-full grid-cols-4 bg-card">
            {TABS.map((item) => (
              <TabsTrigger key={item.id} value={item.id} className="text-xs sm:text-sm">
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="radar" className="rise-in mt-4">
            {state && city ? (
              <RadarView
                state={state}
                cityName={city.name}
                zones={city.zones.map((zone) => zone.name)}
                loading={loading}
                onCity={(cityId) => void saveSettings({ cityId })}
                onRange={(minFollowers, maxFollowers) =>
                  void saveSettings({ minFollowers, maxFollowers })
                }
                onSearch={(action) => void post("/api/search", { action })}
                onInvite={(profileId) => void post("/api/drafts", { profileId }).then(() => chooseTab("invitaciones"))}
                onOpenDraft={() => chooseTab("invitaciones")}
                onToggleDailySearch={() => void post("/api/daily-search", {})}
              />
            ) : (
              <Skeleton />
            )}
          </TabsContent>

          <TabsContent value="competencia" className="rise-in mt-4">
            {state && city ? (
              <CompetitorView
                state={state}
                defaultUsername={city.competitor}
                onStudy={(username) => void post("/api/competitors", { username })}
              />
            ) : (
              <Skeleton />
            )}
          </TabsContent>

          <TabsContent value="invitaciones" className="rise-in mt-4">
            {state ? (
              <OutreachView
                state={state}
                onUpdate={(id, patch) => void updateDraft(id, patch)}
                onSend={async (id) => {
                  const message = await post("/api/outreach", { draftId: id, confirm: true });
                  return message;
                }}
              />
            ) : (
              <Skeleton />
            )}
          </TabsContent>

          <TabsContent value="ajustes" className="rise-in mt-4">
            {state && city ? (
              <SettingsView
                key={city.id}
                state={state}
                city={city}
                onSettings={(patch) => void saveSettings(patch)}
                onCatalog={(catalog) => void saveCatalog(city.id, catalog)}
                onImport={(raw) => void importFile(raw)}
                onLogin={(kind) => void post("/api/search", { action: "login", kind })}
              />
            ) : (
              <Skeleton />
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="h-24 animate-pulse rounded-2xl bg-card" />
      ))}
    </div>
  );
}
