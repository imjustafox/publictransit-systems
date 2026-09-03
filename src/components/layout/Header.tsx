"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { DistanceUnitToggle } from "./DistanceUnitToggle";
import { CommandPalette } from "../search/CommandPalette";
import { cn } from "@/lib/utils";

export function Header() {
  const pathname = usePathname();
  const [commandOpen, setCommandOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-50 bg-bg-primary/95 backdrop-blur border-b border-border transition-theme">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          {/* Logo */}
          <Link
            href="/"
            className="flex items-center gap-2 shrink-0 group"
            aria-label="publictransit.systems home"
          >
            <div className="w-8 h-8 bg-accent-primary/20 rounded flex items-center justify-center group-hover:bg-accent-primary/30 transition-colors scanline-container">
              <svg
                className="w-5 h-5 text-accent-primary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                />
              </svg>
              <div className="scanline" />
            </div>
            <span className="font-mono font-semibold text-text-primary hidden sm:block">
              publictransit<span className="text-accent-primary">.systems</span>
            </span>
          </Link>

          {/* Navigation */}
          <nav className="hidden md:flex items-center gap-1" aria-label="Primary navigation">
            <NavLink href="/" active={pathname === "/"}>
              Systems
            </NavLink>
            <NavLink href="/compare" active={pathname === "/compare"}>
              Compare
            </NavLink>
            <NavLink href="/search" active={pathname === "/search"}>
              Search
            </NavLink>
            <NavLink href="/docs/api" active={pathname === "/docs/api"}>
              API
            </NavLink>
            <NavLink href="/docs/about" active={pathname === "/docs/about"}>
              About
            </NavLink>
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCommandOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded border border-border bg-bg-secondary hover:bg-bg-tertiary hover:border-border-hover transition-all text-text-muted hover:text-text-primary group"
              aria-label="Open search"
            >
              <Search className="w-4 h-4" />
              <span className="hidden sm:inline font-mono text-xs">Search</span>
              <kbd className="hidden lg:inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-bg-tertiary px-1.5 font-mono text-xs">
                ⌘K
              </kbd>
            </button>
            <DistanceUnitToggle />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
    </>
  );
}

interface NavLinkProps {
  href: string;
  active: boolean;
  children: React.ReactNode;
}

function NavLink({ href, active, children }: NavLinkProps) {
  return (
    <Link
      href={href}
      className={cn(
        "px-3 py-1.5 rounded text-sm font-mono transition-all relative",
        active
          ? "text-accent-primary"
          : "text-text-secondary hover:text-text-primary hover:bg-bg-tertiary"
      )}
    >
      {children}
      {active && (
        <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-primary glow-accent" />
      )}
    </Link>
  );
}
