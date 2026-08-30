import { NextResponse } from "next/server";
import { repo } from "@/lib/data";
import { orchestratorStatus } from "@/lib/orchestrator-status";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const project = new URL(req.url).searchParams.get("project") ?? undefined;
  return NextResponse.json(await orchestratorStatus(await repo(), project));
}
