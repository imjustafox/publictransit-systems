import { NextResponse } from "next/server";
import { getStation, getLines, getStationOutages } from "@/lib/data";

interface RouteParams {
  params: Promise<{ system: string; station: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { system: systemId, station: stationId } = await params;
    const station = await getStation(systemId, stationId);

    if (!station) {
      return NextResponse.json({ error: "Station not found" }, { status: 404 });
    }

    // Get line details for this station
    const allLines = await getLines(systemId);
    const stationLines = allLines.filter((l) => station.lines.includes(l.id));

    // Get current outages
    const outages = await getStationOutages(systemId, stationId);

    return NextResponse.json({
      data: {
        ...station,
        lineDetails: stationLines.map((l) => ({
          id: l.id,
          name: l.name,
          color: l.color,
          colorHex: l.colorHex,
        })),
        outages: outages.length > 0 ? outages : undefined,
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch station" }, { status: 500 });
  }
}
