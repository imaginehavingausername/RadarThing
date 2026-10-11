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
