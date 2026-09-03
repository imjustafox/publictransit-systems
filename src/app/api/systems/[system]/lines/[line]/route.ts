import { NextResponse } from "next/server";
import { getLine, getStationsByLine, getSystem } from "@/lib/data";

interface RouteParams {
  params: Promise<{ system: string; line: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const { system: systemId, line: lineId } = await params;

  let system;
  try {
    system = await getSystem(systemId);
  } catch {
    return NextResponse.json({ error: "System not found" }, { status: 404 });
  }

  try {
    const line = await getLine(systemId, lineId);

    if (!line) {
      return NextResponse.json({ error: "Line not found" }, { status: 404 });
    }

    const stations = await getStationsByLine(systemId, lineId);

    return NextResponse.json({
      data: {
        ...line,
        stations: stations.map((s) => ({
          id: s.id,
          name: s.name,
          status: s.status,
        })),
      },
      distanceUnit: system.stats.distanceUnit,
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch line" }, { status: 500 });
  }
}
