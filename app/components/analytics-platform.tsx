"use client";

import { useEffect, useMemo, useState } from "react";

type View = "overview" | "qrs" | "campaigns" | "analytics" | "live" | "conversions" | "settings";

type CountItem = { label: string; count: number };

type DashboardData = {
  workspace: { id: string; name: string; slug: string; timezone: string };
  metrics: {
    scans: number;
    redirects: number;
    uniqueVisitors: number;
    conversations: number;
    conversions: number;
    revenue: number;
    currency: string;
  };
  qrs: Array<{
    id: string;
    name: string;
    slug: string;
    status: string;
    mode: string;
    campaign: string;
    scans: number;
    conversions: number;
    tags: string[];
  }>;
  campaigns: Array<{
    id: string;
    name: string;
    status: string;
    objective: string | null;
    scans: number;
    qrs: number;
  }>;
  recentEvents: Array<{
    id: string;
    eventType: string;
    occurredAt: string;
    qrName: string;
    qrSlug: string | null;
    city: string | null;
    country: string | null;
    device: string | null;
    os: string | null;
    browser: string | null;
    confidence: string;
  }>;
  analytics: {
    days: CountItem[];
    locations: CountItem[];
    devices: CountItem[];
    repeat: { uniqueVisitors: number; repeatVisitors: number; repeatScans: number };
  };
  generatedAt: string;
};

const NAV: Array<{ id: View; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "qrs", label: "QRs" },
  { id: "campaigns", label: "Campaigns" },
  { id: "analytics", label: "Analytics" },
  { id: "live", label: "Live" },
  { id: "conversions", label: "Conversions" },
  { id: "settings", label: "Settings" },
];

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-AR").format(value);
}

