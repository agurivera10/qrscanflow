import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Workspace = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
};

type QrCode = {
  id: string;
  campaign_id: string | null;
  name: string;
  slug: string;
  status: string;
  mode: string;
  tags: string[] | null;
  created_at: string;
};

type Campaign = {
  id: string;
  name: string;
  status: string;
  objective: string | null;
  created_at: string;
};

type ScanEvent = {
  id: string;
  qr_code_id: string | null;
  campaign_id: string | null;
  event_type: string;
  occurred_at: string;
  visitor_id: string | null;
  country: string | null;
  city: string | null;
  device_type: string | null;
  os: string | null;
  browser: string | null;
  is_exact: boolean;
  metadata: Record<string, unknown> | null;
};

type Conversion = {
  id: string;
  qr_code_id: string | null;
  conversion_type: string;
  value: string | number | null;
  currency: string | null;
  occurred_at: string;
};

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

function apiHeaders() {
  return {
    apikey: SUPABASE_KEY || "",
    Authorization: `Bearer ${SUPABASE_KEY || ""}`,
  };
}

async function rest<T>(table: string, params: Record<string, string>) {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error("Supabase server environment variables are missing");
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, {
    headers: apiHeaders(),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`${table} ${response.status}: ${await response.text()}`);
  return (await response.json()) as T[];
}

function isHumanScan(event: ScanEvent) {
  return event.event_type === "qr.scan" && event.metadata?.likely_bot !== true;
}

function addCount(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) || 0) + 1);
}

export async function GET() {
  try {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return NextResponse.json(
        { error: "ScanFlow dashboard is missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY." },
        { status: 503 },
      );
    }

    const workspaces = await rest<Workspace>("workspaces", {
      slug: "eq.milanga",
      select: "id,name,slug,timezone",
      limit: "1",
    });
    const workspace = workspaces[0];
    if (!workspace) return NextResponse.json({ error: "MILANGA workspace not found" }, { status: 404 });

    const [qrs, campaigns, events, conversions] = await Promise.all([
      rest<QrCode>("qr_codes", {
        workspace_id: `eq.${workspace.id}`,
        select: "id,campaign_id,name,slug,status,mode,tags,created_at",
        order: "created_at.asc",
      }),
      rest<Campaign>("campaigns", {
        workspace_id: `eq.${workspace.id}`,
        select: "id,name,status,objective,created_at",
        order: "created_at.asc",
      }),
      rest<ScanEvent>("events", {
        workspace_id: `eq.${workspace.id}`,
        event_type: "in.(qr.scan,qr.redirect,qr.preview)",
        select: "id,qr_code_id,campaign_id,event_type,occurred_at,visitor_id,country,city,device_type,os,browser,is_exact,metadata",
        order: "occurred_at.desc",
        limit: "10000",
      }),
      rest<Conversion>("conversions", {
        workspace_id: `eq.${workspace.id}`,
        select: "id,qr_code_id,conversion_type,value,currency,occurred_at",
        order: "occurred_at.desc",
        limit: "10000",
      }),
    ]);

    const qrMap = new Map(qrs.map((qr) => [qr.id, qr]));
    const campaignMap = new Map(campaigns.map((campaign) => [campaign.id, campaign]));
    const scans = events.filter(isHumanScan);
    const redirects = events.filter((event) => event.event_type === "qr.redirect" && event.metadata?.likely_bot !== true);
    const uniqueVisitors = new Set(scans.map((event) => event.visitor_id).filter(Boolean)).size;
    const revenue = conversions.reduce((sum, conversion) => sum + Number(conversion.value || 0), 0);
    const conversations = conversions.filter((conversion) => /conversation|message|whatsapp/i.test(conversion.conversion_type)).length;

    const scansByQr = new Map<string, number>();
    const conversionsByQr = new Map<string, number>();
    for (const event of scans) if (event.qr_code_id) addCount(scansByQr, event.qr_code_id);
    for (const conversion of conversions) if (conversion.qr_code_id) addCount(conversionsByQr, conversion.qr_code_id);

    const qrSummaries = qrs.map((qr) => ({
      id: qr.id,
      name: qr.name,
      slug: qr.slug,
      status: qr.status,
      mode: qr.mode,
      campaign: qr.campaign_id ? campaignMap.get(qr.campaign_id)?.name || "—" : "—",
      scans: scansByQr.get(qr.id) || 0,
      conversions: conversionsByQr.get(qr.id) || 0,
      tags: qr.tags || [],
    }));

    const scansByCampaign = new Map<string, number>();
    for (const event of scans) if (event.campaign_id) addCount(scansByCampaign, event.campaign_id);
    const campaignSummaries = campaigns.map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      objective: campaign.objective,
      scans: scansByCampaign.get(campaign.id) || 0,
      qrs: qrs.filter((qr) => qr.campaign_id === campaign.id).length,
    }));

    const dayCounts = new Map<string, number>();
    const locationCounts = new Map<string, number>();
    const deviceCounts = new Map<string, number>();
    const visitorCounts = new Map<string, number>();

    for (const event of scans) {
      addCount(dayCounts, event.occurred_at.slice(0, 10));
      addCount(locationCounts, [event.city, event.country].filter(Boolean).join(", ") || "Sin ubicación");
      addCount(deviceCounts, [event.device_type || "Unknown", event.os || "Other"].join(" · "));
      if (event.visitor_id) addCount(visitorCounts, event.visitor_id);
    }

    const repeatVisitors = [...visitorCounts.values()].filter((count) => count > 1).length;
    const repeatScans = [...visitorCounts.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);

    const byCount = (map: Map<string, number>, limit = 8) =>
      [...map.entries()]
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);

    const recentEvents = events
      .filter((event) => event.metadata?.likely_bot !== true)
      .slice(0, 40)
      .map((event) => {
        const qr = event.qr_code_id ? qrMap.get(event.qr_code_id) : undefined;
        return {
          id: event.id,
          eventType: event.event_type,
          occurredAt: event.occurred_at,
          qrName: qr?.name || "Unknown QR",
          qrSlug: qr?.slug || null,
          city: event.city,
          country: event.country,
          device: event.device_type,
          os: event.os,
          browser: event.browser,
          confidence: event.is_exact ? "Exact" : "Estimated",
        };
      });

    return NextResponse.json(
      {
        workspace,
        metrics: {
          scans: scans.length,
          redirects: redirects.length,
          uniqueVisitors,
          conversations,
          conversions: conversions.length,
          revenue,
          currency: conversions.find((conversion) => conversion.currency)?.currency || "ARS",
        },
        qrs: qrSummaries,
        campaigns: campaignSummaries,
        recentEvents,
        analytics: {
          days: [...dayCounts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([label, count]) => ({ label, count })),
          locations: byCount(locationCounts),
          devices: byCount(deviceCounts),
          repeat: {
            uniqueVisitors,
            repeatVisitors,
            repeatScans,
          },
        },
        generatedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch (error) {
    console.error("scanflow.dashboard_error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Dashboard unavailable" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
