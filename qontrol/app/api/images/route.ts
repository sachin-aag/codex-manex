import { NextResponse } from "next/server";

const IMAGE_SERVER = "http://34.89.205.150:9000";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path");

  if (!path || !path.startsWith("/defect_images/")) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  // DB stores .jpg but actual files are .png — try original first, then swap extension
  const candidates = [path, path.replace(/\.jpg$/i, ".png")];

  for (const candidate of candidates) {
    try {
      const response = await fetch(`${IMAGE_SERVER}${candidate}`);
      if (response.ok) {
        const contentType = response.headers.get("content-type") ?? "image/png";
        const buffer = await response.arrayBuffer();
        return new NextResponse(buffer, {
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=86400",
          },
        });
      }
    } catch {
      continue;
    }
  }

  return NextResponse.json({ error: "Image not found" }, { status: 404 });
}
