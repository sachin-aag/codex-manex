import { NextResponse } from "next/server";

import { handleGitHubWebhook } from "@/lib/db/cases";
import { verifyGitHubWebhookSignature } from "@/lib/github";

export async function POST(request: Request) {
  try {
    const signature = request.headers.get("x-hub-signature-256");
    const eventName = request.headers.get("x-github-event");
    const payloadText = await request.text();

    if (!eventName) {
      return NextResponse.json(
        { error: "Missing event header", details: "x-github-event is required." },
        { status: 400 },
      );
    }

    if (!verifyGitHubWebhookSignature(payloadText, signature)) {
      return NextResponse.json(
        { error: "Invalid webhook signature" },
        { status: 401 },
      );
    }

    const payload = JSON.parse(payloadText) as Record<string, unknown>;
    const updated = await handleGitHubWebhook(eventName, payload);
    return NextResponse.json({ ok: true, updated: updated?.id ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to process GitHub webhook", details: message },
      { status: 500 },
    );
  }
}
