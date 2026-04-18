import { NextResponse } from "next/server";
import { fetchInitiatives } from "@/lib/portfolio-data";

export async function GET() {
  try {
    const initiatives = await fetchInitiatives();
    return NextResponse.json(initiatives);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}
