import { NextResponse } from "next/server";
import { pollGmailOnce, pollerStatus } from "@/lib/gmail-poller";

export const dynamic = "force-dynamic";

/** Manual "check inbox now" (LIVE + gmail). */
export async function POST() {
  return NextResponse.json(await pollGmailOnce());
}
export async function GET() {
  return NextResponse.json(pollerStatus());
}
