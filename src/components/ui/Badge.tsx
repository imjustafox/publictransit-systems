import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { StationStatus, RailcarStatus } from "@/lib/types";

interface BadgeProps {
  children: ReactNode;
  variant?: "default" | "success" | "warning" | "error" | "info" | "outline";
  size?: "sm" | "md";
  className?: string;
}

export function Badge({ children, variant = "default", size = "sm", className }: BadgeProps) {
  const variantClasses = {
    default: "bg-bg-tertiary text-text-primary border-border",
    success: "bg-status-active/20 text-status-active border-status-active/30",
    warning: "bg-status-construction/20 text-status-construction border-status-construction/30",
    error: "bg-status-closed/20 text-status-closed border-status-closed/30",
    info: "bg-accent-secondary/20 text-accent-secondary border-accent-secondary/30",
    outline: "bg-transparent text-text-secondary border-border hover:border-border-hover",
  };

  const sizeClasses = {
    sm: "px-2 py-0.5 text-xs",
    md: "px-3 py-1 text-sm",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center font-mono border rounded-md transition-theme",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
    >
      {children}
    </span>
  );
}

interface StatusBadgeProps {
  status: StationStatus | RailcarStatus;
  className?: string;
}

const statusConfig: Record<
  StationStatus | RailcarStatus,
  { label: string; variant: BadgeProps["variant"] }
> = {
  active: { label: "Active", variant: "success" },
  closed: { label: "Closed", variant: "error" },
  "under-construction": { label: "Under Construction", variant: "warning" },
  retired: { label: "Retired", variant: "error" },
  testing: { label: "Testing", variant: "info" },
  disabled: { label: "Planned", variant: "default" },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status] || { label: status, variant: "default" as const };

  return (
    <Badge variant={config.variant} className={className}>
      {config.label}
    </Badge>
  );
}
