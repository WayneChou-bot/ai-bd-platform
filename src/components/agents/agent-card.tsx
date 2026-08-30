import { Card } from "@/components/ui/card";
import { Badge, type Tone } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const dot: Record<string, string> = { RUNNING: "bg-engage pulse", READY: "bg-engage", QUEUED: "bg-learn", FAILED: "bg-danger" };

export function AgentCard({ a }: { a: { label: string; tone: Tone; blurb: string; status: string; completed: number; failed: number; queued: number } }) {
  return (
    <Card className="relative overflow-hidden p-4">
      <div className={cn("absolute inset-x-0 top-0 h-0.5", `bg-${a.tone}`)} />
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">{a.label}</div>
        <span className="flex items-center gap-1.5 text-[11px] text-muted">
          <span className={cn("inline-block h-2 w-2 rounded-full", dot[a.status])} /> {a.status}
        </span>
      </div>
      <div className="mt-1 text-xs text-muted">{a.blurb}</div>
      <div className="tabular mt-3 flex gap-3 text-xs">
        <Badge tone={a.tone}>{a.completed} completed</Badge>
        {a.queued > 0 && <Badge tone="learn">{a.queued} queued</Badge>}
        {a.failed > 0 && <Badge tone="danger">{a.failed} failed</Badge>}
      </div>
    </Card>
  );
}
