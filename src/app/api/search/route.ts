import { openBrowser, startSearch, stopSearch } from "@/lib/jobs";


export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    kind?: "research" | "outreach";
  };
  if (body.action === "stop") return Response.json(await stopSearch());
  if (body.action === "login") {
    const result = await openBrowser(body.kind === "outreach" ? "outreach" : "research");
    return Response.json(result, { status: result.ok ? 200 : 400 });
  }
  const result = await startSearch();
  return Response.json(result, { status: result.ok ? 200 : 409 });
}
