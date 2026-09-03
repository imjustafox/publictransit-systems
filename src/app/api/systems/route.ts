import { NextResponse } from "next/server";
import { getAllSystems } from "@/lib/data";

export async function GET() {
  try {
    const systems = await getAllSystems();
    return NextResponse.json({
      data: systems,
      count: systems.length,
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch systems" }, { status: 500 });
  }
}
