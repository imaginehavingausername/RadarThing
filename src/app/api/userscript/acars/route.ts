import { NextRequest, NextResponse } from "next/server";
import { convex, api } from "~/server/convex";
import { acarsCors, acarsTokenHash, screenAcars } from "~/server/acars";
import type { Id } from "../../../../../convex/_generated/dataModel";

function guard(request: NextRequest) {
  const cors = acarsCors(request.headers.get("origin"));
  return {
    ...cors,
    authorized:
      cors.allowed &&
      request.headers.get("x-requested-with") === "GeoFS-RadarThing",
  };
}

export function OPTIONS(request: NextRequest) {
  const cors = acarsCors(request.headers.get("origin"));
  return new NextResponse(null, {
    status: cors.allowed ? 204 : 403,
    headers: cors.headers,
  });
}

export async function GET(request: NextRequest) {
  const check = guard(request);
  if (!check.authorized)
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403, headers: check.headers },
    );
  const googleId = request.nextUrl.searchParams.get("googleId") ?? "";
  const token = request.headers.get("x-acars-token");
  let messages;
  try {
    messages = token
      ? await convex.query(api.acars.listForDevice, {
          googleId,
          tokenHash: acarsTokenHash(token),
        })
      : await convex.query(api.acars.listPublic, { googleId });
  } catch {
    messages = await convex.query(api.acars.listPublic, { googleId });
  }
  return NextResponse.json(
    { messages },
    { headers: { ...check.headers, "Cache-Control": "no-store" } },
  );
}

export async function POST(request: NextRequest) {
  const check = guard(request);
  if (!check.authorized)
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403, headers: check.headers },
    );
  try {
    const payload: unknown = await request.json();
    if (
      !payload ||
      typeof payload !== "object" ||
      !("googleId" in payload) ||
      !("body" in payload) ||
      typeof payload.googleId !== "string" ||
      typeof payload.body !== "string"
    )
      return NextResponse.json(
        { error: "Invalid ACARS entry" },
        { status: 400, headers: check.headers },
      );
    const body = payload.body.trim();
    if (!body || body.length > 500)
      return NextResponse.json(
        { error: "ACARS text must be 1–500 characters" },
        { status: 400, headers: check.headers },
      );
    const tokenHash = acarsTokenHash(
      request.headers.get("x-acars-token") ?? "",
    );
    const status = await convex.mutation(api.acars.reservePosting, {
      googleId: payload.googleId,
      tokenHash,
      systemSecret: process.env.CONVEX_SYSTEM_SECRET!,
    });
    if ((status.retryAfter ?? 0) > 0)
      return NextResponse.json(
        { error: "Wait 30 seconds before publishing another entry" },
        { status: 429, headers: check.headers },
      );
    if (!status.allowed)
      return NextResponse.json(
        { error: "ACARS posting is unavailable for this pilot" },
        { status: 403, headers: check.headers },
      );
    const screening = await screenAcars(body);
    if (screening.flagged) {
      await convex.mutation(api.acars.recordBlocked, {
        googleId: payload.googleId,
        tokenHash,
        body,
        categories: screening.categories,
        systemSecret: process.env.CONVEX_SYSTEM_SECRET!,
      });
      return NextResponse.json(
        {
          error:
            "This ACARS entry could not be published under the content rules",
        },
        { status: 422, headers: check.headers },
      );
    }
    const id = await convex.mutation(api.acars.publish, {
      googleId: payload.googleId,
      tokenHash,
      body,
      systemSecret: process.env.CONVEX_SYSTEM_SECRET!,
    });
    return NextResponse.json(
      { id },
      { headers: { ...check.headers, "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("ACARS publish failed", error);
    return NextResponse.json(
      { error: "Could not publish ACARS entry" },
      { status: 503, headers: check.headers },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const check = guard(request);
  if (!check.authorized)
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403, headers: check.headers },
    );
  try {
    const payload: unknown = await request.json();
    if (
      !payload ||
      typeof payload !== "object" ||
      !("googleId" in payload) ||
      !("messageId" in payload) ||
      typeof payload.googleId !== "string" ||
      typeof payload.messageId !== "string"
    )
      return NextResponse.json(
        { error: "Invalid ACARS entry" },
        { status: 400, headers: check.headers },
      );
    await convex.mutation(api.acars.remove, {
      googleId: payload.googleId,
      tokenHash: acarsTokenHash(request.headers.get("x-acars-token") ?? ""),
      messageId: payload.messageId as Id<"acarsMessages">,
      systemSecret: process.env.CONVEX_SYSTEM_SECRET!,
    });
    return NextResponse.json({ removed: true }, { headers: check.headers });
  } catch (error) {
    console.error("ACARS removal failed", error);
    return NextResponse.json(
      { error: "Could not remove ACARS entry" },
      { status: 400, headers: check.headers },
    );
  }
}
