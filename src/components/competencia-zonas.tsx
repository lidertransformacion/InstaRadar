"use client";

import { useState } from "react";
import data from "@/data/competencia-medellin.json";

type Competidor = {
  marca: string;
  instagram: string;
  seguidores: string;
  distancia: string;
  rating: string;
  posicionamiento: string;
  precios: string;
  contenido: string;
  influencers: string;
  fortalezas: string;
  debilidades: string;
};

export function CompetenciaZonas() {
  const [tiendaId, setTiendaId] = useState(data.tiendas[0]?.id ?? "");
  const tienda = data.tiendas.find((item) => item.id === tiendaId) ?? data.tiendas[0];
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border bg-card p-4">
        <p className="font-heading text-xl tracking-tight">Libertario {data.libertario.instagram}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {data.libertario.seguidores} seguidores · {data.libertario.posts} publicaciones
        </p>
        <p className="mt-2 text-sm leading-snug">{data.libertario.adn}</p>
        <p className="mt-1 text-xs text-muted-foreground">{data.libertario.engagement_publico}</p>
      </section>

      <div className="flex flex-wrap gap-2">
        {data.tiendas.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={item.id === tienda.id}
            onClick={() => setTiendaId(item.id)}
            className={`rounded-full border px-3 py-1.5 text-sm ${
              item.id === tienda.id ? "border-foreground bg-foreground text-background" : "border-border bg-card"
            }`}
          >
            {item.tienda.replace(/^Libertario /, "").split(" (")[0]}
          </button>
        ))}
      </div>

      <section className="rounded-2xl border border-border bg-card p-4">
        <p className="font-medium">{tienda.tienda}</p>
        <p className="text-sm text-muted-foreground">{tienda.direccion}</p>
        <p className="mt-1 text-sm">{tienda.zona}</p>
        <p className="mt-3 rounded-xl bg-secondary px-3 py-2 text-sm">{tienda.lectura}</p>
      </section>

      <div className="space-y-2.5">
        {(tienda.competidores as Competidor[]).map((c) => (
          <article key={c.marca} className="rounded-2xl border border-border bg-card p-4 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-medium">{c.marca}</p>
              <p className="text-xs text-muted-foreground">{c.distancia}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              {c.instagram} · {c.seguidores} · {c.rating}
            </p>
            <dl className="mt-2 grid gap-1 sm:grid-cols-2">
              <Field label="Posicionamiento" value={c.posicionamiento} />
              <Field label="Precios" value={c.precios} />
              <Field label="Contenido" value={c.contenido} />
              <Field label="Influencers" value={c.influencers} />
              <Field label="Fortalezas" value={c.fortalezas} />
              <Field label="Debilidades vs Libertario" value={c.debilidades} />
            </dl>
          </article>
        ))}
      </div>

      <section className="rounded-2xl border border-border bg-card p-4 text-sm">
        <p className="font-medium">Otras marcas de Medellín (fuera de 500 m)</p>
        {data.otras_marcas.map((m) => (
          <p key={m.marca} className="mt-1">
            <span className="font-medium">{m.marca}</span> {m.instagram} · {m.seguidores} — {m.ubicacion}. {m.nota}
          </p>
        ))}
        <p className="mt-2 text-xs text-muted-foreground">{data.no_aplica}</p>
        <p className="mt-1 text-xs text-muted-foreground">{data.nota} Consultado {data.consultado}.</p>
      </section>
    </div>
  );
}

function Field(props: { label: string; value: string }) {
  const pending = /sin verificar/i.test(props.value);
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{props.label}</dt>
      <dd className={pending ? "text-amber-900" : ""}>{props.value}</dd>
    </div>
  );
}
