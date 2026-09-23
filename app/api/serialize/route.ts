import { NextRequest, NextResponse } from "next/server";
import { buildSerializedUrl, randomPublicToken } from "@/lib/serialization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  workspace_id?: string;
  batch_id?: string;
  qr_code_id?: string;
  slug?: string;
  quantity?: number;
  origin?: string;
  serial_prefix?: string;
};

export async function POST(request: NextRequest) {
  const expected = process.env.SCANFLOW_INGEST_KEY;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json() as Body;
  const quantity = Math.floor(body.quantity || 0);
  if (!body.workspace_id || !body.batch_id || !body.qr_code_id || !body.slug || !body.origin) {
    return NextResponse.json({ error: "workspace_id, batch_id, qr_code_id, slug and origin are required" }, { status: 400 });
  }
  if (quantity < 1 || quantity > 10_000) {
    return NextResponse.json({ error: "quantity must be between 1 and 10000" }, { status: 400 });
  }

  const rows = Array.from({ length: quantity }, (_, index) => {
    const token = randomPublicToken(8);
    const serial = `${body.serial_prefix || "UNIT"}-${String(index + 1).padStart(6, "0")}`;
    return {
      workspace_id: body.workspace_id,
      batch_id: body.batch_id,
      qr_code_id: body.qr_code_id,
      serial,
      public_token: token,
      metadata: { url: buildSerializedUrl(body.origin!, body.slug!, token) },
    };
  });

  const base = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!base || !secret) {
    return NextResponse.json({ preview: true, count: rows.length, units: rows.slice(0, 100) });
  }

  const res = await fetch(`${base}/rest/v1/distribution_units`, {
    method: "POST",
    headers: { apikey: secret, Authorization: `Bearer ${secret}`, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(rows),
    cache: "no-store",
  });
  if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: 502 });
  const inserted = await res.json() as typeof rows;
  return NextResponse.json({ ok: true, count: inserted.length, units: inserted });
}
