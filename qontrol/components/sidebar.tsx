"use client";

import type { RefObject } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  sub?: string;
  icon: React.ReactNode;
  enabled: boolean;
  deptAccent?: "rd" | "prod" | "cs" | "scm";
};

const qmNav: NavItem[] = [
  {
    href: "/",
    label: "Qontrol Board",
    enabled: true,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    href: "/portfolio",
    label: "QM Portfolio",
    enabled: true,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
  {
    href: "/ceo-report",
    label: "CEO Report",
    enabled: true,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="14" rx="2" />
        <path d="M7 20h10" />
        <path d="M12 18v2" />
        <path d="M8 9h8" />
        <path d="M8 13h5" />
      </svg>
    ),
  },
  {
    href: "/portfolio/learnings",
    label: "Portfolio Insights",
    enabled: true,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    ),
  },
];

const deptNav: NavItem[] = [
  {
    href: "/rd",
    label: "R&D",
    sub: "Design / reliability",
    enabled: true,
    deptAccent: "rd",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 2v6l-3 3v11h10V11l-3-3V2" />
        <line x1="10" y1="2" x2="14" y2="2" />
      </svg>
    ),
  },
  {
    href: "#",
    label: "Production",
    sub: "Manufacturing",
    enabled: false,
    deptAccent: "prod",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 20h20" />
        <path d="M3 20V8l6 4V8l6 4V8l6 4v8" />
      </svg>
    ),
  },
  {
    href: "#",
    label: "Customer Service",
    sub: "Claims intake",
    enabled: false,
    deptAccent: "cs",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      </svg>
    ),
  },
  {
    href: "#",
    label: "Supply Chain",
    sub: "Supplier / batches",
    enabled: false,
    deptAccent: "scm",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="3" width="15" height="13" />
        <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
        <circle cx="5.5" cy="18.5" r="2.5" />
        <circle cx="18.5" cy="18.5" r="2.5" />
      </svg>
    ),
  },
];

type SidebarProps = {
  containerRef?: RefObject<HTMLElement | null>;
  collapsed: boolean;
  onToggle: () => void;
  onOpenInsightsChat: () => void;
  insightsChatOpen: boolean;
};

export function Sidebar({
  containerRef,
  collapsed,
  onToggle,
  onOpenInsightsChat,
  insightsChatOpen,
}: SidebarProps) {
  const pathname = usePathname();
  const showInsightsChat =
    pathname === "/portfolio/learnings" || pathname.startsWith("/portfolio/learnings/");

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    if (href === "#") return false;
    if (href === "/portfolio") {
      return pathname === "/portfolio" || pathname === "/portfolio/";
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <aside ref={containerRef} className={`sidebar ${collapsed ? "collapsed" : ""}`}>
      <div className="sidebar-top">
        <div className="sidebar-brand">
          <div className="sidebar-logo">Q</div>
          <div className="sidebar-brand-copy">
            <span className="sidebar-brand-title">Qontrol</span>
            <small className="sidebar-brand-tagline">Take Control of Quality.</small>
          </div>
        </div>
        <button
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="sidebar-toggle"
          onClick={onToggle}
          type="button"
        >
          <svg
            aria-hidden="true"
            fill="none"
            height="16"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
            width="16"
          >
            {collapsed ? (
              <polyline points="9 18 15 12 9 6" />
            ) : (
              <polyline points="15 18 9 12 15 6" />
            )}
          </svg>
        </button>
      </div>

      <nav className="sidebar-nav">
        <div className="sidebar-section-label">Quality Management</div>
        {qmNav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`sidebar-link ${isActive(item.href) ? "active" : ""}`}
            title={collapsed ? item.label : undefined}
          >
            {item.icon}
            <span>{item.label}</span>
          </Link>
        ))}

        <div className="sidebar-section-label" style={{ marginTop: 14 }}>
          Departments
        </div>
        {deptNav.map((item) =>
          item.enabled ? (
            <Link
              key={item.label}
              href={item.href}
              className={`sidebar-link sidebar-link-dept dept-${item.deptAccent} ${
                isActive(item.href) ? "active" : ""
              }`}
              title={collapsed ? item.label : undefined}
            >
              {item.icon}
              <span className="sidebar-link-text">
                <span>{item.label}</span>
                {item.sub && <small>{item.sub}</small>}
              </span>
            </Link>
          ) : (
            <span
              key={item.label}
              className={`sidebar-link sidebar-link-dept dept-${item.deptAccent} is-disabled`}
              aria-disabled="true"
              title="Coming soon"
            >
              {item.icon}
              <span className="sidebar-link-text">
                <span>{item.label}</span>
                <small>soon</small>
              </span>
            </span>
          ),
        )}
      </nav>

      {showInsightsChat ? (
        <div className="sidebar-footer">
          <button
            type="button"
            className="sidebar-assistant-button"
            onClick={onOpenInsightsChat}
            aria-pressed={insightsChatOpen}
            title={collapsed ? "Open portfolio insights copilot" : undefined}
          >
            <span className="sidebar-assistant-button-icon" aria-hidden="true">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 3c4.97 0 9 3.58 9 8s-4.03 8-9 8c-.7 0-1.39-.07-2.06-.22L4 21l1.53-4.08C4.56 15.5 3 13.4 3 11c0-4.42 4.03-8 9-8Z" />
                <path d="M9 11h6" />
                <path d="M12 8v6" />
              </svg>
            </span>
            <span className="sidebar-assistant-button-copy">
              <strong>Insights copilot</strong>
              <small>{insightsChatOpen ? "Open now" : "Ask with charts + SQL"}</small>
            </span>
          </button>
        </div>
      ) : null}
    </aside>
  );
}
