import { startStudy } from "@/lib/jobs";


export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { username?: string };
  const result = await startStudy(body.username ?? "");
  return Response.json(result, { status: result.ok ? 200 : 409 });
}
