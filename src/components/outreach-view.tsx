"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { DraftCard, DraftStatus, PanelState } from "@/lib/types";

const LABELS: Record<DraftStatus, string> = {
  draft: "Borrador",
  approved: "Aprobado",
  skipped: "Omitido",
  sending: "Enviando",
  sent: "Enviado",
  failed: "Falló",
};

export function OutreachView(props: {
  state: PanelState;
  onUpdate: (id: number, patch: { body?: string; status?: DraftStatus }) => void;
  onSend: (id: number) => Promise<string | null>;
}) {
  const drafts = props.state.drafts.filter((draft) => draft.cityId === props.state.settings.cityId);
  const [pending, setPending] = useState<DraftCard | null>(null);
  const sendOn = props.state.settings.sendEnabled && !props.state.settings.mockMode;

  return (
    <div className="space-y-3">
      <section className="rounded-2xl border border-border bg-card px-4 py-3 text-sm">
        {sendOn ? (
          <p>
            Envío manual con la otra cuenta. Hoy van {props.state.sendsToday} de{" "}
            {props.state.settings.sendDailyCap}. Hay pausa de varios minutos entre uno y otro.
          </p>
        ) : (
          <p>
            El envío está apagado. Los borradores se aprueban aquí y no salen solos. Para mandarlos
            hace falta otra cuenta de Instagram, distinta a la de investigación.
          </p>
        )}
      </section>

      {drafts.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          Todavía no hay invitaciones. En Radar, pulsa Invitar en un perfil.
        </p>
      ) : (
        drafts.map((draft) => (
          <DraftCardView
            key={draft.id}
            draft={draft}
            sendOn={sendOn}
            onUpdate={props.onUpdate}
            onAskSend={() => setPending(draft)}
          />
        ))
      )}

      <Dialog open={pending != null} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar este mensaje</DialogTitle>
            <DialogDescription>
              Sale desde la cuenta de envío, no desde la de investigación. Si Instagram pide una
              verificación, no se reintenta solo.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPending(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => {
                const id = pending?.id;
                setPending(null);
                if (id) void props.onSend(id);
              }}
            >
              Enviar ahora
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DraftCardView(props: {
  draft: DraftCard;
  sendOn: boolean;
  onUpdate: (id: number, patch: { body?: string; status?: DraftStatus }) => void;
  onAskSend: () => void;
}) {
  const { draft } = props;
  const locked = draft.status === "sent" || draft.status === "sending";
  const [edited, setEdited] = useState<string | null>(null);
  if (edited != null && edited === draft.body) setEdited(null);
  const body = edited ?? draft.body;
  return (
    <article className="rise-in rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{draft.fullName || draft.username}</p>
          <p className="text-sm text-muted-foreground">
            @{draft.username}
            {draft.zone ? ` · ${draft.zone}` : ""}
            {draft.shopName ? ` · ${draft.shopName}` : ""}
          </p>
        </div>
        <Badge variant={draft.status === "approved" ? "default" : "secondary"}>
          {LABELS[draft.status]}
        </Badge>
      </div>
      <Textarea
        className="mt-3 min-h-36 text-sm leading-relaxed"
        value={body}
        disabled={locked}
        onChange={(event) => setEdited(event.target.value)}
        onBlur={() => {
          if (body !== draft.body) props.onUpdate(draft.id, { body });
        }}
        aria-label={`Borrador para ${draft.username}`}
      />
      {draft.error ? <p className="mt-2 text-sm text-destructive">{draft.error}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          className="h-9"
          disabled={locked || draft.status === "approved"}
          onClick={() => props.onUpdate(draft.id, { status: "approved" })}
        >
          Aprobar
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-9"
          disabled={locked}
          onClick={() => props.onUpdate(draft.id, { status: "skipped" })}
        >
          Omitir
        </Button>
        {draft.status !== "draft" && !locked ? (
          <Button
            type="button"
            variant="ghost"
            className="h-9"
            onClick={() => props.onUpdate(draft.id, { status: "draft" })}
          >
            Volver a borrador
          </Button>
        ) : null}
        <Button
          type="button"
          variant="secondary"
          className="h-9"
          disabled={!props.sendOn || draft.status !== "approved"}
          onClick={props.onAskSend}
        >
          Enviar
        </Button>
        <Button type="button" variant="ghost" className="h-9" asChild>
          <a href={draft.profileUrl} target="_blank" rel="noreferrer">
            Ver perfil
          </a>
        </Button>
      </div>
    </article>
  );
}
