import { NextRequest, NextResponse } from "next/server";
import { demoRedirects } from "@/lib/demo-redirects";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  const destination = demoRedirects[slug];

  if (!destination) {
    return NextResponse.redirect(new URL("/?missingQr=1", request.url), 302);
  }

  const scanEvent = {
    slug,
    qrName: destination.name,
    scannedAt: new Date().toISOString(),
    country: request.headers.get("x-vercel-ip-country"),
    region: request.headers.get("x-vercel-ip-country-region"),
    city: request.headers.get("x-vercel-ip-city"),
    userAgent: request.headers.get("user-agent"),
    referrer: request.headers.get("referer"),
  };

  // Temporary observability until Supabase is connected.
  // We intentionally do not persist the visitor IP.
  console.info("scanflow.scan", JSON.stringify(scanEvent));

  const response = NextResponse.redirect(destination.target, 302);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}
