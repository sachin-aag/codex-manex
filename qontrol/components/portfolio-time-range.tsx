"use client";

import { useCallback, useEffect, useState } from "react";
import { lastNWeeksRangeUtc } from "@/lib/date-range";

export type TimeRangeValue = { from: string; to: string } | null;

type Props = {
  value: TimeRangeValue;
  onChange: (range: TimeRangeValue) => void;
  isFetching?: boolean;
};

export function PortfolioTimeRange({
  value: rangeValue,
  onChange,
  isFetching,
}: Props) {
  const [customOpen, setCustomOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(
    () => rangeValue?.from ?? "",
  );
  const [customTo, setCustomTo] = useState(() => rangeValue?.to ?? "");

  useEffect(() => {
    if (!rangeValue) return;
    setCustomFrom(rangeValue.from);
    setCustomTo(rangeValue.to);
  }, [rangeValue]);

  const onAllData = useCallback(() => {
    setCustomOpen(false);
    onChange(null);
  }, [onChange]);

  const toggleCustom = useCallback(() => {
    setCustomOpen((o) => {
      if (!o) {
        const raw = rangeValue ?? lastNWeeksRangeUtc(8);
        setCustomFrom(raw.from);
        setCustomTo(raw.to);
      }
      return !o;
    });
  }, [rangeValue]);

  useEffect(() => {
    if (!customOpen) return;
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
  }, [customOpen, customFrom, customTo, onChange, rangeValue]);

  const isAllData = rangeValue === null;
  const customActive = customOpen || !isAllData;

  return (
    <section
      className="pf-time-range card-surface panel"
      aria-label="Report time range"
    >
      <div className="pf-time-range-toolbar">
        <span className="pf-time-range-label">Time range</span>
        <div className="pf-time-actions" role="group" aria-label="Filter mode">
          <button
            type="button"
            className={`pf-time-action ${isAllData ? "pf-time-action-active" : ""}`}
            onClick={onAllData}
            disabled={isFetching}
          >
            All data
          </button>
          <button
            type="button"
            className={`pf-time-action ${customActive ? "pf-time-action-active" : ""}`}
            onClick={toggleCustom}
            disabled={isFetching}
          >
            Custom
          </button>
        </div>
        {isFetching ? (
          <span className="pf-time-range-loading" aria-live="polite">
            Updating…
          </span>
        ) : null}
      </div>

      <p className="pf-time-range-hint">
        {rangeValue == null
          ? "No date filter."
          : `${rangeValue.from} → ${rangeValue.to}`}
      </p>

      {customOpen ? (
        <div className="pf-time-custom-panel">
          <label className="pf-time-custom-label">
            <span>From</span>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="pf-time-date-input"
            />
          </label>
          <label className="pf-time-custom-label">
            <span>To</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="pf-time-date-input"
            />
          </label>
        </div>
      ) : null}
    </section>
  );
}
