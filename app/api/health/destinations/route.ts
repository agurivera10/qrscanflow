import { NextRequest, NextResponse } from "next/server";
import { assertPublicHttpUrl } from "@/lib/url-safety";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Destination = { id: string; workspace_id: string; name: string; url: string | null; kind: string; config: Record<string, unknown> };

function authHeaders() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  return secret ? { apikey: secret, Authorization: `Bearer ${secret}` } : null;
}

function resolvedUrl(destination: Destination) {
  if (destination.url) return destination.url;
  if (destination.kind === "whatsapp") {
    const phone = typeof destination.config?.phone === "string" ? destination.config.phone : null;
    return phone ? `https://wa.me/${phone}` : null;
  }
  return null;
}

async function check(url: string) {
  const safe = await assertPublicHttpUrl(url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    let response = await fetch(safe, { method: "HEAD", redirect: "manual", cache: "no-store", signal: controller.signal });
    if (response.status === 405) response = await fetch(safe, { method: "GET", redirect: "manual", cache: "no-store", signal: controller.signal, headers: { Range: "bytes=0-0" } });
    return { ok: response.status >= 200 && response.status < 500, status: response.status };
  } finally { clearTimeout(timeout); }
}

export async function POST(request: NextRequest) {
  const expected = process.env.SCANFLOW_INGEST_KEY;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const base = process.env.SUPABASE_URL;
  const headers = authHeaders();
  if (!base || !headers) return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });

  const workspaceId = request.nextUrl.searchParams.get("workspace_id");
  const query = new URL(`${base}/rest/v1/destinations`);
  query.searchParams.set("select", "id,workspace_id,name,url,kind,config");
  if (workspaceId) query.searchParams.set("workspace_id", `eq.${workspaceId}`);
  const res = await fetch(query, { headers, cache: "no-store" });
  if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: 502 });
  const destinations = await res.json() as Destination[];

  const results = [];
  for (const destination of destinations) {
    const target = resolvedUrl(destination);
    let state: "healthy" | "degraded" | "down" = "down";
    let status: number | null = null;
    let error: string | null = null;
    if (target) {
      try {
        const result = await check(target);
        status = result.status;
        state = result.ok ? (status >= 400 ? "degraded" : "healthy") : "down";
      } catch (e) { error = e instanceof Error ? e.message : "Health check failed"; }
    } else { error = "No checkable URL"; }

    await fetch(`${base}/rest/v1/destinations?id=eq.${encodeURIComponent(destination.id)}`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ health_status: state, last_health_check_at: new Date().toISOString() }),
      cache: "no-store",
    });

    if (state === "down") {
      await fetch(`${base}/rest/v1/alerts`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal,resolution=merge-duplicates" },
        body: JSON.stringify({ workspace_id: destination.workspace_id, kind: "destination_down", severity: "critical", title: `${destination.name} is unavailable`, body: error || `Health check returned ${status ?? "no status"}`, status: "open" }),
        cache: "no-store",
      });
    }
    results.push({ id: destination.id, name: destination.name, state, http_status: status, error });
  }
  return NextResponse.json({ checked: results.length, results });
}
