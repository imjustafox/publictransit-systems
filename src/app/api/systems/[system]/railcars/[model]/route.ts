import { NextResponse } from "next/server";
import { getRailcar } from "@/lib/data";

interface RouteParams {
  params: Promise<{ system: string; model: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { system: systemId, model: railcarId } = await params;
    const railcar = await getRailcar(systemId, railcarId);

    if (!railcar) {
      return NextResponse.json({ error: "Railcar not found" }, { status: 404 });
    }

    return NextResponse.json({ data: railcar });
  } catch {
    return NextResponse.json({ error: "Failed to fetch railcar" }, { status: 500 });
  }
}
