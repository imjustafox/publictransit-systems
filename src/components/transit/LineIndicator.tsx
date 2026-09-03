import Link from "next/link";
import { cn } from "@/lib/utils";
import type { Line, LineIndicatorShape } from "@/lib/types";

interface LineIndicatorProps {
  line: Line | string;
  systemId?: string;
  size?: "sm" | "md" | "lg";
  shape?: LineIndicatorShape;
  showName?: boolean;
  linkable?: boolean;
  glow?: boolean;
  className?: string;
}

const lineColors: Record<string, string> = {
  red: "#BF0D3E",
  orange: "#ED8B00",
  yellow: "#FFD200",
  green: "#00B140",
  blue: "#009CDE",
  silver: "#A2A4A3",
  purple: "#522398",
};

const sizeClasses = {
  sm: "min-w-6 h-6 px-1 text-xs",
  md: "min-w-8 h-8 px-1.5 text-sm",
  lg: "min-w-10 h-10 px-2 text-base",
};

// Choose black or white text based on WCAG contrast against the line color.
function getContrastColor(hexColor: string): string {
  const rgb = hexToRgb(hexColor);
  if (!rgb) return "#ffffff";

  const backgroundLuminance = getRelativeLuminance(rgb);
  const contrastWithBlack = getContrastRatio(backgroundLuminance, 0);
  const contrastWithWhite = getContrastRatio(backgroundLuminance, 1);

  return contrastWithBlack >= contrastWithWhite ? "#000000" : "#ffffff";
}

function getContrastRatio(luminanceA: number, luminanceB: number): number {
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return (lighter + 0.05) / (darker + 0.05);
}

function getRelativeLuminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const [red, green, blue] = [r, g, b].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

export function LineIndicator({
  line,
  systemId,
  size = "md",
  shape = "circle",
  showName = false,
  linkable = true,
  glow = true,
  className,
}: LineIndicatorProps) {
  const isLineObject = typeof line === "object";
  const lineId = isLineObject ? line.id : line;
  const lineName = isLineObject
    ? line.name
    : `${line.charAt(0).toUpperCase()}${line.slice(1)} Line`;
  const colorHex = isLineObject ? line.colorHex : lineColors[line] || "#666";
  const shortName =
    isLineObject && line.abbreviation ? line.abbreviation : lineId.charAt(0).toUpperCase();

  const badge = (
    <div
      className={cn(
        "flex items-center justify-center font-mono font-bold transition-all",
        shape === "square" ? "rounded-sm" : "rounded-full",
        sizeClasses[size],
        "border-2 border-opacity-30"
      )}
      style={{
        backgroundColor: colorHex,
        color: getContrastColor(colorHex),
        borderColor: colorHex,
        boxShadow: glow ? `0 0 20px ${colorHex}40, 0 0 40px ${colorHex}20` : undefined,
      }}
    >
      {shortName}
    </div>
  );

  const content = (
    <div className={cn("flex items-center gap-2", className)}>
      {badge}
      {showName && <span className="text-sm font-mono text-text-primary">{lineName}</span>}
    </div>
  );

  if (linkable && systemId) {
    return (
      <Link
        href={`/${systemId}/lines/${lineId}`}
        className="hover:scale-110 transition-transform inline-block"
      >
        {content}
      </Link>
    );
  }

  return content;
}

interface LineIndicatorGroupProps {
  lines: (Line | string)[];
  systemId?: string;
  size?: "sm" | "md" | "lg";
  shape?: LineIndicatorShape;
  linkable?: boolean;
  glow?: boolean;
  className?: string;
}

export function LineIndicatorGroup({
  lines,
  systemId,
  size = "sm",
  shape = "circle",
  linkable = true,
  glow = true,
  className,
}: LineIndicatorGroupProps) {
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      {lines.map((line) => {
        const lineId = typeof line === "object" ? line.id : line;
        return (
          <LineIndicator
            key={lineId}
            line={line}
            systemId={systemId}
            size={size}
            shape={shape}
            linkable={linkable}
            glow={glow}
          />
        );
      })}
    </div>
  );
}
