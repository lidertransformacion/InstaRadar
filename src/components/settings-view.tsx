"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { CityBundle, Settings, Shop, Zone } from "@/lib/types";
import type { PanelState } from "@/lib/types";

export function SettingsView(props: {
  state: PanelState;
  city: CityBundle;
  onSettings: (patch: Partial<Settings>) => void;
  onCatalog: (catalog: {
    competitor?: string;
    zones?: Zone[];
    hashtags?: string[];
    watches?: string[];
    shops?: Shop[];
  }) => void;
  onImport: (raw: string) => void;
  onLogin: (kind: "research" | "outreach") => void;
}) {
  const { settings } = props.state;
  const [tags, setTags] = useState<string[] | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [zones, setZones] = useState<Zone[] | null>(null);
  const [watches, setWatches] = useState<string[] | null>(null);
  const [watchInput, setWatchInput] = useState("");
  const [shops, setShops] = useState<Shop[] | null>(null);
  const [competitor, setCompetitor] = useState<string | null>(null);

  const hashtags = tags ?? props.city.hashtags;
  const zoneRows = zones ?? props.city.zones;
  const watchRows = watches ?? props.city.watches;
  const shopRows = shops ?? props.city.shops;
  const competitorValue = competitor ?? props.city.competitor;

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border bg-card p-4">
        <Toggle
          label="Modo demo"
          hint="Simula el ritmo de búsqueda y no abre Instagram. No inventa perfiles."
          checked={settings.mockMode}
          onChange={(mockMode) => props.onSettings({ mockMode })}
        />
        <Toggle
          label="Permitir envío"
          hint="Sigue siendo manual, con tope diario y con la otra cuenta. Viene apagado."
          checked={settings.sendEnabled}
          onChange={(sendEnabled) => props.onSettings({ sendEnabled })}
        />
      </section>

      <section className="rounded-2xl border border-border bg-card p-4">
        <p className="text-sm">Ritmo de la búsqueda</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Los topes cuentan perfiles abiertos, no hashtags. Si Instagram pide una verificación, la
          búsqueda se detiene.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <NumberField
            label="Por hora"
            value={settings.hourlyCap}
            onCommit={(hourlyCap) => props.onSettings({ hourlyCap })}
          />
          <NumberField
            label="Por día"
            value={settings.dailyCap}
            onCommit={(dailyCap) => props.onSettings({ dailyCap })}
          />
          <NumberField
            label="Pausa mínima (s)"
            value={Math.round(settings.minDelayMs / 100) / 10}
            step="0.1"
            onCommit={(seconds) => props.onSettings({ minDelayMs: Math.round(seconds * 1000) })}
          />
          <NumberField
            label="Pausa máxima (s)"
            value={Math.round(settings.maxDelayMs / 100) / 10}
            step="0.1"
            onCommit={(seconds) => props.onSettings({ maxDelayMs: Math.round(seconds * 1000) })}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4">
        <p className="text-sm">Dos perfiles de Chrome</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Investigación y envío no comparten sesión. La contraseña se queda en el navegador, no en
          esta app.
        </p>
        <label className="mt-3 block text-xs text-muted-foreground">
          Carpeta de investigación
          <Input
            className="mt-1 h-10"
            defaultValue={settings.researchProfileDir}
            key={`research-${settings.researchProfileDir}`}
            onBlur={(event) => props.onSettings({ researchProfileDir: event.target.value.trim() })}
          />
        </label>
        <label className="mt-3 block text-xs text-muted-foreground">
          Carpeta de envío
          <Input
            className="mt-1 h-10"
            defaultValue={settings.outreachProfileDir}
            key={`outreach-${settings.outreachProfileDir}`}
            onBlur={(event) => props.onSettings({ outreachProfileDir: event.target.value.trim() })}
          />
        </label>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Button type="button" variant="outline" className="h-10" onClick={() => props.onLogin("research")}>
            Abrir cuenta de investigación
          </Button>
          <Button type="button" variant="outline" className="h-10" onClick={() => props.onLogin("outreach")}>
            Abrir cuenta de envío
          </Button>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4">
        <p className="text-sm">{props.city.name}</p>
        <label className="mt-3 block text-xs text-muted-foreground">
          Competidor
          <Input
            className="mt-1 h-10"
            value={competitorValue}
            onChange={(event) => setCompetitor(event.target.value)}
            placeholder="pergaminocafe"
          />
        </label>

        <p className="mt-4 text-xs text-muted-foreground">Hashtags</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {hashtags.map((tag) => (
            <button
              key={tag}
              type="button"
              className="rounded-full bg-secondary px-2.5 py-1 text-xs"
              onClick={() => setTags(hashtags.filter((item) => item !== tag))}
            >
              #{tag} ×
            </button>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <Input
            className="h-10"
            value={tagInput}
            placeholder="#cafemedellin"
            onChange={(event) => setTagInput(event.target.value)}
          />
          <Button
            type="button"
            variant="outline"
            className="h-10"
            onClick={() => {
              const next = tagInput.trim();
              if (!next) return;
              setTags([...hashtags, next]);
              setTagInput("");
            }}
          >
            Agregar
          </Button>
        </div>

        <p className="mt-4 text-xs text-muted-foreground">Zonas y URL de lugar, si la tienes</p>
        <div className="mt-2 space-y-2">
          {zoneRows.map((zone, index) => (
            <div key={`${zone.name}-${index}`} className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
              <Input
                className="h-10"
                value={zone.name}
                aria-label={`Zona ${index + 1}`}
                onChange={(event) =>
                  setZones(zoneRows.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, name: event.target.value } : item,
                  ))
                }
              />
              <Input
                className="h-10"
                value={zone.locationUrl}
                placeholder="https://www.instagram.com/explore/locations/…"
                aria-label={`URL de ${zone.name || "zona"}`}
                onChange={(event) =>
                  setZones(zoneRows.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, locationUrl: event.target.value } : item,
                  ))
                }
              />
              <Button
                type="button"
                variant="ghost"
                className="h-10"
                onClick={() => setZones(zoneRows.filter((_, itemIndex) => itemIndex !== index))}
              >
                Quitar
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            className="h-9"
            onClick={() => setZones([...zoneRows, { name: "", locationUrl: "" }])}
          >
            Otra zona
          </Button>
        </div>

        <p className="mt-4 text-xs text-muted-foreground">Cafeterías para ver comentarios</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {watchRows.map((username) => (
            <button
              key={username}
              type="button"
              className="rounded-full bg-secondary px-2.5 py-1 text-xs"
              onClick={() => setWatches(watchRows.filter((item) => item !== username))}
            >
              @{username} ×
            </button>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <Input
            className="h-10"
            value={watchInput}
            placeholder="pergaminocafe"
            onChange={(event) => setWatchInput(event.target.value)}
          />
          <Button
            type="button"
            variant="outline"
            className="h-10"
            onClick={() => {
              const next = watchInput.trim().replace(/^@/, "");
              if (!next) return;
              setWatches([...watchRows, next]);
              setWatchInput("");
            }}
          >
            Agregar
          </Button>
        </div>

        <p className="mt-4 text-xs text-muted-foreground">Tiendas para la invitación</p>
        <div className="mt-2 space-y-2">
          {shopRows.map((shop, index) => (
            <div key={`${shop.name}-${index}`} className="grid gap-2 sm:grid-cols-3">
              <Input
                className="h-10"
                value={shop.zone}
                aria-label="Zona de la tienda"
                onChange={(event) =>
                  setShops(shopRows.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, zone: event.target.value } : item,
                  ))
                }
              />
              <Input
                className="h-10"
                value={shop.name}
                aria-label="Nombre de la tienda"
                onChange={(event) =>
                  setShops(shopRows.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, name: event.target.value } : item,
                  ))
                }
              />
              <Input
                className="h-10"
                value={shop.address}
                aria-label="Dirección"
                onChange={(event) =>
                  setShops(shopRows.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, address: event.target.value } : item,
                  ))
                }
              />
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            className="h-10"
            onClick={() =>
              props.onCatalog({
                competitor: competitorValue,
                hashtags,
                zones: zoneRows,
                watches: watchRows,
                shops: shopRows,
              })
            }
          >
            Guardar ciudad
          </Button>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4">
        <p className="text-sm">Cargar investigación</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Un JSON con ciudad, competencia e influencers. Si el usuario ya está, se actualiza.
        </p>
        <label className="mt-3 inline-flex">
          <input
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              void file.text().then((raw) => props.onImport(raw));
            }}
          />
          <span className="inline-flex h-10 cursor-pointer items-center rounded-lg border border-border bg-background px-3 text-sm">
            Subir JSON
          </span>
        </label>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4">
        <label className="block text-xs text-muted-foreground">
          Archivo de precios (JSON o CSV)
          <Input
            className="mt-1 h-10"
            defaultValue={settings.priceFile}
            key={settings.priceFile}
            onBlur={(event) => props.onSettings({ priceFile: event.target.value.trim() })}
          />
        </label>
      </section>
    </div>
  );
}

function Toggle(props: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div>
        <p className="text-sm">{props.label}</p>
        <p className="text-xs text-muted-foreground">{props.hint}</p>
      </div>
      <Switch checked={props.checked} onCheckedChange={props.onChange} aria-label={props.label} />
    </div>
  );
}

function NumberField(props: {
  label: string;
  value: number;
  step?: string;
  onCommit: (value: number) => void;
}) {
  return (
    <label className="text-xs text-muted-foreground">
      {props.label}
      <Input
        className="mt-1 h-10"
        type="number"
        step={props.step ?? "1"}
        defaultValue={props.value}
        key={`${props.label}-${props.value}`}
        onBlur={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) props.onCommit(next);
        }}
      />
    </label>
  );
}
