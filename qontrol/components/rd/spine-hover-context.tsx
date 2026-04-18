"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type SpineHover = {
  part: string | null;
  articleId: string | null;
  caseId: string | null;
};

type SpineHoverContextValue = {
  hovered: SpineHover;
  setHovered: (patch: Partial<SpineHover>) => void;
  clearHovered: () => void;
  isLinked: (patch: Partial<SpineHover>) => boolean;
};

const emptyHover: SpineHover = { part: null, articleId: null, caseId: null };

const Ctx = createContext<SpineHoverContextValue>({
  hovered: emptyHover,
  setHovered: () => {},
  clearHovered: () => {},
  isLinked: () => false,
});

export function SpineHoverProvider({ children }: { children: ReactNode }) {
  const [hovered, setHoveredState] = useState<SpineHover>(emptyHover);

  const setHovered = useCallback((patch: Partial<SpineHover>) => {
    setHoveredState((prev) => ({ ...prev, ...patch }));
  }, []);

  const clearHovered = useCallback(() => {
    setHoveredState(emptyHover);
  }, []);

  const isLinked = useCallback(
    (patch: Partial<SpineHover>) => {
      for (const k of Object.keys(patch) as (keyof SpineHover)[]) {
        const incoming = patch[k];
        const current = hovered[k];
        if (incoming && current && incoming === current) return true;
      }
      return false;
    },
    [hovered],
  );

  const value = useMemo(
    () => ({ hovered, setHovered, clearHovered, isLinked }),
    [hovered, setHovered, clearHovered, isLinked],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSpineHover() {
  return useContext(Ctx);
}

// Row helper hook: returns onMouseEnter/Leave handlers + is-linked className suffix.
export function useSpineRowProps(patch: Partial<SpineHover>) {
  const { setHovered, clearHovered, isLinked } = useSpineHover();
  return {
    onMouseEnter: () => setHovered(patch),
    onMouseLeave: () => clearHovered(),
    linkedClass: isLinked(patch) ? "is-linked" : "",
  };
}
