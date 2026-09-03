"use client";

import { ReactNode, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface TerminalProps {
  children: ReactNode;
  title?: string;
  className?: string;
  glow?: boolean;
  scanline?: boolean;
}

export function Terminal({
  children,
  title,
  className,
  glow = false,
  scanline = false,
}: TerminalProps) {
  return (
    <div
      className={cn(
        "bg-bg-secondary border border-border rounded-lg overflow-hidden transition-theme",
        glow && "glow-accent",
        scanline && "scanline-container",
        className
      )}
    >
      {title && (
        <div className="flex items-center gap-2 px-4 py-2 bg-bg-tertiary border-b border-border">
          <div className="flex gap-1.5">
            <span className="w-3 h-3 rounded-full bg-status-closed/60 transition-colors hover:bg-status-closed" />
            <span className="w-3 h-3 rounded-full bg-status-construction/60 transition-colors hover:bg-status-construction" />
            <span className="w-3 h-3 rounded-full bg-status-active/60 transition-colors hover:bg-status-active" />
          </div>
          <span className="font-mono text-xs text-text-muted ml-2">{title}</span>
        </div>
      )}
      <div className="p-4 font-mono text-sm overflow-x-auto" tabIndex={0}>
        {children}
      </div>
      {scanline && <div className="scanline" />}
    </div>
  );
}

interface TerminalLineProps {
  prompt?: string;
  children: ReactNode;
  className?: string;
  typing?: boolean;
  delay?: number;
}

export function TerminalLine({
  prompt = "$",
  children,
  className,
  typing = false,
  delay = 0,
}: TerminalLineProps) {
  const text = typeof children === "string" ? children : "";
  const [displayedText, setDisplayedText] = useState(typing ? "" : text);
  const [showCursor, setShowCursor] = useState(true);

  useEffect(() => {
    if (!typing || typeof children !== "string") {
      return;
    }

    const timeout = setTimeout(() => {
      let currentIndex = 0;
      const interval = setInterval(() => {
        if (currentIndex <= text.length) {
          setDisplayedText(text.slice(0, currentIndex));
          currentIndex++;
        } else {
          clearInterval(interval);
          setShowCursor(false);
        }
      }, 50);

      return () => clearInterval(interval);
    }, delay);

    return () => clearTimeout(timeout);
  }, [text, typing, delay, children]);

  if (!typing && displayedText !== text) {
    setDisplayedText(text);
  }

  useEffect(() => {
    if (!typing) return;

    const cursorInterval = setInterval(() => {
      setShowCursor((prev) => !prev);
    }, 500);

    return () => clearInterval(cursorInterval);
  }, [typing]);

  return (
    <div className={cn("flex gap-2", className)}>
      <span className="text-accent-primary select-none">{prompt}</span>
      <span className="text-text-primary">
        {typing ? displayedText : children}
        {typing && showCursor && (
          <span className="inline-block w-2 h-4 bg-accent-primary ml-0.5 animate-pulse" />
        )}
      </span>
    </div>
  );
}

interface TerminalOutputProps {
  children: ReactNode;
  className?: string;
  success?: boolean;
  error?: boolean;
}

export function TerminalOutput({
  children,
  className,
  success = false,
  error = false,
}: TerminalOutputProps) {
  return (
    <div
      className={cn(
        "ml-4",
        success && "text-status-active",
        error && "text-status-closed",
        !success && !error && "text-text-secondary",
        className
      )}
    >
      {children}
    </div>
  );
}
