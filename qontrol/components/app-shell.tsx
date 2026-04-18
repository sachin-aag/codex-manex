"use client";

import { type ReactNode } from "react";
import { Sidebar } from "./sidebar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-layout">
      <Sidebar />
      <div className="app-content">{children}</div>
    </div>
  );
}
