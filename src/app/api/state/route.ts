import { getPanelState } from "@/lib/db";


export async function GET() {
  try {
    return Response.json(getPanelState());
  } catch (error) {
    console.error("[radar] state failed", error);
    return Response.json({ error: "No pude leer los datos locales." }, { status: 500 });
  }
}