function formatMoney(value: number, currency = "ARS") {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function eventLabel(eventType: string) {
  if (eventType === "qr.scan") return "Scan";
  if (eventType === "qr.redirect") return "Redirect";
  if (eventType === "qr.preview") return "Preview";
  return eventType;
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="af-empty">
      <div className="af-empty-icon">⌁</div>
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}

function AccuracyLegend() {
  return (
    <div className="af-confidence">
      <span><i className="exact" /> Exact</span>
      <span><i className="estimated" /> Estimated</span>
      <span><i className="derived" /> Derived</span>
    </div>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="af-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function ActivityRows({ events, limit }: { events: DashboardData["recentEvents"]; limit?: number }) {
  const shown = typeof limit === "number" ? events.slice(0, limit) : events;
  if (!shown.length) return <EmptyState title="Sin eventos todavía" body="Los scans y redirects aparecerán acá automáticamente." />;

  return (
    <div className="af-event-list">
      {shown.map((event) => (
        <div className="af-event-row" key={event.id}>
          <span className="af-event-time">{formatTime(event.occurredAt)}</span>
          <span><b>{eventLabel(event.eventType)}</b><small>{event.qrName}</small></span>
          <span>{[event.city, event.country].filter(Boolean).join(", ") || "—"}</span>
          <span>{[event.device, event.os].filter(Boolean).join(" · ") || "—"}</span>
          <span className={`af-confidence-pill ${event.confidence.toLowerCase()}`}>{event.confidence}</span>
        </div>
      ))}
    </div>
  );
}

function CountList({ items, empty }: { items: CountItem[]; empty: string }) {
  if (!items.length) return <EmptyState title={empty} body="Se completará automáticamente con actividad real." />;
  const max = Math.max(...items.map((item) => item.count), 1);
  return (
    <div className="af-count-list">
      {items.map((item) => (
        <div className="af-count-row" key={item.label}>
          <div><span>{item.label}</span><b>{formatNumber(item.count)}</b></div>
          <div className="af-count-track"><i style={{ width: `${Math.max(6, (item.count / max) * 100)}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

function Overview({ data }: { data: DashboardData }) {
  const { metrics } = data;
  const hasScans = metrics.scans > 0;
  const topQrs = [...data.qrs].sort((a, b) => b.scans - a.scans).slice(0, 5);

  return (
    <>
      <section className="af-hero">
        <div>
          <span className="af-eyebrow">QR ANALYTICS</span>
          <h2>{hasScans ? `${formatNumber(metrics.scans)} scans registrados.` : "Todo empieza con el primer scan."}</h2>
          <p>{hasScans ? "Datos reales capturados por ScanFlow y almacenados en Supabase. La ubicación de red se muestra siempre como aproximada." : "ScanFlow está listo para medir QRs físicos o virtuales."}</p>
        </div>
        <div className="af-status"><i /> Supabase connected</div>
      </section>

      <div className="af-metrics">
        <MetricCard label="Qualified scans" value={formatNumber(metrics.scans)} detail="Eventos qr.scan exactos" />
        <MetricCard label="Unique visitors" value={formatNumber(metrics.uniqueVisitors)} detail="Estimación first-party" />
        <MetricCard label="Conversions" value={formatNumber(metrics.conversions)} detail={`${formatNumber(metrics.conversations)} conversaciones registradas`} />
        <MetricCard label="Attributed revenue" value={formatMoney(metrics.revenue, metrics.currency)} detail={metrics.currency} />
      </div>

      <div className="af-grid-two">
        <section className="af-panel">
          <header><div><span>FUNNEL</span><h3>Scan → conversion</h3></div><AccuracyLegend /></header>
          <div className="af-funnel-zero">
            <div><b>{formatNumber(metrics.scans)}</b><span>Qualified scans</span></div>
            <em>→</em>
            <div><b>{formatNumber(metrics.redirects)}</b><span>Redirects</span></div>
            <em>→</em>
            <div><b>{formatNumber(metrics.conversations)}</b><span>Conversations</span></div>
            <em>→</em>
            <div><b>{formatNumber(metrics.conversions)}</b><span>Conversions</span></div>
          </div>
        </section>

        <section className="af-panel">
          <header><div><span>LIVE</span><h3>Activity stream</h3></div><span className="af-live-dot">● Live</span></header>
          <ActivityRows events={data.recentEvents} limit={6} />
        </section>
      </div>

      <div className="af-grid-two">
        <section className="af-panel">
          <header><div><span>PERFORMANCE</span><h3>Top QRs</h3></div></header>
          {topQrs.length ? (
            <div className="af-ranking">
              {topQrs.map((qr) => <div key={qr.id}><span><b>{qr.name}</b><small>/{qr.slug}</small></span><strong>{formatNumber(qr.scans)} scans</strong></div>)}
            </div>
          ) : <EmptyState title="Todavía no hay QRs" body="Los QRs activos aparecerán acá." />}
        </section>
        <section className="af-panel">
          <header><div><span>BEHAVIOR</span><h3>Time & location</h3></div></header>
          <CountList items={data.analytics.locations.slice(0, 5)} empty="Sin ubicaciones" />
        </section>
      </div>
    </>
  );
}

function Qrs({ data }: { data: DashboardData }) {
  return (
    <section className="af-panel af-full-panel">
      <header><div><span>INVENTORY</span><h3>QRs</h3><p>Todos los códigos medidos por ScanFlow.</p></div><b className="af-header-count">{data.qrs.length}</b></header>
      {data.qrs.length ? (
        <div className="af-qr-list">
          {data.qrs.map((qr) => (
            <article className="af-qr-row" key={qr.id}>
              <img src={`/api/qr/${encodeURIComponent(qr.slug)}`} alt={`QR ${qr.name}`} />
              <div className="af-qr-main"><b>{qr.name}</b><code>/r/{qr.slug}</code><small>{qr.campaign}</small></div>
              <div><span>Scans</span><b>{formatNumber(qr.scans)}</b></div>
              <div><span>Conversions</span><b>{formatNumber(qr.conversions)}</b></div>
              <div><span>Status</span><b className="af-status-text">● {qr.status}</b></div>
              <a className="af-download" href={`/api/qr/${encodeURIComponent(qr.slug)}?download=1`}>Descargar PNG</a>
            </article>
          ))}
        </div>
      ) : <EmptyState title="0 QRs" body="No hay códigos activos en Supabase." />}
    </section>
  );
}

function Campaigns({ data }: { data: DashboardData }) {
  return (
    <section className="af-panel af-full-panel">
      <header><div><span>GROUPING</span><h3>Campaigns</h3><p>Rendimiento por acción y conjunto de QRs.</p></div></header>
      {data.campaigns.length ? (
        <div className="af-campaign-list">
          {data.campaigns.map((campaign) => (
            <div className="af-campaign-row" key={campaign.id}>
              <span><b>{campaign.name}</b><small>{campaign.objective || "Sin objetivo"}</small></span>
              <span><small>QRs</small><b>{campaign.qrs}</b></span>
              <span><small>Scans</small><b>{formatNumber(campaign.scans)}</b></span>
              <span className="af-status-text">● {campaign.status}</span>
            </div>
          ))}
        </div>
      ) : <EmptyState title="0 campaigns" body="No hay campañas registradas." />}
    </section>
  );
}

function Analytics({ data }: { data: DashboardData }) {
  const repeat = data.analytics.repeat;
  return (
    <div className="af-grid-two">
      <section className="af-panel"><header><div><span>TIME</span><h3>Scans over time</h3></div></header><CountList items={data.analytics.days.slice(-10)} empty="Sin serie temporal" /></section>
      <section className="af-panel"><header><div><span>GEO</span><h3>Approximate location</h3></div></header><CountList items={data.analytics.locations} empty="Sin ubicaciones" /></section>
      <section className="af-panel"><header><div><span>DEVICE</span><h3>Device & OS</h3></div></header><CountList items={data.analytics.devices} empty="Sin dispositivos" /></section>
      <section className="af-panel">
        <header><div><span>REPEAT</span><h3>New vs repeat</h3></div></header>
        <div className="af-repeat-grid">
          <div><b>{formatNumber(repeat.uniqueVisitors)}</b><span>Unique visitors</span></div>
          <div><b>{formatNumber(repeat.repeatVisitors)}</b><span>Repeat visitors</span></div>
          <div><b>{formatNumber(repeat.repeatScans)}</b><span>Repeat scans</span></div>
        </div>
        <p className="af-est-note">Estimación first-party basada en cookies pseudónimas. No se persiste IP cruda.</p>
      </section>
    </div>
  );
}

function Live({ data }: { data: DashboardData }) {
  return (
    <section className="af-panel af-full-panel">
      <header><div><span>EVENT STREAM</span><h3>Live</h3><p>Últimos eventos capturados. Actualización automática cada 10 segundos.</p></div><span className="af-live-dot">● Live</span></header>
      <ActivityRows events={data.recentEvents} />
    </section>
  );
}

function Conversions({ data }: { data: DashboardData }) {
  return (
    <div className="af-grid-two">
      <section className="af-panel"><header><div><span>OUTCOMES</span><h3>Conversions</h3></div></header><div className="af-big-stat"><b>{formatNumber(data.metrics.conversions)}</b><span>Total registradas</span><small>{formatNumber(data.metrics.conversations)} conversaciones</small></div></section>
      <section className="af-panel"><header><div><span>REVENUE</span><h3>Attributed value</h3></div></header><div className="af-big-stat"><b>{formatMoney(data.metrics.revenue, data.metrics.currency)}</b><span>Revenue atribuido</span><small>{data.metrics.currency}</small></div></section>
    </div>
  );
}

function Settings({ data }: { data: DashboardData }) {
  return (
    <div className="af-grid-two">
      <section className="af-panel af-settings-card"><span>WORKSPACE</span><h3>{data.workspace.name}</h3><p>Timezone: {data.workspace.timezone}</p><small>{data.qrs.length} QR activo(s) · {data.campaigns.length} campaña(s)</small></section>
      <section className="af-panel af-settings-card"><span>DATA QUALITY</span><h3>Exact ≠ Estimated</h3><p>ScanFlow diferencia eventos exactos de inferencias como ubicación IP o visitante único.</p><small>Raw IP persistence: disabled</small></section>
      <section className="af-panel af-settings-card"><span>DATA SOURCE</span><h3>Supabase live</h3><p>El dashboard consulta datos server-side; la secret no se expone al navegador.</p><small>Last refresh: {new Date(data.generatedAt).toLocaleString("es-AR")}</small></section>
    </div>
  );
}

export default function AnalyticsPlatform() {
  const [view, setView] = useState<View>("overview");
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const currentLabel = useMemo(() => NAV.find((item) => item.id === view)?.label ?? "Overview", [view]);

  async function loadData(silent = false) {
    if (!silent) setRefreshing(true);
    try {
      const response = await fetch("/api/dashboard", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "No se pudieron cargar las métricas");
      setData(payload as DashboardData);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Dashboard unavailable");
    } finally {
      if (!silent) setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadData();
    const timer = window.setInterval(() => void loadData(true), 10000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <main className="af-shell">
      <aside className="af-sidebar">
        <div className="af-brand"><div className="af-brand-mark">S</div><div><b>ScanFlow</b><small>QR Analytics</small></div></div>
        <div className="af-workspace"><span>M</span><div><b>MILANGA</b><small>Workspace</small></div></div>
        <nav>{NAV.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}>{item.label}</button>)}</nav>
        <div className="af-sidebar-foot"><i /> {error ? "Data error" : "System ready"}</div>
      </aside>

      <section className="af-content">
        <header className="af-topbar">
          <div><span>ScanFlow /</span><b>{currentLabel}</b></div>
          <div className="af-top-actions"><span className="af-period">All time</span><button onClick={() => void loadData()} disabled={refreshing}>{refreshing ? "Refreshing…" : "Refresh"}</button></div>
        </header>
        <div className="af-page">
          {error && <div className="af-error"><b>Supabase connection error</b><span>{error}</span></div>}
          {!data ? (
            <section className="af-panel af-loading"><div className="af-spinner" /><b>Conectando con Supabase…</b><span>Buscando QRs, eventos y métricas reales.</span></section>
          ) : (
            <>
              {view === "overview" && <Overview data={data} />}
              {view === "qrs" && <Qrs data={data} />}
              {view === "campaigns" && <Campaigns data={data} />}
              {view === "analytics" && <Analytics data={data} />}
              {view === "live" && <Live data={data} />}
              {view === "conversions" && <Conversions data={data} />}
              {view === "settings" && <Settings data={data} />}
            </>
          )}
        </div>
      </section>
    </main>
  );
}
