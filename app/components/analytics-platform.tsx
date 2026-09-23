"use client";

import { useMemo, useState } from "react";

type View = "overview" | "qrs" | "campaigns" | "analytics" | "live" | "conversions" | "settings";

type Metric = {
  label: string;
  value: string;
  detail: string;
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

const ZERO_METRICS: Metric[] = [
  { label: "Qualified scans", value: "0", detail: "Sin actividad todavía" },
  { label: "Unique visitors", value: "0", detail: "Estimación first-party" },
  { label: "Conversions", value: "0", detail: "Sin conversiones registradas" },
  { label: "Attributed revenue", value: "$0", detail: "ARS" },
];

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="af-empty">
      <div className="af-empty-icon">⌁</div>
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}

function MetricCard({ metric }: { metric: Metric }) {
  return (
    <article className="af-metric">
      <span>{metric.label}</span>
      <strong>{metric.value}</strong>
      <small>{metric.detail}</small>
    </article>
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

function Overview() {
  return (
    <>
      <section className="af-hero">
        <div>
          <span className="af-eyebrow">QR ANALYTICS</span>
          <h2>Todo empieza con el primer scan.</h2>
          <p>ScanFlow está listo para medir QRs físicos o virtuales. Todavía no hay QRs creados ni actividad registrada.</p>
        </div>
        <div className="af-status"><i /> Tracking ready</div>
      </section>

      <div className="af-metrics">
        {ZERO_METRICS.map((metric) => <MetricCard key={metric.label} metric={metric} />)}
      </div>

      <div className="af-grid-two">
        <section className="af-panel">
          <header><div><span>FUNNEL</span><h3>Scan → conversion</h3></div><AccuracyLegend /></header>
          <div className="af-funnel-zero">
            <div><b>0</b><span>Qualified scans</span></div>
            <em>→</em>
            <div><b>0</b><span>Redirects</span></div>
            <em>→</em>
            <div><b>0</b><span>Conversations</span></div>
            <em>→</em>
            <div><b>0</b><span>Conversions</span></div>
          </div>
        </section>

        <section className="af-panel">
          <header><div><span>LIVE</span><h3>Activity stream</h3></div><span className="af-live-dot">● Live</span></header>
          <EmptyState title="Sin eventos todavía" body="Cuando se escanee el primer QR, cada evento aparecerá acá en tiempo real." />
        </section>
      </div>

      <div className="af-grid-two">
        <section className="af-panel">
          <header><div><span>PERFORMANCE</span><h3>Top QRs</h3></div></header>
          <EmptyState title="Todavía no hay QRs" body="El primer QR que creemos será también el primer activo medible de ScanFlow." />
        </section>
        <section className="af-panel">
          <header><div><span>BEHAVIOR</span><h3>Time & location</h3></div></header>
          <EmptyState title="Esperando datos" body="Hora, ciudad aproximada, dispositivo y recurrencia se completarán a medida que lleguen scans reales." />
        </section>
      </div>
    </>
  );
}

function Qrs() {
  return (
    <section className="af-panel af-full-panel">
      <header><div><span>INVENTORY</span><h3>QRs</h3><p>Todos los códigos que estén siendo medidos por ScanFlow.</p></div></header>
      <div className="af-table-head"><span>QR</span><span>Type</span><span>Campaign</span><span>Scans</span><span>Conversions</span><span>Status</span></div>
      <EmptyState title="0 QRs" body="No hay códigos creados. Esta lista va a empezar con el próximo QR que me pidas generar." />
    </section>
  );
}

function Campaigns() {
  return (
    <section className="af-panel af-full-panel">
      <header><div><span>GROUPING</span><h3>Campaigns</h3><p>Agrupá QRs por acción, canal o período para comparar rendimiento.</p></div></header>
      <EmptyState title="0 campaigns" body="Las campañas son opcionales. Se crearán cuando necesitemos agrupar múltiples QRs bajo una misma acción." />
    </section>
  );
}

function Analytics() {
  return (
    <div className="af-grid-two">
      <section className="af-panel"><header><div><span>TIME</span><h3>Scans over time</h3></div></header><EmptyState title="Sin serie temporal" body="Se completará automáticamente con scans reales." /></section>
      <section className="af-panel"><header><div><span>GEO</span><h3>Approximate location</h3></div></header><EmptyState title="Sin ubicaciones" body="La geolocalización derivada de red se mostrará siempre como estimada, nunca como GPS." /></section>
      <section className="af-panel"><header><div><span>DEVICE</span><h3>Device & OS</h3></div></header><EmptyState title="Sin dispositivos" body="iOS, Android, desktop, navegador y sistema operativo aparecerán aquí." /></section>
      <section className="af-panel"><header><div><span>REPEAT</span><h3>New vs repeat</h3></div></header><EmptyState title="Sin recurrencia" body="La identificación first-party permitirá estimar nuevos usuarios y reescaneos sin persistir IP cruda." /></section>
    </div>
  );
}

function Live() {
  return (
    <section className="af-panel af-full-panel">
      <header><div><span>EVENT STREAM</span><h3>Live</h3><p>Eventos crudos ordenados por tiempo.</p></div><span className="af-live-dot">● Live</span></header>
      <div className="af-event-columns"><span>Time</span><span>Event</span><span>QR</span><span>Location</span><span>Device</span><span>Confidence</span></div>
      <EmptyState title="No events" body="El scan número uno aparecerá acá con timestamp, QR, contexto técnico y nivel de confianza." />
    </section>
  );
}

function Conversions() {
  return (
    <div className="af-grid-two">
      <section className="af-panel"><header><div><span>OUTCOMES</span><h3>Conversions</h3></div></header><EmptyState title="0 conversions" body="Conversaciones, pedidos u otros resultados podrán vincularse al QR que los originó." /></section>
      <section className="af-panel"><header><div><span>REVENUE</span><h3>Attributed value</h3></div></header><EmptyState title="$0 attributed" body="Cuando registremos ventas, ScanFlow podrá comparar revenue y conversión por QR y campaña." /></section>
    </div>
  );
}

function Settings() {
  return (
    <div className="af-grid-two">
      <section className="af-panel af-settings-card"><span>WORKSPACE</span><h3>MILANGA</h3><p>Timezone: America/Argentina/Cordoba</p><small>Workspace preparado · sin activos</small></section>
      <section className="af-panel af-settings-card"><span>DATA QUALITY</span><h3>Exact ≠ Estimated</h3><p>ScanFlow diferencia eventos exactos de inferencias como ubicación IP o visitante único.</p><small>Raw IP persistence: disabled</small></section>
    </div>
  );
}

export default function AnalyticsPlatform() {
  const [view, setView] = useState<View>("overview");
  const currentLabel = useMemo(() => NAV.find((item) => item.id === view)?.label ?? "Overview", [view]);

  return (
    <main className="af-shell">
      <aside className="af-sidebar">
        <div className="af-brand"><div className="af-brand-mark">S</div><div><b>ScanFlow</b><small>QR Analytics</small></div></div>
        <div className="af-workspace"><span>M</span><div><b>MILANGA</b><small>Workspace</small></div></div>
        <nav>{NAV.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}>{item.label}</button>)}</nav>
        <div className="af-sidebar-foot"><i /> System ready</div>
      </aside>

      <section className="af-content">
        <header className="af-topbar"><div><span>ScanFlow /</span><b>{currentLabel}</b></div><div className="af-top-actions"><span className="af-period">All time</span><button disabled>Export</button></div></header>
        <div className="af-page">
          {view === "overview" && <Overview />}
          {view === "qrs" && <Qrs />}
          {view === "campaigns" && <Campaigns />}
          {view === "analytics" && <Analytics />}
          {view === "live" && <Live />}
          {view === "conversions" && <Conversions />}
          {view === "settings" && <Settings />}
        </div>
      </section>
    </main>
  );
}
