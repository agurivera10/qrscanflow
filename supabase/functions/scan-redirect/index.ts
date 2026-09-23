import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type Resolution = {
  slug: string;
  qr_code_id: string;
  qr_version_id: string;
  workspace_id: string;
  campaign_id: string | null;
  resolved_url: string;
  routing_rules: unknown;
  status: string;
};

type UnitResolution = { id: string; batch_id: string; public_token: string };

type RoutingRule = {
  id?: string;
  enabled?: boolean;
  priority?: number;
  destinationUrl: string;
  conditions?: {
    country?: string;
    region?: string;
    city?: string;
    device?: string;
    hourFrom?: number;
    hourTo?: number;
  };
  trafficPercent?: number;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

function getSecretKey() {
  const modern = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (modern) {
    try {
      const keys = JSON.parse(modern) as Record<string, string>;
      if (keys.default) return keys.default;
      const first = Object.values(keys)[0];
      if (first) return first;
    } catch {}
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
}

const SECRET_KEY = getSecretKey();

function apiHeaders(extra: Record<string, string> = {}) {
  return { apikey: SECRET_KEY, ...extra };
}

function cookieValue(req: Request, name: string) {
  const cookie = req.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function randomToken(length = 7) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, b => alphabet[b % alphabet.length]).join("");
}

function stableBucket(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0) % 100;
}

function parseDevice(userAgent: string | null) {
  const ua = userAgent || "";
  const device = /ipad|tablet/i.test(ua) ? "tablet" : /mobile|iphone|android/i.test(ua) ? "mobile" : "desktop";
  const os = /iphone|ipad/i.test(ua) ? "iOS" : /android/i.test(ua) ? "Android" : /windows/i.test(ua) ? "Windows" : /mac os|macintosh/i.test(ua) ? "macOS" : "Other";
  const browser = /edg/i.test(ua) ? "Edge" : /chrome|crios/i.test(ua) ? "Chrome" : /safari/i.test(ua) ? "Safari" : /firefox|fxios/i.test(ua) ? "Firefox" : "Other";
  return { device, os, browser };
}

function isLikelyBot(userAgent: string | null) {
  const ua = userAgent || "";
  return /bot|crawler|spider|preview|facebookexternalhit|telegrambot|slackbot|discordbot|twitterbot|linkedinbot|googlebot|bingbot|headless|curl|wget/i.test(ua);
}

function localHour(timezone: string | null) {
  try {
    return Number(new Intl.DateTimeFormat("en-US", {
      timeZone: timezone || "UTC",
      hour: "2-digit",
      hour12: false,
    }).format(new Date()));
  } catch {
    return new Date().getUTCHours();
  }
}

function matches(rule: RoutingRule, context: { country: string | null; region: string | null; city: string | null; device: string; localHour: number }) {
  const c = rule.conditions || {};
  if (c.country && c.country.toLowerCase() !== context.country?.toLowerCase()) return false;
  if (c.region && c.region.toLowerCase() !== context.region?.toLowerCase()) return false;
  if (c.city && c.city.toLowerCase() !== context.city?.toLowerCase()) return false;
  if (c.device && c.device.toLowerCase() !== context.device.toLowerCase()) return false;
  if (typeof c.hourFrom === "number" && context.localHour < c.hourFrom) return false;
  if (typeof c.hourTo === "number" && context.localHour >= c.hourTo) return false;
  return true;
}

function applyRouting(baseUrl: string, rules: unknown, context: { country: string | null; region: string | null; city: string | null; device: string; localHour: number }, visitorId: string) {
  if (!Array.isArray(rules) || rules.length === 0) return { url: baseUrl, ruleId: null as string | null };
  const ordered = (rules as RoutingRule[])
    .filter(rule => rule?.enabled !== false && Boolean(rule?.destinationUrl))
    .sort((a, b) => (a.priority || 0) - (b.priority || 0));

  for (const rule of ordered) {
    if (!matches(rule, context)) continue;
    const traffic = Math.max(0, Math.min(100, rule.trafficPercent ?? 100));
    if (stableBucket(`${visitorId}:${rule.id || rule.destinationUrl}`) >= traffic) continue;
    return { url: rule.destinationUrl, ruleId: rule.id || null };
  }
  return { url: baseUrl, ruleId: null as string | null };
}

