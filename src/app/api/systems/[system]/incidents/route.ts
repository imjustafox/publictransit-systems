import { NextResponse } from "next/server";
import { getIncidents } from "@/lib/data";

interface RouteParams {
  params: Promise<{ system: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { system: systemId } = await params;
    const incidents = await getIncidents(systemId);

    if (!incidents) {
      return NextResponse.json({
        data: null,
        message: "No incident data available for this system",
      });
    }

    return NextResponse.json({ data: incidents });
  } catch {
    return NextResponse.json({ error: "Failed to fetch incidents" }, { status: 500 });
  }
}
