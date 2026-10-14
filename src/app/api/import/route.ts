import { getDb, importResearch } from "@/lib/db";
import { ResearchFileError } from "@/lib/ingest";

export async function POST(request: Request) {
  const raw = await request.text();
  if (!raw.trim()) {
    return Response.json({ error: "El archivo está vacío." }, { status: 400 });
  }
  try {
    const result = importResearch(getDb(), raw);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof ResearchFileError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    console.error("[radar] import failed", error);
    return Response.json({ error: "No pude cargar ese archivo." }, { status: 500 });
  }
}
