"use client";

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
    href: "/portfolio/learnings",
    label: "Learnings",
    enabled: true,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    ),
  },
  {
    href: "/portfolio/initiatives",
    label: "Initiatives",
    enabled: true,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 11 12 14 22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
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

function deptFromPath(pathname: string): { label: string; accent: string } {
  if (pathname.startsWith("/rd")) return { label: "R&D · Engineering view", accent: "rd" };
  return { label: "QE · Management view", accent: "qm" };
}

export function Sidebar() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    if (href === "#") return false;
    return pathname.startsWith(href);
  }

  const footer = deptFromPath(pathname);

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-logo">Q</div>
        <span>Qontrol</span>
      </div>

      <nav className="sidebar-nav">
        <div className="sidebar-section-label">Quality Management</div>
        {qmNav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`sidebar-link ${isActive(item.href) ? "active" : ""}`}
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

      <div className="sidebar-footer">
        <div className={`sidebar-env-badge env-${footer.accent}`}>{footer.label}</div>
      </div>
    </aside>
  );
}
