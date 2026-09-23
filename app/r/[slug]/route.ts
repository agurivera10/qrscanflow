import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EDGE_REDIRECT_BASE =
  "https://yrfqqdfyqpmwcirwxgpo.supabase.co/functions/v1/scan-redirect";

function header(request: NextRequest, name: string) {
  const value = request.headers.get(name);
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function copyParam(target: URL, key: string, value: string | null) {
  if (value) target.searchParams.set(key, value);
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const target = new URL(EDGE_REDIRECT_BASE);

  target.searchParams.set("slug", slug);
  copyParam(target, "u", request.nextUrl.searchParams.get("u"));

  // Vercel derives these values from the incoming network connection.
  // They are approximate IP geolocation signals, never GPS.
  copyParam(target, "c", header(request, "x-vercel-ip-country"));
  copyParam(target, "r", header(request, "x-vercel-ip-country-region"));
  copyParam(target, "ci", header(request, "x-vercel-ip-city"));
  copyParam(target, "tz", header(request, "x-vercel-ip-timezone"));
  copyParam(target, "lat", header(request, "x-vercel-ip-latitude"));
  copyParam(target, "lon", header(request, "x-vercel-ip-longitude"));

  const response = NextResponse.redirect(target, 302);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
