"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import {
  DEFAULT_PORTFOLIO_RANGE,
  preloadPortfolioBundle,
} from "@/lib/client/portfolio-preload";
import { OPEN_INSIGHTS_CHAT_EVENT } from "@/lib/client/insights-chat";
import { InsightsChatPanel } from "./insights-chat-panel";
import { Sidebar } from "./sidebar";

export function AppShell({ children }: { children: ReactNode }) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
  const [insightsChatOpen, setInsightsChatOpen] = useState(false);
  const [insightsChatInset, setInsightsChatInset] = useState({
    top: 0,
    left: 0,
    placement: "left" as "left" | "top",
  });
  const sidebarRef = useRef<HTMLElement | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const showInsightsChat = pathname.startsWith("/portfolio/learnings");

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

  useEffect(() => {
    function handleOpenInsightsChat() {
      setInsightsChatOpen(true);
    }

    window.addEventListener(OPEN_INSIGHTS_CHAT_EVENT, handleOpenInsightsChat);
    return () => {
      window.removeEventListener(OPEN_INSIGHTS_CHAT_EVENT, handleOpenInsightsChat);
    };
  }, []);

  useEffect(() => {
    function updateInsightsChatInset() {
      const el = sidebarRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const placement = rect.height > rect.width ? "left" : "top";

      setInsightsChatInset({
        top: placement === "top" ? rect.bottom : 0,
        left: placement === "left" ? rect.right : 0,
        placement,
      });
    }

    updateInsightsChatInset();

    const el = sidebarRef.current;
    if (!el) return;

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => updateInsightsChatInset());

    resizeObserver?.observe(el);
    window.addEventListener("resize", updateInsightsChatInset);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateInsightsChatInset);
    };
  }, [isSidebarCollapsed, pathname, showInsightsChat]);

  return (
    <div className="app-layout">
      <Sidebar
        containerRef={sidebarRef}
        collapsed={isSidebarCollapsed}
        onToggle={() => setIsSidebarCollapsed((current) => !current)}
        onOpenInsightsChat={() => setInsightsChatOpen(true)}
        insightsChatOpen={insightsChatOpen}
      />
      <div className="app-content">{children}</div>
      <InsightsChatPanel
        inset={insightsChatInset}
        open={showInsightsChat && insightsChatOpen}
        onClose={() => setInsightsChatOpen(false)}
      />
    </div>
  );
}
