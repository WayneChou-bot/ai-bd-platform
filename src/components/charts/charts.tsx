"use client";
/**
 * Chart primitives (Recharts). Rules applied: one axis per chart, single-hue
 * blue for magnitude, a fixed validated categorical order only where identity
 * matters (reply breakdown), legend + direct labels, recessive grid, tooltips.
 */
import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

// Sequential / ordinal blue ramp (dark surface: no darker than step 600).
export const BLUE = { 250: "#86b6ef", 300: "#6da7ec", 350: "#5598e7", 400: "#3987e5", 450: "#2a78d6", 500: "#256abf", 550: "#1c5cab", 600: "#184f95" } as const;
// Validated categorical order for dark surfaces (fixed, never cycled).
export const CATEGORICAL = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"] as const;

const ink = { primary: "#e6eaf2", muted: "#8b95ad", grid: "rgba(148,163,184,0.12)" };

function Tip({ active, payload, label, fmt }: { active?: boolean; payload?: Array<{ value: number; name?: string; payload?: Record<string, unknown> }>; label?: string; fmt?: (v: number, row?: Record<string, unknown>) => string }) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="rounded-lg border border-white/10 bg-bg-elev px-3 py-2 text-xs shadow-lg">
      <div className="font-medium text-fg">{label ?? p.name}</div>
      <div className="text-muted">{fmt ? fmt(p.value, p.payload) : p.value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
export function FunnelBars({ data, height = 220 }: { data: Array<{ stage: string; value: number }>; height?: number }) {
  const steps = [BLUE[300], BLUE[350], BLUE[400], BLUE[450], BLUE[500], BLUE[550], BLUE[600]];
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 40, top: 4, bottom: 4 }} barCategoryGap={6}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="stage" width={92} tick={{ fill: ink.muted, fontSize: 12 }} axisLine={false} tickLine={false} />
        <Tooltip cursor={{ fill: "rgba(255,255,255,0.03)" }} content={<Tip fmt={(v, r) => `${v}${r?.pct != null ? ` · ${r.pct}% of discovered` : ""}`} />} />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} isAnimationActive>
          {data.map((_, i) => <Cell key={i} fill={steps[Math.min(i, steps.length - 1)]} />)}
          <LabelList dataKey="value" position="right" style={{ fill: ink.primary, fontSize: 12, fontVariantNumeric: "tabular-nums" }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
export function RateBars({ data, height = 200, suffix = "%", color = BLUE[400] }: { data: Array<{ label: string; value: number; n?: string }>; height?: number; suffix?: string; color?: string }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ left: 0, right: 8, top: 18, bottom: 0 }} barCategoryGap={18}>
        <CartesianGrid vertical={false} stroke={ink.grid} />
        <XAxis dataKey="label" tick={{ fill: ink.muted, fontSize: 12 }} axisLine={false} tickLine={false} interval={0} />
        <YAxis hide domain={[0, (max: number) => Math.max(10, Math.ceil(max / 10) * 10)]} />
        <Tooltip cursor={{ fill: "rgba(255,255,255,0.03)" }} content={<Tip fmt={(v, r) => `${v}${suffix}${r?.n ? ` (${r.n})` : ""}`} />} />
        <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} maxBarSize={56}>
          <LabelList dataKey="value" position="top" formatter={(v) => `${v}${suffix}`} style={{ fill: ink.primary, fontSize: 12, fontVariantNumeric: "tabular-nums" }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
export function TrendLine({ data, height = 200, color = BLUE[400] }: { data: Array<{ t: string; value: number }>; height?: number; color?: string }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ left: 0, right: 12, top: 10, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={ink.grid} />
        <XAxis dataKey="t" tick={{ fill: ink.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis width={28} tick={{ fill: ink.muted, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip cursor={{ stroke: ink.muted, strokeDasharray: "3 3" }} content={<Tip />} />
        <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={{ r: 3, fill: color, strokeWidth: 0 }} activeDot={{ r: 5, stroke: "#0c1224", strokeWidth: 2 }} isAnimationActive />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
export function Donut({ data, height = 200, total }: { data: Array<{ name: string; value: number }>; height?: number; total?: number }) {
  const sum = total ?? data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="flex items-center gap-4">
      <div style={{ width: height, height }} className="relative shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="90%" paddingAngle={2} stroke="#0c1224" strokeWidth={2} isAnimationActive>
              {data.map((_, i) => <Cell key={i} fill={CATEGORICAL[i % CATEGORICAL.length]} />)}
            </Pie>
            <Tooltip content={<Tip fmt={(v) => `${v} · ${sum ? Math.round((v / sum) * 100) : 0}%`} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="tabular text-2xl font-semibold">{sum}</span><span className="text-[10px] text-muted">total</span></div>
      </div>
      <ul className="space-y-1.5 text-sm">
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center gap-2"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: CATEGORICAL[i % CATEGORICAL.length] }} /><span className="text-muted">{d.name}</span><span className="tabular ml-auto pl-4">{d.value} <span className="text-xs text-muted">({sum ? Math.round((d.value / sum) * 100) : 0}%)</span></span></li>
        ))}
      </ul>
    </div>
  );
}
