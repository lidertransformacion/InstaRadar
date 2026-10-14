import { startSend } from "@/lib/jobs";


export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    draftId?: number;
    confirm?: boolean;
  };
  const result = await startSend(Number(body.draftId), Boolean(body.confirm));
  return Response.json(result, { status: result.ok ? 200 : 409 });
}
