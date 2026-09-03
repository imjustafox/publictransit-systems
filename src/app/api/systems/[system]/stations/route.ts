import { NextResponse } from "next/server";
import { getStations } from "@/lib/data";

interface RouteParams {
  params: Promise<{ system: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { system: systemId } = await params;
    const url = new URL(request.url);
    const lineFilter = url.searchParams.get("line");
    const statusFilter = url.searchParams.get("status");

    let stations = await getStations(systemId);

    // Apply filters
    if (lineFilter) {
      stations = stations.filter((s) => s.lines.includes(lineFilter));
    }
    if (statusFilter) {
      stations = stations.filter((s) => s.status === statusFilter);
    }

    return NextResponse.json({
      data: stations,
      count: stations.length,
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch stations" }, { status: 404 });
  }
}
