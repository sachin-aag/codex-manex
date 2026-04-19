"use client";

import { useCallback, useEffect, useState } from "react";
import {
  lastNDaysRangeUtc,
  lastSixMonthsToDateRangeUtc,
  previousCalendarMonthRangeUtc,
} from "@/lib/date-range";

export type TimeRangeValue = { from: string; to: string } | null;

type PresetId = "7d" | "1mo" | "6mo" | "custom";

type Props = {
  value: TimeRangeValue;
  onChange: (range: TimeRangeValue) => void;
  isFetching?: boolean;
};

function rangesEqual(
  a: { from: string; to: string },
  b: { from: string; to: string },
): boolean {
  return a.from === b.from && a.to === b.to;
}

function presetForRange(range: TimeRangeValue): PresetId {
  if (range === null) return "custom";
  if (rangesEqual(range, lastNDaysRangeUtc(7))) return "7d";
  if (rangesEqual(range, previousCalendarMonthRangeUtc())) return "1mo";
  if (rangesEqual(range, lastSixMonthsToDateRangeUtc())) return "6mo";
  return "custom";
}

export function PortfolioTimeRange({
  value: rangeValue,
  onChange,
  isFetching,
}: Props) {
  /** True when user chose the Custom segment while range could still match a preset. */
  const [explicitCustom, setExplicitCustom] = useState(false);

  const [customFrom, setCustomFrom] = useState(
    () => rangeValue?.from ?? "",
  );
  const [customTo, setCustomTo] = useState(() => rangeValue?.to ?? "");

  useEffect(() => {
    if (!rangeValue) return;
    setCustomFrom(rangeValue.from);
    setCustomTo(rangeValue.to);
  }, [rangeValue]);

  const derivedPreset = presetForRange(rangeValue);
  const activePreset: PresetId = explicitCustom ? "custom" : derivedPreset;
  const showCustomDates =
    explicitCustom || derivedPreset === "custom";

  useEffect(() => {
    if (!showCustomDates) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(customFrom)) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(customTo)) return;
    if (customFrom > customTo) return;
    if (
      rangeValue &&
      rangeValue.from === customFrom &&
      rangeValue.to === customTo
    ) {
      return;
    }
    onChange({ from: customFrom, to: customTo });
  }, [showCustomDates, customFrom, customTo, onChange, rangeValue]);

  const applyPreset = useCallback(
    (id: Exclude<PresetId, "custom">) => {
      setExplicitCustom(false);
      if (id === "7d") onChange(lastNDaysRangeUtc(7));
      else if (id === "1mo") onChange(previousCalendarMonthRangeUtc());
      else onChange(lastSixMonthsToDateRangeUtc());
    },
    [onChange],
  );

  const onCustomSegment = useCallback(() => {
    setExplicitCustom(true);
    const raw = rangeValue ?? lastNDaysRangeUtc(7);
    setCustomFrom(raw.from);
    setCustomTo(raw.to);
  }, [rangeValue]);

  const segments: { id: PresetId; label: string }[] = [
    { id: "7d", label: "Last 7 days" },
    { id: "1mo", label: "Last month" },
    { id: "6mo", label: "Last 6 months" },
    { id: "custom", label: "Custom" },
  ];

  return (
    <section
      className="pf-time-range pf-time-range-card"
      aria-label="Report time range"
    >
      <div className="pf-time-range-inner">
        <div
          className="pf-time-segmented"
          role="tablist"
          aria-label="Time range presets"
        >
          {segments.map((seg) => {
            const isActive = activePreset === seg.id;
            return (
              <button
                key={seg.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-current={isActive ? "true" : undefined}
                className={`pf-time-segment ${isActive ? "pf-time-segment-active" : ""}`}
                disabled={isFetching}
                onClick={() => {
                  if (seg.id === "custom") {
                    onCustomSegment();
                    return;
                  }
                  applyPreset(seg.id);
                }}
              >
                {seg.label}
              </button>
            );
          })}
        </div>
        {isFetching ? (
          <span className="pf-time-range-loading" aria-live="polite">
            Updating…
          </span>
        ) : null}
      </div>

      {showCustomDates ? (
        <div
          className="pf-time-custom-row"
          aria-label="Custom date range"
        >
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="pf-time-date-input"
            aria-label="Start date"
          />
          <span className="pf-time-custom-arrow" aria-hidden>
            →
          </span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="pf-time-date-input"
            aria-label="End date"
          />
        </div>
      ) : null}
    </section>
  );
}
