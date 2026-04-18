"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

type Props = {
  spine: {
    part?: string | null;
    product?: string | null;
    article?: string | null;
    caseId?: string | null;
  };
  allowClear?: boolean;
};

export function SpineChipBar({ spine, allowClear = false }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const chips: { key: string; value: string }[] = [];
  if (spine.caseId) chips.push({ key: "Case", value: spine.caseId });
  if (spine.part) chips.push({ key: "Part", value: spine.part });
  if (spine.product) chips.push({ key: "Product", value: spine.product });
  if (spine.article) chips.push({ key: "Article", value: spine.article });

  if (chips.length === 0) return null;

  function copy(value: string) {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(value).catch(() => {});
    }
  }

  function clear() {
    const params = new URLSearchParams(search.toString());
    params.delete("part");
    params.delete("filter");
    router.push(`${pathname}${params.toString() ? `?${params}` : ""}`);
  }

  return (
    <div className="rd-spine-bar" aria-label="Active spine">
      <span className="rd-spine-bar-label">Spine</span>
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          className="rd-spine-chip"
          onClick={() => copy(c.value)}
          title={`Click to copy ${c.value}`}
        >
          <span className="rd-spine-chip-key">{c.key}</span>
          <span className="rd-spine-chip-value">{c.value}</span>
        </button>
      ))}
      {allowClear && (
        <button type="button" className="rd-spine-bar-clear" onClick={clear}>
          Clear filter
        </button>
      )}
    </div>
  );
}

export function OriginBadge({ value }: { value: string }) {
  return (
    <span className="rd-origin-badge" title={`Anchored on spine: ${value}`}>
      <em>from spine</em>·{value}
    </span>
  );
}
