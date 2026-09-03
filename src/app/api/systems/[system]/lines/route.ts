import { NextResponse } from "next/server";
import { getLines, getSystem } from "@/lib/data";

interface RouteParams {
  params: Promise<{ system: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const { system: systemId } = await params;

  let system;
  try {
    system = await getSystem(systemId);
  } catch {
    return NextResponse.json({ error: "System not found" }, { status: 404 });
  }

  try {
    const lines = await getLines(systemId);
    return NextResponse.json({
      data: lines,
      count: lines.length,
      distanceUnit: system.stats.distanceUnit,
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch lines" }, { status: 500 });
  }
}
