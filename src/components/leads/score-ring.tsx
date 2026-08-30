"use client";
import { motion } from "framer-motion";

/** Animated score ring (Spec §33: 0 → score). */
export function ScoreRing({ value, label, size = 132 }: { value: number; label: string; size?: number }) {
  const r = (size - 14) / 2;
  const c = 2 * Math.PI * r;
  const color = value >= 80 ? "var(--c-engage)" : value >= 60 ? "var(--c-qualify)" : value >= 40 ? "var(--c-learn)" : "var(--c-danger)";
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.06)" strokeWidth={10} fill="none" />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={10} fill="none" strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c - (c * value) / 100 }}
          transition={{ duration: 1.1, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span className="tabular text-3xl font-semibold" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>{value}</motion.span>
        <span className="text-[10px] font-semibold tracking-wider" style={{ color }}>{label}</span>
      </div>
    </div>
  );
}
