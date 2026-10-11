import "server-only";
import { createHash } from "node:crypto";

export function acarsTokenHash(token: string): string {
  if (!/^[a-f0-9]{64}$/.test(token))
    throw new Error("Invalid ACARS device token");
  return createHash("sha256").update(token).digest("hex");
}

export function acarsCors(origin: string | null) {
  let allowed = false;
  try {
    const url = new URL(origin ?? "");
    allowed =
      url.protocol === "https:" &&
      (url.hostname === "geo-fs.com" || url.hostname.endsWith(".geo-fs.com"));
  } catch {
    // Invalid and missing origins are denied.
  }
  return {
    allowed,
    headers: {
      "Access-Control-Allow-Origin": allowed ? origin! : "",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, X-Requested-With, X-ACARS-Token",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    },
  };
}

export async function screenAcars(
  body: string,
): Promise<{ flagged: boolean; categories: string[] }> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("ACARS moderation is not configured");
  const response = await fetch("https://api.openai.com/v1/moderations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ model: "omni-moderation-latest", input: body }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("ACARS moderation is unavailable");
  const result: unknown = await response.json();
  if (
    !result ||
    typeof result !== "object" ||
    !("results" in result) ||
    !Array.isArray(result.results)
  )
    throw new Error("ACARS moderation returned an invalid result");
  const first: unknown = result.results[0];
  if (
    !first ||
    typeof first !== "object" ||
    !("flagged" in first) ||
    typeof first.flagged !== "boolean"
  )
    throw new Error("ACARS moderation returned an invalid result");
  const categories =
    "categories" in first &&
    first.categories &&
    typeof first.categories === "object"
      ? Object.entries(first.categories)
          .filter(([, flagged]) => flagged === true)
          .map(([name]) => name)
      : [];
  return { flagged: first.flagged, categories };
}
