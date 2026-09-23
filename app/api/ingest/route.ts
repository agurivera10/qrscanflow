import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type IngestBody = {
  workspace_id?: string;
  kind?: "event" | "conversion";
  event_type?: string;
  conversion_type?: string;
  visitor_id?: string;
  session_id?: string;
  qr_code_id?: string;
  external_id?: string;
  value?: number;
  currency?: string;
  occurred_at?: string;
  metadata?: Record<string, unknown>;
};

export async function POST(request: NextRequest) {
  const expected = process.env.SCANFLOW_INGEST_KEY;
  const auth = request.headers.get("authorization");
  if (!expected || auth !== `Bearer ${expected}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as IngestBody;
  if (!body.workspace_id || !body.kind) return NextResponse.json({ error: "workspace_id and kind are required" }, { status: 400 });
  if (body.kind === "event" && !body.event_type) return NextResponse.json({ error: "event_type is required" }, { status: 400 });
  if (body.kind === "conversion" && !body.conversion_type) return NextResponse.json({ error: "conversion_type is required" }, { status: 400 });

  const base = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!base || !secret) return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });

  const table = body.kind === "event" ? "events" : "conversions";
  const payload = body.kind === "event" ? {
    workspace_id: body.workspace_id, event_type: body.event_type, visitor_id: body.visitor_id || null,
    session_id: body.session_id || null, qr_code_id: body.qr_code_id || null,
    occurred_at: body.occurred_at || new Date().toISOString(), is_exact: true, metadata: body.metadata || {},
  } : {
    workspace_id: body.workspace_id, conversion_type: body.conversion_type, visitor_id: body.visitor_id || null,
    session_id: body.session_id || null, qr_code_id: body.qr_code_id || null, external_id: body.external_id || null,
    value: body.value ?? null, currency: body.currency || "ARS", occurred_at: body.occurred_at || new Date().toISOString(), metadata: body.metadata || {},
  };

  const result = await fetch(`${base}/rest/v1/${table}`, {
    method: "POST",
    headers: { apikey: secret, Authorization: `Bearer ${secret}`, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(payload), cache: "no-store",
  });
  if (!result.ok) return NextResponse.json({ error: await result.text() }, { status: 502 });
  return NextResponse.json({ ok: true, row: (await result.json())[0] });
}
