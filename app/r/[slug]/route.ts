import { createHmac, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { demoRedirects } from "@/lib/demo-redirects";
import { applyRouting } from "@/lib/routing";
import { randomPublicToken, trackingMarker } from "@/lib/serialization";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Resolution = {
  slug: string;
  qr_code_id: string | null;
  qr_version_id: string | null;
  workspace_id: string | null;
  campaign_id: string | null;
  resolved_url: string;
  routing_rules: unknown;
  status: string;
};

type UnitResolution = { id: string; batch_id: string; public_token: string };

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

function localHour(timezone: string | null) {
  try { return Number(new Intl.DateTimeFormat("en-US", { timeZone: timezone || "UTC", hour: "2-digit", hour12: false }).format(new Date())); }
  catch { return new Date().getUTCHours(); }
}

function pseudonymousRequestHash(request: NextRequest) {
  const secret = process.env.TRACKING_SECRET;
  if (!secret) return null;
  const rawIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  const ua = request.headers.get("user-agent") || "unknown";
  const day = new Date().toISOString().slice(0, 10);
  // Raw IP exists only for this in-memory HMAC and is never persisted.
  return createHmac("sha256", `${secret}:${day}`).update(`${rawIp}|${ua}`).digest("hex");
}

function supabaseHeaders() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  return secret ? { apikey: secret, Authorization: `Bearer ${secret}` } : null;
}

async function resolveDestination(slug: string): Promise<Resolution | null> {
  const base = process.env.SUPABASE_URL;
  const headers = supabaseHeaders();
  if (base && headers) {
    try {
      const query = new URL(`${base}/rest/v1/redirect_resolutions`);
      query.searchParams.set("slug", `eq.${slug}`);
      query.searchParams.set("select", "slug,qr_code_id,qr_version_id,workspace_id,campaign_id,resolved_url,routing_rules,status");
      query.searchParams.set("limit", "1");
      const res = await fetch(query, { headers, cache: "no-store" });
      if (res.ok) {
        const rows = await res.json() as Resolution[];
        if (rows[0]?.status === "active") return rows[0];
      }
    } catch (error) { console.error("scanflow.resolve_failed", error); }
  }
  const demo = demoRedirects[slug];
  return demo ? { slug, qr_code_id: null, qr_version_id: null, workspace_id: null, campaign_id: null, resolved_url: demo.target, routing_rules: [], status: "active" } : null;
}

async function resolveUnit(token: string | null, workspaceId: string | null): Promise<UnitResolution | null> {
  const base = process.env.SUPABASE_URL;
  const headers = supabaseHeaders();
  if (!token || !workspaceId || !base || !headers) return null;
  try {
    const query = new URL(`${base}/rest/v1/distribution_units`);
    query.searchParams.set("public_token", `eq.${token}`);
    query.searchParams.set("workspace_id", `eq.${workspaceId}`);
    query.searchParams.set("select", "id,batch_id,public_token");
    query.searchParams.set("limit", "1");
    const res = await fetch(query, { headers, cache: "no-store" });
    if (!res.ok) return null;
    const rows = await res.json() as UnitResolution[];
    return rows[0] || null;
  } catch { return null; }
}

function attachWhatsAppTrackingRef(url: string, ref: string) {
  try {
    const target = new URL(url);
    const whatsappHost = target.hostname === "wa.me" || target.hostname.endsWith("whatsapp.com");
    if (!whatsappHost) return url;
    const existing = target.searchParams.get("text") || "";
    if (existing.includes("[SF:")) return url;
    target.searchParams.set("text", `${existing}${existing ? "\n\n" : ""}${trackingMarker(ref)}`);
    return target.toString();
  } catch { return url; }
}

async function persistEvents(events: Record<string, unknown>[]) {
  const base = process.env.SUPABASE_URL;
  const headers = supabaseHeaders();
  if (!base || !headers || !events[0]?.workspace_id) { console.info("scanflow.events", JSON.stringify(events)); return; }
  try {
    const res = await fetch(`${base}/rest/v1/events`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(events), cache: "no-store",
    });
    if (!res.ok) console.error("scanflow.event_write_failed", res.status, await res.text());
  } catch (error) { console.error("scanflow.event_write_failed", error); }
}

export async function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const resolution = await resolveDestination(slug);
  if (!resolution) return NextResponse.redirect(new URL("/?missingQr=1", request.url), 302);

  const visitorId = request.cookies.get("sf_vid")?.value || randomUUID();
  const sessionId = request.cookies.get("sf_sid")?.value || randomUUID();
  const trackingRef = randomPublicToken(7);
  const userAgent = request.headers.get("user-agent");
  const parsed = parseDevice(userAgent);
  const timezone = header(request, "x-vercel-ip-timezone");
  const country = header(request, "x-vercel-ip-country");
  const region = header(request, "x-vercel-ip-country-region");
  const city = header(request, "x-vercel-ip-city");
  const routed = applyRouting(resolution.resolved_url, resolution.routing_rules, { country, region, city, device: parsed.device, localHour: localHour(timezone) }, visitorId);
  const finalUrl = attachWhatsAppTrackingRef(routed.url, trackingRef);
  const now = new Date().toISOString();
  const unitToken = request.nextUrl.searchParams.get("u");
  const unit = await resolveUnit(unitToken, resolution.workspace_id);
  const requestHash = pseudonymousRequestHash(request);
  const latitude = Number(header(request, "x-vercel-ip-latitude"));
  const longitude = Number(header(request, "x-vercel-ip-longitude"));
  const common = {
    workspace_id: resolution.workspace_id, qr_code_id: resolution.qr_code_id, qr_version_id: resolution.qr_version_id,
    campaign_id: resolution.campaign_id, distribution_batch_id: unit?.batch_id || null, distribution_unit_id: unit?.id || null,
    occurred_at: now, visitor_id: visitorId, session_id: sessionId, request_hash: requestHash, country, region, city, timezone,
    latitude: Number.isFinite(latitude) ? latitude : null, longitude: Number.isFinite(longitude) ? longitude : null,
    device_type: parsed.device, os: parsed.os, browser: parsed.browser, user_agent: userAgent,
    referrer: request.headers.get("referer"),
  };
  const baseMetadata = { slug, unit_token: unitToken, tracking_ref: trackingRef, routing_rule_id: routed.ruleId, geo_is_approximate: true, raw_ip_persisted: false };
  await persistEvents([
    { ...common, event_type: "qr.scan", is_exact: true, metadata: baseMetadata },
    { ...common, event_type: "qr.redirect", is_exact: true, metadata: { ...baseMetadata, destination: new URL(finalUrl).hostname } },
  ]);

  const response = NextResponse.redirect(finalUrl, 302);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.cookies.set("sf_vid", visitorId, { httpOnly: true, sameSite: "lax", secure: true, maxAge: 60 * 60 * 24 * 365, path: "/" });
  response.cookies.set("sf_sid", sessionId, { httpOnly: true, sameSite: "lax", secure: true, maxAge: 60 * 30, path: "/" });
  return response;
}
