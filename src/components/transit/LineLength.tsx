"use client";

import { useDistanceUnit } from "@/components/layout/DistanceUnitProvider";
import { convertDistance } from "@/lib/distance";
import type { DistanceUnit } from "@/lib/types";

interface LineLengthProps {
  length: number;
  sourceUnit: DistanceUnit;
  showUnit?: boolean;
  decimals?: number;
  className?: string;
}

export function LineLength({
  length,
  sourceUnit,
  showUnit = true,
  decimals = 1,
  className,
}: LineLengthProps) {
  const { unit: displayUnit } = useDistanceUnit();
  const converted = convertDistance(length, sourceUnit, displayUnit);

  return (
    <span className={className}>
      {converted.toFixed(decimals)}
      {showUnit ? ` ${displayUnit}` : ""}
    </span>
  );
}
