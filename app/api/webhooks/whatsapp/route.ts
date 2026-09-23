import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ATTRIBUTION_WINDOW_MINUTES = 30;
const CONTACT_CONTINUITY_DAYS = 7;
const CONVERSATION_WINDOW_HOURS = 24;

type WaOrderItem = {
  product_retailer_id?: string;
  quantity?: number | string;
  item_price?: number | string;
  currency?: string;
};

type WaMessage = {
  id?: string;
  from?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  order?: { catalog_id?: string; product_items?: WaOrderItem[] };
};

type WaStatus = {
  id?: string;
  recipient_id?: string;
  timestamp?: string;
  status?: string;
  conversation?: unknown;
  pricing?: unknown;
};

type SourceEvent = {
  id: string;
  visitor_id: string | null;
  session_id: string | null;
  qr_code_id: string | null;
  campaign_id: string | null;
  occurred_at?: string;
  metadata?: Record<string, unknown> | null;
};

type QrRow = {
  id: string;
  campaign_id: string | null;
  current_version_id: string | null;
  name: string;
  slug: string;
};

type QrVersionRow = {
  id: string;
  qr_code_id: string;
  destination_id: string | null;
};

type DestinationRow = {
  id: string;
  message: string | null;
};

type Attribution = {
  qrCodeId: string | null;
  campaignId: string | null;
  visitorId: string | null;
  sessionId: string | null;
  sourceEventId: string | null;
  method: "conversation_continuity" | "natural_message_match" | "natural_message_plus_unique_recent_redirect" | "unique_recent_redirect_only" | "unlinked";
  confidence: "derived-high" | "derived-medium" | "derived-low" | "unlinked";
  candidateCount: number;
};

function validSignature(raw: string, signature: string | null) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return false;
  if (!signature?.startsWith("sha256=")) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
  if (signature.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

function contactHash(contact?: string) {
  const secret = process.env.TRACKING_SECRET;
  if (!contact || !secret) return null;
  return createHmac("sha256", secret).update(`whatsapp:${contact}`).digest("hex");
}

function textHash(text: string) {
  const secret = process.env.TRACKING_SECRET || process.env.WHATSAPP_APP_SECRET;
  if (!secret || !text) return null;
  return createHmac("sha256", secret).update(`message:${normalizeText(text)}`).digest("hex");
}

function normalizeText(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("es");
}

function occurredAt(timestamp?: string) {
  return timestamp ? new Date(Number(timestamp) * 1000).toISOString() : new Date().toISOString();
}

function supabaseHeaders() {
  const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  return secret ? { apikey: secret, Authorization: `Bearer ${secret}` } : null;
}

async function readRows<T>(table: string, params: Record<string, string>): Promise<T[]> {
  const base = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const headers = supabaseHeaders();
  if (!base || !headers) return [];
  const url = new URL(`${base}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const res = await fetch(url, { headers, cache: "no-store" });
  if (!res.ok) {
    console.error("scanflow.whatsapp_read_failed", table, res.status, await res.text());
    return [];
  }
  return await res.json() as T[];
}

async function writeRows(table: "events" | "conversions", rows: Record<string, unknown>[]) {
  const base = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const headers = supabaseHeaders();
  if (!base || !headers || rows.length === 0) return;
  const res = await fetch(`${base}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(rows),
    cache: "no-store",
  });
  if (!res.ok) console.error("scanflow.whatsapp_write_failed", table, res.status, await res.text());
}

async function alreadyProcessedMessage(workspaceId: string, messageId?: string) {
  if (!messageId) return false;
  const rows = await readRows<{ id: string }>("events", {
    workspace_id: `eq.${workspaceId}`,
    event_type: "eq.whatsapp.message_received",
    metadata: `cs.${JSON.stringify({ message_id: messageId })}`,
    select: "id",
    limit: "1",
  });
  return rows.length > 0;
}

async function findPriorContactEvent(workspaceId: string, hash: string | null, before: string): Promise<SourceEvent | null> {
  if (!hash) return null;
  const since = new Date(new Date(before).getTime() - CONTACT_CONTINUITY_DAYS * 86400000).toISOString();
  const rows = await readRows<SourceEvent>("events", {
    workspace_id: `eq.${workspaceId}`,
    event_type: "eq.whatsapp.message_received",
    metadata: `cs.${JSON.stringify({ contact_hash: hash })}`,
    occurred_at: `gte.${since}`,
    select: "id,visitor_id,session_id,qr_code_id,campaign_id,occurred_at,metadata",
    order: "occurred_at.desc",
    limit: "5",
  });
  const beforeMs = new Date(before).getTime();
  return rows.find((row) => !row.occurred_at || new Date(row.occurred_at).getTime() < beforeMs) || null;
}

