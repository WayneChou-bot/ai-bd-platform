import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { repo } from "@/lib/data";
import { grantPlaybackApproval, playbackState, startDemoPlayback } from "@/lib/demo-playback";

export const dynamic = "force-dynamic";

/** Start Demo (§34) or approve the paused draft. DEMO mode only — never touches paid APIs. */
export async function POST(req: Request) {
  if (getConfig().mode !== "demo") return new NextResponse("Demo playback is only available in DEMO mode", { status: 403 });
  const action = new URL(req.url).searchParams.get("action");
  if (action === "approve") {
    const ok = grantPlaybackApproval();
    return ok ? NextResponse.json({ approved: true }) : new NextResponse("Nothing is waiting for approval", { status: 409 });
  }
  const st = await startDemoPlayback(await repo());
  return NextResponse.json({ running: st.running, projectId: st.projectId, step: st.step });
}
export async function GET() {
  return NextResponse.json(playbackState());
}
