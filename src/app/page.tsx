import { Suspense } from "react";
import { Panel } from "@/components/panel";

export default function HomePage() {
  return (
    <Suspense fallback={<p className="px-4 py-8 text-sm text-muted-foreground">Cargando el radar…</p>}>
      <Panel />
    </Suspense>
  );
}