async function requestHash(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
  if (!ip) return null;
  const ua = req.headers.get("user-agent") || "unknown";
  const day = new Date().toISOString().slice(0, 10);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`${SECRET_KEY}:${day}:scanflow`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${ip}|${ua}`));
  return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function resolveDestination(slug: string): Promise<Resolution | null> {
  const url = new URL(`${SUPABASE_URL}/rest/v1/redirect_resolutions`);
  url.searchParams.set("slug", `eq.${slug}`);
  url.searchParams.set("select", "slug,qr_code_id,qr_version_id,workspace_id,campaign_id,resolved_url,routing_rules,status");
  url.searchParams.set("limit", "1");
  const res = await fetch(url, { headers: apiHeaders(), cache: "no-store" });
  if (!res.ok) throw new Error(`resolution ${res.status}: ${await res.text()}`);
  const rows = await res.json() as Resolution[];
  return rows[0]?.status === "active" ? rows[0] : null;
}

async function resolveUnit(token: string | null, workspaceId: string): Promise<UnitResolution | null> {
  if (!token) return null;
  const url = new URL(`${SUPABASE_URL}/rest/v1/distribution_units`);
  url.searchParams.set("public_token", `eq.${token}`);
  url.searchParams.set("workspace_id", `eq.${workspaceId}`);
  url.searchParams.set("select", "id,batch_id,public_token");
  url.searchParams.set("limit", "1");
  const res = await fetch(url, { headers: apiHeaders(), cache: "no-store" });
  if (!res.ok) return null;
  const rows = await res.json() as UnitResolution[];
  return rows[0] || null;
}

function attachWhatsAppTrackingRef(url: string, ref: string) {
  try {
    const target = new URL(url);
    const whatsappHost = target.hostname === "wa.me" || target.hostname.endsWith("whatsapp.com");
    if (!whatsappHost) return url;
    const existing = target.searchParams.get("text") || "";
    if (!existing.includes("[SF:")) {
      target.searchParams.set("text", `${existing}${existing ? "\n\n" : ""}[SF:${ref}]`);
    }
    return target.toString();
  } catch {
    return url;
  }
}

async function persistEvents(events: Record<string, unknown>[]) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/events`, {
    method: "POST",
    headers: apiHeaders({ "Content-Type": "application/json", Prefer: "return=minimal" }),
    body: JSON.stringify(events),
  });
  if (!res.ok) throw new Error(`event write ${res.status}: ${await res.text()}`);
}

function redirectResponse(url: string, visitorId: string, sessionId: string) {
  const headers = new Headers({
    Location: url,
    "Cache-Control": "no-store, max-age=0",
    "Referrer-Policy": "no-referrer",
  });
  headers.append("Set-Cookie", `sf_vid=${encodeURIComponent(visitorId)}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`);
  headers.append("Set-Cookie", `sf_sid=${encodeURIComponent(sessionId)}; Path=/; Max-Age=1800; HttpOnly; Secure; SameSite=Lax`);
  return new Response(null, { status: 302, headers });
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== "GET" && req.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
    }
    if (!SECRET_KEY) return new Response("Tracking backend not configured", { status: 503 });

    const incoming = new URL(req.url);
    const slug = incoming.searchParams.get("slug")?.trim();
    if (!slug) return new Response("Missing slug", { status: 400 });

    const resolution = await resolveDestination(slug);
    if (!resolution) return new Response("QR not found", { status: 404 });

    const visitorId = cookieValue(req, "sf_vid") || crypto.randomUUID();
    const sessionId = cookieValue(req, "sf_sid") || crypto.randomUUID();
    const userAgent = req.headers.get("user-agent");
    const parsed = parseDevice(userAgent);
    const bot = isLikelyBot(userAgent);

    const country = incoming.searchParams.get("c");
    const region = incoming.searchParams.get("r");
    const city = incoming.searchParams.get("ci");
    const timezone = incoming.searchParams.get("tz");
    const latitude = Number(incoming.searchParams.get("lat"));
    const longitude = Number(incoming.searchParams.get("lon"));

    const routed = applyRouting(
      resolution.resolved_url,
      resolution.routing_rules,
      { country, region, city, device: parsed.device, localHour: localHour(timezone) },
      visitorId,
    );

    const trackingRef = randomToken(7);
    const finalUrl = bot ? routed.url : attachWhatsAppTrackingRef(routed.url, trackingRef);
    const unitToken = incoming.searchParams.get("u");
    const unit = await resolveUnit(unitToken, resolution.workspace_id);
    const now = new Date().toISOString();
    const hash = await requestHash(req);

    const common = {
      workspace_id: resolution.workspace_id,
      qr_code_id: resolution.qr_code_id,
      qr_version_id: resolution.qr_version_id,
      campaign_id: resolution.campaign_id,
      distribution_batch_id: unit?.batch_id || null,
      distribution_unit_id: unit?.id || null,
      occurred_at: now,
      visitor_id: visitorId,
      session_id: sessionId,
      request_hash: hash,
      country,
      region,
      city,
      timezone,
      latitude: Number.isFinite(latitude) ? latitude : null,
      longitude: Number.isFinite(longitude) ? longitude : null,
      device_type: parsed.device,
      os: parsed.os,
      browser: parsed.browser,
      user_agent: userAgent,
      referrer: req.headers.get("referer"),
    };

    const metadata = {
      slug,
      unit_token: unitToken,
      tracking_ref: trackingRef,
      routing_rule_id: routed.ruleId,
      geo_source: "vercel_ip_headers",
      geo_is_approximate: true,
      raw_ip_persisted: false,
      likely_bot: bot,
      edge_runtime: "supabase",
    };

    if (req.method === "GET") {
      if (bot) {
        await persistEvents([{ ...common, event_type: "qr.preview", is_exact: true, metadata }]);
      } else {
        let destinationHost: string | null = null;
        try { destinationHost = new URL(finalUrl).hostname; } catch {}
        await persistEvents([
          { ...common, event_type: "qr.scan", is_exact: true, metadata },
          { ...common, event_type: "qr.redirect", is_exact: true, metadata: { ...metadata, destination: destinationHost } },
        ]);
      }
    }

    return redirectResponse(finalUrl, visitorId, sessionId);
  } catch (error) {
    console.error("scanflow.edge_redirect_error", error);
    return new Response("Tracking service unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
});
