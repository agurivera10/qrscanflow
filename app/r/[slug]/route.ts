import { createHmac, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { demoRedirects } from "@/lib/demo-redirects";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Resolution = {
  slug: string;
  qr_code_id: string | null;
  qr_version_id: string | null;
  workspace_id: string | null;
  campaign_id: string | null;
  resolved_url: string;
  status: string;
};

function header(request: NextRequest, name: string) {
  const value = request.headers.get(name);
  if (!value) return null;
  try { return decodeURIComponent(value); } catch { return value; }
}

function parseDevice(userAgent: string | null) {
  const ua = userAgent || "";
  const device = /ipad|tablet/i.test(ua) ? "tablet" : /mobile|iphone|android/i.test(ua) ? "mobile" : "desktop";
  const os = /iphone|ipad/i.test(ua) ? "iOS" : /android/i.test(ua) ? "Android" : /windows/i.test(ua) ? "Windows" : /mac os|macintosh/i.test(ua) ? "macOS" : "Other";
  const browser = /edg/i.test(ua) ? "Edge" : /chrome|crios/i.test(ua) ? "Chrome" : /safari/i.test(ua) ? "Safari" : /firefox|fxios/i.test(ua) ? "Firefox" : "Other";
  return { device, os, browser };
}

function pseudonymousRequestHash(request: NextRequest) {
  const secret = process.env.TRACKING_SECRET;
  if (!secret) return null;
  const rawIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  const ua = request.headers.get("user-agent") || "unknown";
  const day = new Date().toISOString().slice(0, 10);
  // Raw IP exists only in memory for this HMAC operation and is never persisted.
  return createHmac("sha256", `${secret}:${day}`).update(`${rawIp}|${ua}`).digest("hex");
}

async function resolveDestination(slug: string): Promise<Resolution | null> {
  const base = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (base && secret) {
    try {
      const query = new URL(`${base}/rest/v1/redirect_resolutions`);
      query.searchParams.set("slug", `eq.${slug}`);
      query.searchParams.set("select", "slug,qr_code_id,qr_version_id,workspace_id,campaign_id,resolved_url,status");
      query.searchParams.set("limit", "1");
      const res = await fetch(query, { headers: { apikey: secret, Authorization: `Bearer ${secret}` }, cache: "no-store" });
      if (res.ok) {
        const rows = await res.json() as Resolution[];
        if (rows[0]?.status === "active") return rows[0];
      }
    } catch (error) {
      console.error("scanflow.resolve_failed", error);
    }
  }

  const demo = demoRedirects[slug];
  return demo ? { slug, qr_code_id: null, qr_version_id: null, workspace_id: null, campaign_id: null, resolved_url: demo.target, status: "active" } : null;
}

async function persistEvents(events: Record<string, unknown>[]) {
  const base = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!base || !secret || !events[0]?.workspace_id) {
    console.info("scanflow.events", JSON.stringify(events));
    return;
  }
  try {
    const res = await fetch(`${base}/rest/v1/events`, {
      method: "POST",
      headers: { apikey: secret, Authorization: `Bearer ${secret}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(events),
      cache: "no-store",
    });
    if (!res.ok) console.error("scanflow.event_write_failed", res.status, await res.text());
  } catch (error) {
    console.error("scanflow.event_write_failed", error);
  }
}

export async function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const resolution = await resolveDestination(slug);
  if (!resolution) return NextResponse.redirect(new URL("/?missingQr=1", request.url), 302);

  const visitorId = request.cookies.get("sf_vid")?.value || randomUUID();
  const sessionId = request.cookies.get("sf_sid")?.value || randomUUID();
  const userAgent = request.headers.get("user-agent");
  const parsed = parseDevice(userAgent);
  const now = new Date().toISOString();
  const unitToken = request.nextUrl.searchParams.get("u");
  const requestHash = pseudonymousRequestHash(request);
  const common = {
    workspace_id: resolution.workspace_id,
    qr_code_id: resolution.qr_code_id,
    qr_version_id: resolution.qr_version_id,
    campaign_id: resolution.campaign_id,
    occurred_at: now,
    visitor_id: visitorId,
    session_id: sessionId,
    request_hash: requestHash,
    country: header(request, "x-vercel-ip-country"),
    region: header(request, "x-vercel-ip-country-region"),
    city: header(request, "x-vercel-ip-city"),
    timezone: header(request, "x-vercel-ip-timezone"),
    latitude: header(request, "x-vercel-ip-latitude"),
    longitude: header(request, "x-vercel-ip-longitude"),
    device_type: parsed.device,
    os: parsed.os,
    browser: parsed.browser,
    user_agent: userAgent,
    referrer: request.headers.get("referer"),
    metadata: { slug, unit_token: unitToken, geo_is_approximate: true, raw_ip_persisted: false },
  };

  await persistEvents([
    { ...common, event_type: "qr.scan", is_exact: true },
    { ...common, event_type: "qr.redirect", is_exact: true, metadata: { ...common.metadata as object, destination: new URL(resolution.resolved_url).hostname } },
  ]);

  const response = NextResponse.redirect(resolution.resolved_url, 302);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.cookies.set("sf_vid", visitorId, { httpOnly: true, sameSite: "lax", secure: true, maxAge: 60 * 60 * 24 * 365, path: "/" });
  response.cookies.set("sf_sid", sessionId, { httpOnly: true, sameSite: "lax", secure: true, maxAge: 60 * 30, path: "/" });
  return response;
}
