"use client";

import Link from "next/link";
import { useId } from "react";

type Tone = "primary" | "warning" | "danger";

type Props = {
  href: string;
  label: string;
  value: number;
  /** Scale maximum for needle position (value is clamped visually to this). */
  max: number;
  tone: Tone;
  subtitle: string;
};

const TONE_NEEDLE: Record<Tone, string> = {
  primary: "var(--brand-strong)",
  warning: "var(--warning)",
  danger: "var(--danger)",
};

function arcPath(cx: number, cy: number, r: number, start: number, end: number) {
  const x1 = cx + r * Math.cos(start);
  const y1 = cy - r * Math.sin(start);
  const x2 = cx + r * Math.cos(end);
  const y2 = cy - r * Math.sin(end);
  const sweep = end < start ? 1 : 0;
  const large = Math.abs(end - start) > Math.PI ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} ${sweep} ${x2} ${y2}`;
}

/** Semicircle gauge (π → 0): needle shows value / max. */
export function SignalGauge({ href, label, value, max, tone, subtitle }: Props) {
  const gradId = useId();
  const safeMax = Math.max(max, 1);
  const n = Math.min(Math.max(value / safeMax, 0), 1);
  const cx = 100;
  const cy = 98;
  const r = 72;
  const stroke = 12;

  const π = Math.PI;
  const needleAngle = π * (1 - n);
  const nx = cx + (r - 6) * Math.cos(needleAngle);
  const ny = cy - (r - 6) * Math.sin(needleAngle);

  return (
    <Link href={href} className={`rd-gauge-card rd-gauge-card--tone-${tone}`}>
      <span className="rd-gauge-label">{label}</span>
      <div className="rd-gauge-svg-wrap" aria-hidden>
        <svg viewBox="0 0 200 108" className="rd-gauge-svg">
          <defs>
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="var(--success)" />
              <stop offset="50%" stopColor="var(--warning)" />
              <stop offset="100%" stopColor="var(--danger)" />
            </linearGradient>
          </defs>
          <path
            d={arcPath(cx, cy, r, π, 0)}
            fill="none"
            stroke="var(--surface-muted)"
            strokeWidth={stroke + 4}
            strokeLinecap="round"
          />
          <path
            d={arcPath(cx, cy, r, π, 0)}
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth={stroke}
            strokeLinecap="round"
          />
          <line
            x1={cx}
            y1={cy}
            x2={nx}
            y2={ny}
            stroke={TONE_NEEDLE[tone]}
            strokeWidth={3}
            strokeLinecap="round"
          />
          <circle cx={cx} cy={cy} r={5} fill="var(--surface)" stroke={TONE_NEEDLE[tone]} strokeWidth={2} />
        </svg>
      </div>
      <span className="rd-gauge-value" style={{ color: TONE_NEEDLE[tone] }}>
        {value}
      </span>
      <span className="rd-gauge-sub">{subtitle}</span>
    </Link>
  );
}
