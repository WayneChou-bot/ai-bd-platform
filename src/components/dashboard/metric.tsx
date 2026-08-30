import { Card } from "@/components/ui/card";
import { fmtInt } from "@/lib/utils";

export function Metric({ label, value, hint, suffix, formula }: { label: string; value: number; hint?: string; suffix?: string; formula?: string }) {
  return (
    <Card className="lift px-4 py-3" title={formula}>
      <div className="text-xs text-muted">{label}</div>
      <div className="tabular mt-1 text-2xl font-semibold">{fmtInt(value)}{suffix}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted">{hint}</div>}
    </Card>
  );
}
