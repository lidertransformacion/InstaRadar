"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatFollowers } from "@/lib/format";
import type { PanelState } from "@/lib/types";

export function CompetitorView(props: {
  state: PanelState;
  defaultUsername: string;
  onStudy: (username: string) => void;
}) {
  const study = props.state.study;
  const [username, setUsername] = useState(study?.username || props.defaultUsername || "");
  const running = props.state.run.status === "running";
  const maxFormat = Math.max(1, ...(study?.formats.map((format) => format.avgEngagement) ?? [1]));

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border bg-card p-4">
        <p className="text-sm">Cuenta pública</p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <Input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="pergaminocafe"
            aria-label="Usuario de la competencia"
            className="h-11"
          />
          <Button
            type="button"
            className="h-11"
            disabled={running || !username.trim()}
            onClick={() => props.onStudy(username)}
          >
            Analizar
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Lee publicaciones públicas con la misma cuenta de investigación. No comenta ni sigue.
        </p>
      </section>

      {!study ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          Todavía no hay un estudio en esta ciudad.
        </p>
      ) : (
        <>
          {study.account ? (
            <section className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-heading text-2xl tracking-tight">{study.account.displayName}</p>
                  <a
                    href={study.account.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-muted-foreground"
                  >
                    @{study.username}
                  </a>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <Fact label="Seguidores" value={formatFollowers(study.account.followers)} />
                <Fact label="Sigue" value={formatFollowers(study.account.following)} />
                <Fact label="Publicaciones" value={formatFollowers(study.account.posts)} />
              </div>
              {study.account.bio ? <p className="mt-3 text-sm">{study.account.bio}</p> : null}
              {study.account.address ? (
                <p className="mt-1 text-sm text-muted-foreground">{study.account.address}</p>
              ) : null}
              {study.account.highlights.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {study.account.highlights.map((item) => (
                    <span key={item} className="rounded-full bg-secondary px-2.5 py-1 text-xs">
                      {item}
                    </span>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}
          {study.account ? null : (
          <section className="rounded-2xl border border-border bg-card p-4">
            <p className="font-heading text-2xl tracking-tight">@{study.username}</p>
            <p className="mt-2 text-sm">{study.summary}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Fact label="Ritmo" value={study.cadence} />
              <Fact label="Tono" value={study.tone} />
              <Fact label="Comentarios" value={study.audience} />
            </div>
          </section>
          )}

          {study.formats.some((format) => format.count > 0) ? (
          <section className="rounded-2xl border border-border bg-card p-4">
            <p className="text-sm">Formatos</p>
            <div className="mt-3 space-y-2">
              {study.formats.map((format) => (
                <div key={format.type} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-2 text-sm">
                  <span>{format.label}</span>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="score-bar h-full bg-primary"
                      style={{ width: `${(format.avgEngagement / maxFormat) * 100}%` }}
                    />
                  </div>
                  <span className="tabular-nums text-muted-foreground">
                    {format.count} · {formatFollowers(format.avgEngagement)}
                  </span>
                </div>
              ))}
            </div>
          </section>
          ) : null}

          {study.topPosts.length > 0 ? (
          <section className="space-y-2">
            <p className="px-1 text-sm">Piezas con más respuesta</p>
            {study.topPosts.map((post) => (
              <a
                key={post.shortcode}
                href={post.url}
                target="_blank"
                rel="noreferrer"
                className="block rounded-2xl border border-border bg-card px-4 py-3 transition-colors hover:bg-secondary/60"
              >
                <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span>{post.mediaType}</span>
                  <span className="tabular-nums">
                    {formatFollowers(post.likes)} me gusta · {formatFollowers(post.comments)} comentarios
                  </span>
                </div>
                <p className="mt-1 text-sm">{post.caption}</p>
              </a>
            ))}
          </section>
          ) : null}

          {study.collaborators.length > 0 || study.commenters.length > 0 ? (
          <section className="grid gap-3 sm:grid-cols-2">
            <People title="Colaboradores" people={study.collaborators} empty="No vi etiquetas en la muestra." />
            <People title="Quienes comentan" people={study.commenters} empty="Nadie se repite en los comentarios." />
          </section>
          ) : null}
        </>
      )}

      <section className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm">Precios de referencia</p>
          <p className="text-xs text-muted-foreground">{props.state.settings.priceFile}</p>
        </div>
        {props.state.pricesError ? (
          <p className="mt-3 text-sm text-destructive">{props.state.pricesError}</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[28rem] text-left text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 font-medium">Pieza</th>
                  <th className="py-2 font-medium">Libertario</th>
                  <th className="py-2 font-medium">Competidor</th>
                  <th className="py-2 font-medium">Nota</th>
                </tr>
              </thead>
              <tbody>
                {props.state.prices.map((row) => (
                  <tr key={row.item} className="border-t border-border">
                    <td className="py-2">{row.item}</td>
                    <td className="py-2 tabular-nums">{row.libertario}</td>
                    <td className="py-2 tabular-nums">{row.competitor}</td>
                    <td className="py-2 text-muted-foreground">{row.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          {props.state.pricesNote || "Estas cifras se editan en el archivo. No se consultan solas."}
        </p>
      </section>
    </div>
  );
}

function Fact(props: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-background px-3 py-2">
      <p className="text-xs text-muted-foreground">{props.label}</p>
      <p className="mt-1 text-sm leading-snug">{props.value}</p>
    </div>
  );
}

function People(props: {
  title: string;
  people: { username: string; posts: number }[];
  empty: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-sm">{props.title}</p>
      {props.people.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{props.empty}</p>
      ) : (
        <ul className="mt-2 space-y-1 text-sm">
          {props.people.map((person) => (
            <li key={person.username} className="flex justify-between gap-3">
              <span>@{person.username}</span>
              <span className="tabular-nums text-muted-foreground">{person.posts}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