async function activeWhatsappQrs(workspaceId: string) {
  const qrs = await readRows<QrRow>("qr_codes", {
    workspace_id: `eq.${workspaceId}`,
    status: "eq.active",
    select: "id,campaign_id,current_version_id,name,slug",
  });
  const versionIds = qrs.map((qr) => qr.current_version_id).filter((id): id is string => Boolean(id));
  if (!versionIds.length) return [] as Array<QrRow & { destinationMessage: string | null }>;

  const versions = await readRows<QrVersionRow>("qr_versions", {
    id: `in.(${versionIds.join(",")})`,
    select: "id,qr_code_id,destination_id",
  });
  const destinationIds = versions.map((version) => version.destination_id).filter((id): id is string => Boolean(id));
  if (!destinationIds.length) return [] as Array<QrRow & { destinationMessage: string | null }>;

  const destinations = await readRows<DestinationRow>("destinations", {
    id: `in.(${destinationIds.join(",")})`,
    kind: "eq.whatsapp",
    select: "id,message",
  });
  const destinationMap = new Map(destinations.map((destination) => [destination.id, destination]));
  const versionMap = new Map(versions.map((version) => [version.id, version]));

  return qrs.flatMap((qr) => {
    if (!qr.current_version_id) return [];
    const version = versionMap.get(qr.current_version_id);
    if (!version?.destination_id) return [];
    const destination = destinationMap.get(version.destination_id);
    if (!destination) return [];
    return [{ ...qr, destinationMessage: destination.message }];
  });
}

async function findUnusedRecentRedirect(workspaceId: string, qrIds: string[], before: string) {
  if (!qrIds.length) return { source: null as SourceEvent | null, candidateCount: 0 };
  const since = new Date(new Date(before).getTime() - ATTRIBUTION_WINDOW_MINUTES * 60000).toISOString();
  const rows = await readRows<SourceEvent>("events", {
    workspace_id: `eq.${workspaceId}`,
    event_type: "eq.qr.redirect",
    qr_code_id: `in.(${qrIds.join(",")})`,
    occurred_at: `gte.${since}`,
    select: "id,visitor_id,session_id,qr_code_id,campaign_id,occurred_at,metadata",
    order: "occurred_at.desc",
    limit: "30",
  });
  const beforeMs = new Date(before).getTime() + 120000;
  const human = rows.filter((row) => row.metadata?.likely_bot !== true && (!row.occurred_at || new Date(row.occurred_at).getTime() <= beforeMs));
  if (!human.length) return { source: null as SourceEvent | null, candidateCount: 0 };

  const used = await readRows<{ source_event_id: string | null }>("conversions", {
    workspace_id: `eq.${workspaceId}`,
    source_event_id: `in.(${human.map((row) => row.id).join(",")})`,
    select: "source_event_id",
  });
  const usedIds = new Set(used.map((row) => row.source_event_id).filter(Boolean));
  const unused = human.filter((row) => !usedIds.has(row.id));
  return { source: unused.length === 1 ? unused[0] : null, candidateCount: unused.length };
}

async function resolveAttribution(workspaceId: string, message: WaMessage, hash: string | null, at: string): Promise<Attribution> {
  const prior = await findPriorContactEvent(workspaceId, hash, at);
  if (prior?.qr_code_id) {
    const sourceEventId = typeof prior.metadata?.source_event_id === "string" ? prior.metadata.source_event_id : null;
    return {
      qrCodeId: prior.qr_code_id,
      campaignId: prior.campaign_id,
      visitorId: prior.visitor_id,
      sessionId: prior.session_id,
      sourceEventId,
      method: "conversation_continuity",
      confidence: "derived-high",
      candidateCount: 1,
    };
  }

  const qrs = await activeWhatsappQrs(workspaceId);
  const body = normalizeText(message.text?.body || "");
  const naturalMatches = body
    ? qrs.filter((qr) => {
        const expected = normalizeText(qr.destinationMessage || "");
        return Boolean(expected) && (body === expected || body.startsWith(`${expected} `));
      })
    : [];

  const candidateQrs = naturalMatches.length ? naturalMatches : qrs;
  const recent = await findUnusedRecentRedirect(workspaceId, candidateQrs.map((qr) => qr.id), at);

  if (naturalMatches.length === 1) {
    const qr = naturalMatches[0];
    return {
      qrCodeId: qr.id,
      campaignId: qr.campaign_id,
      visitorId: recent.source?.visitor_id || null,
      sessionId: recent.source?.session_id || null,
      sourceEventId: recent.source?.id || null,
      method: recent.source ? "natural_message_plus_unique_recent_redirect" : "natural_message_match",
      confidence: recent.source ? "derived-high" : "derived-medium",
      candidateCount: recent.candidateCount,
    };
  }

  if (recent.source?.qr_code_id) {
    return {
      qrCodeId: recent.source.qr_code_id,
      campaignId: recent.source.campaign_id,
      visitorId: recent.source.visitor_id,
      sessionId: recent.source.session_id,
      sourceEventId: recent.source.id,
      method: "unique_recent_redirect_only",
      confidence: "derived-low",
      candidateCount: recent.candidateCount,
    };
  }

  return {
    qrCodeId: null,
    campaignId: null,
    visitorId: null,
    sessionId: null,
    sourceEventId: null,
    method: "unlinked",
    confidence: "unlinked",
    candidateCount: recent.candidateCount,
  };
}

