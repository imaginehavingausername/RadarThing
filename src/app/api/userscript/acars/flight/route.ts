import { NextRequest, NextResponse } from "next/server";
import { convex, api } from "~/server/convex";
import { acarsCors, acarsTokenHash } from "~/server/acars";

export function OPTIONS(request: NextRequest) {
  const cors = acarsCors(request.headers.get("origin"));
  return new NextResponse(null, {
    status: cors.allowed ? 204 : 403,
    headers: cors.headers,
  });
}

export async function POST(request: NextRequest) {
  const cors = acarsCors(request.headers.get("origin"));
  if (
    !cors.allowed ||
    request.headers.get("x-requested-with") !== "GeoFS-RadarThing"
  )
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403, headers: cors.headers },
    );

  try {
    const payload: unknown = await request.json();
    if (
      !payload ||
      typeof payload !== "object" ||
      !("googleId" in payload) ||
      !("sessionId" in payload) ||
      !("active" in payload) ||
      typeof payload.googleId !== "string" ||
      typeof payload.sessionId !== "string" ||
      typeof payload.active !== "boolean"
    )
      return NextResponse.json(
        { error: "Invalid ACARS flight session" },
        { status: 400, headers: cors.headers },
      );

    await convex.mutation(api.acars.setFlightSession, {
      googleId: payload.googleId,
      sessionId: payload.sessionId,
      active: payload.active,
      tokenHash: acarsTokenHash(request.headers.get("x-acars-token") ?? ""),
      systemSecret: process.env.CONVEX_SYSTEM_SECRET!,
    });
    return NextResponse.json(
      { ok: true },
      { headers: { ...cors.headers, "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("ACARS flight session update failed", error);
    return NextResponse.json(
      { error: "Could not update ACARS flight session" },
      { status: 400, headers: cors.headers },
    );
  }
}
