import { NextResponse } from "next/server";
import { getRailcars } from "@/lib/data";

interface RouteParams {
  params: Promise<{ system: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { system: systemId } = await params;
    const url = new URL(request.url);
    const statusFilter = url.searchParams.get("status");

    let railcars = await getRailcars(systemId);

    if (statusFilter) {
      railcars = railcars.filter((r) => r.status === statusFilter);
    }

    return NextResponse.json({
      data: railcars,
      count: railcars.length,
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch railcars" }, { status: 404 });
  }
}