async function hasRecentConversation(workspaceId: string, hash: string | null, at: string) {
  if (!hash) return false;
  const since = new Date(new Date(at).getTime() - CONVERSATION_WINDOW_HOURS * 3600000).toISOString();
  const rows = await readRows<{ id: string }>("conversions", {
    workspace_id: `eq.${workspaceId}`,
    conversion_type: "eq.whatsapp_conversation",
    metadata: `cs.${JSON.stringify({ contact_hash: hash })}`,
    occurred_at: `gte.${since}`,
    select: "id",
    limit: "1",
  });
  return rows.length > 0;
}

function orderValue(message: WaMessage) {
  const items = message.order?.product_items || [];
  const value = items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.item_price || 0), 0);
  const currency = items.find((item) => item.currency)?.currency || "ARS";
  return { value: Number.isFinite(value) && value > 0 ? value : null, currency };
}

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("hub.mode");
  const token = request.nextUrl.searchParams.get("hub.verify_token");
  const challenge = request.nextUrl.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge || "", { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!validSignature(raw, request.headers.get("x-hub-signature-256"))) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  const workspaceId = process.env.WHATSAPP_WORKSPACE_ID;
  if (!workspaceId) return NextResponse.json({ received: true, mapped: false });

  const body = JSON.parse(raw) as {
    entry?: Array<{
      changes?: Array<{
        value?: {
          metadata?: { phone_number_id?: string };
          messages?: WaMessage[];
          statuses?: WaStatus[];
        };
      }>;
    }>;
  };

  const events: Record<string, unknown>[] = [];
  const conversions: Record<string, unknown>[] = [];

  for (const entry of body.entry || []) for (const change of entry.changes || []) {
    const value = change.value || {};

    for (const message of value.messages || []) {
      if (await alreadyProcessedMessage(workspaceId, message.id)) continue;

      const at = occurredAt(message.timestamp);
      const hash = contactHash(message.from);
      const attribution = await resolveAttribution(workspaceId, message, hash, at);
      const templateHash = textHash(message.text?.body || "");

      events.push({
        workspace_id: workspaceId,
        qr_code_id: attribution.qrCodeId,
        campaign_id: attribution.campaignId,
        event_type: "whatsapp.message_received",
        occurred_at: at,
        visitor_id: attribution.visitorId,
        session_id: attribution.sessionId,
        is_exact: false,
        metadata: {
          message_id: message.id,
          contact_hash: hash,
          type: message.type,
          source_event_id: attribution.sourceEventId,
          phone_number_id: value.metadata?.phone_number_id,
          attribution_method: attribution.method,
          attribution_confidence: attribution.confidence,
          attribution_candidate_count: attribution.candidateCount,
          message_template_hash: templateHash,
          raw_phone_persisted: false,
          raw_message_persisted: false,
          event_observation_exact: true,
        },
      });

      if (!(await hasRecentConversation(workspaceId, hash, at))) {
        conversions.push({
          workspace_id: workspaceId,
          qr_code_id: attribution.qrCodeId,
          source_event_id: attribution.sourceEventId,
          visitor_id: attribution.visitorId,
          session_id: attribution.sessionId,
          conversion_type: "whatsapp_conversation",
          external_id: message.id ? `${message.id}:conversation` : null,
          occurred_at: at,
          metadata: {
            contact_hash: hash,
            attribution_method: attribution.method,
            attribution_confidence: attribution.confidence,
          },
        });
      }

      if (message.type === "order" && message.order) {
        const order = orderValue(message);
        conversions.push({
          workspace_id: workspaceId,
          qr_code_id: attribution.qrCodeId,
          source_event_id: attribution.sourceEventId,
          visitor_id: attribution.visitorId,
          session_id: attribution.sessionId,
          conversion_type: "whatsapp_order",
          external_id: message.id ? `${message.id}:order` : null,
          value: order.value,
          currency: order.currency,
          occurred_at: at,
          metadata: {
            contact_hash: hash,
            catalog_id: message.order.catalog_id,
            product_retailer_ids: (message.order.product_items || []).map((item) => item.product_retailer_id).filter(Boolean),
            attribution_method: attribution.method,
            attribution_confidence: attribution.confidence,
          },
        });
      }
    }

    for (const status of value.statuses || []) {
      events.push({
        workspace_id: workspaceId,
        event_type: `whatsapp.status.${status.status || "unknown"}`,
        occurred_at: occurredAt(status.timestamp),
        is_exact: true,
        metadata: {
          message_id: status.id,
          recipient_hash: contactHash(status.recipient_id),
          conversation: status.conversation,
          pricing: status.pricing,
          raw_phone_persisted: false,
        },
      });
    }
  }

  await Promise.all([writeRows("events", events), writeRows("conversions", conversions)]);
  return NextResponse.json({ received: true, events: events.length, conversions: conversions.length });
}
