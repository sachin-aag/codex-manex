"use client";

import { type ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  DEFAULT_PORTFOLIO_RANGE,
  preloadPortfolioBundle,
} from "@/lib/client/portfolio-preload";
import { Sidebar } from "./sidebar";

export function AppShell({ children }: { children: ReactNode }) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const controller = new AbortController();
    const rdSearch = new URLSearchParams(DEFAULT_PORTFOLIO_RANGE);

    const warmPortfolioRoutes = () => {
      if (controller.signal.aborted) return;

      router.prefetch("/portfolio");
      router.prefetch("/rd");
      void preloadPortfolioBundle().catch(() => undefined);
      void fetch(`/api/rd/portfolio?${rdSearch.toString()}`, {
        signal: controller.signal,
      }).catch(() => undefined);
    };

    if (typeof window.requestIdleCallback === "function") {
      const idleId = window.requestIdleCallback(warmPortfolioRoutes, {
        timeout: 1500,
      });

      return () => {
        controller.abort();
        window.cancelIdleCallback(idleId);
      };
    }

    const timeoutId = window.setTimeout(warmPortfolioRoutes, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [router]);

  return (
    <div className="app-layout">
      <Sidebar
        collapsed={isSidebarCollapsed}
        onToggle={() => setIsSidebarCollapsed((current) => !current)}
      />
      <div className="app-content">{children}</div>
    </div>
  );
}
