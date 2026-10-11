import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
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
      typeof payload.googleId !== "string" ||
      !/^\d{8,32}$/.test(payload.googleId)
    )
      return NextResponse.json(
        { error: "Invalid device registration" },
        { status: 400, headers: cors.headers },
      );
    const tokenHash = acarsTokenHash(
      request.headers.get("x-acars-token") ?? "",
    );
    const sourceIp = (
      request.headers.get("x-vercel-forwarded-for") ??
      request.headers.get("x-forwarded-for") ??
      "unknown"
    )
      .split(",")[0]!
      .trim();
    const secret = process.env.CONVEX_SYSTEM_SECRET!;
    const ipHash = createHash("sha256")
      .update(`${secret}:${sourceIp}`)
      .digest("hex");
    const alreadyRegistered = await convex.query(api.acars.isDeviceRegistered, {
      googleId: payload.googleId,
      tokenHash,
      systemSecret: secret,
    });
    if (!alreadyRegistered) {
      const limit = await convex.mutation(api.acars.reserveRegistration, {
        ipHash,
        systemSecret: secret,
      });
      if (!limit.allowed)
        return NextResponse.json(
          { error: "Too many ACARS registration attempts; try again later" },
          { status: 429, headers: cors.headers },
        );
    }
    await convex.mutation(api.acars.registerDevice, {
      googleId: payload.googleId,
      tokenHash,
      systemSecret: secret,
    });
    return NextResponse.json({ registered: true }, { headers: cors.headers });
  } catch (error) {
    console.error("ACARS device registration failed", error);
    return NextResponse.json(
      { error: "Could not register this ACARS device" },
      { status: 400, headers: cors.headers },
    );
  }
}
