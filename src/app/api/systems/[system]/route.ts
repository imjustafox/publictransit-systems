import { NextResponse } from "next/server";
import { getSystem } from "@/lib/data";

interface RouteParams {
  params: Promise<{ system: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { system: systemId } = await params;
    const system = await getSystem(systemId);
    return NextResponse.json({ data: system });
  } catch {
    return NextResponse.json({ error: "System not found" }, { status: 404 });
  }
}
