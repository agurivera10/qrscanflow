"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";

type IconName =
  | "grid"
  | "qr"
  | "campaign"
  | "chart"
  | "settings"
  | "plus"
  | "arrow"
  | "download"
  | "scan"
  | "users"
  | "repeat"
  | "message"
  | "more";

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
    qr: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM18 18h3v3h-3zM14 19h2v2h-2zM19 14h2v2h-2z"/></>,
    campaign: <><path d="M4 13V8l14-4v13L4 13Z"/><path d="M8 14v5a2 2 0 0 0 2 2h1v-6"/></>,
    chart: <><path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    arrow: <path d="m9 18 6-6-6-6"/>,
    download: <><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></>,
    scan: <><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M8 12h8"/></>,
    users: <><circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 5.3a3 3 0 0 1 0 5.4M18 14c1.8.7 3 2.5 3 4.5"/></>,
    repeat: <><path d="m17 2 4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="m7 22-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/></>,
    message: <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z"/><path d="M8 10h8M8 14h5"/></>,
    more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{paths[name]}</svg>;
}

const activity = [28, 35, 31, 42, 39, 51, 46, 59, 63, 54, 70, 66, 78, 73, 85, 89, 77, 92, 88, 103, 97, 110, 106, 119, 124, 116, 131, 126, 139, 146];

const qrRows = [
  { name: "Folleto A6 — Septiembre", campaign: "Folletos 2026", scans: "1.942", trend: "+24,8%", status: "Activo", slug: "milanga-folleto" },
  { name: "Imán heladera", campaign: "Imanes", scans: "1.281", trend: "+16,2%", status: "Activo", slug: "iman-heladera" },
  { name: "Packaging principal", campaign: "Packaging", scans: "934", trend: "+8,4%", status: "Activo", slug: "packaging" },
  { name: "Instagram Bio", campaign: "Digital", scans: "735", trend: "+3,1%", status: "Activo", slug: "instagram" },
];

function Sparkline() {
  const points = activity.map((value, index) => {
    const x = (index / (activity.length - 1)) * 1000;
    const y = 210 - ((value - 20) / 130) * 180;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg viewBox="0 0 1000 230" className="sparkline" preserveAspectRatio="none" role="img" aria-label="Escaneos durante los últimos 30 días">
      <defs>
        <linearGradient id="scanGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity=".16" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`M ${points.replaceAll(" ", " L ")} L 1000 230 L 0 230 Z`} fill="url(#scanGradient)" stroke="none" />
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="4" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function Dashboard() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("Folleto MILANGA — Septiembre");
  const [message, setMessage] = useState("Hola MILANGA, vi el folleto y quiero hacer un pedido.");
  const [qrPreview, setQrPreview] = useState("");
  const [origin, setOrigin] = useState("scanflow.vercel.app");

  useEffect(() => {
    setOrigin(window.location.host || "scanflow.vercel.app");
  }, []);

  const demoUrl = useMemo(() => `https://${origin}/r/milanga-folleto`, [origin]);

  useEffect(() => {
    QRCode.toDataURL(demoUrl, { width: 360, margin: 2, errorCorrectionLevel: "H", color: { dark: "#111111", light: "#ffffff" } }).then(setQrPreview);
  }, [demoUrl]);

  function downloadPreview() {
    if (!qrPreview) return;
    const link = document.createElement("a");
    link.download = "scanflow-milanga-qr.png";
    link.href = qrPreview;
    link.click();
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-row">
          <div className="brand-mark"><span /><span /><span /><span /></div>
          <span className="brand-name">ScanFlow</span>
        </div>

        <div className="workspace-label">WORKSPACE</div>
        <button className="workspace-switcher">
          <span className="workspace-avatar">M</span>
          <span><strong>MILANGA</strong><small>Workspace principal</small></span>
          <span className="chevron">⌄</span>
        </button>

        <nav className="nav-list" aria-label="Navegación principal">
          <a className="nav-item active" href="#"><Icon name="grid" />Dashboard</a>
          <a className="nav-item" href="#qrs"><Icon name="qr" />QRs<span className="nav-count">12</span></a>
          <a className="nav-item" href="#"><Icon name="campaign" />Campañas</a>
          <a className="nav-item" href="#"><Icon name="chart" />Analytics</a>
        </nav>

        <div className="sidebar-spacer" />
        <div className="plan-card">
          <div><span className="pulse-dot" />Plan inicial</div>
          <p>4.892 de 25.000 escaneos</p>
          <div className="usage-bar"><span style={{ width: "19.5%" }} /></div>
        </div>
        <a className="nav-item" href="#"><Icon name="settings" />Ajustes</a>
        <div className="profile-row"><div className="profile-avatar">AR</div><div><strong>Agustín</strong><small>Administrador</small></div><Icon name="more" /></div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div className="breadcrumbs"><span>ScanFlow</span><b>/</b><strong>Dashboard</strong></div>
          <button className="primary-button" onClick={() => setOpen(true)}><Icon name="plus" size={17} />Crear QR</button>
        </header>

        <div className="page-wrap">
          <div className="page-heading">
            <div><p className="eyebrow">RESUMEN GENERAL</p><h1>Dashboard</h1><p className="subtitle">Todo lo que está pasando con tus QR, en un solo lugar.</p></div>
            <button className="period-button">Últimos 30 días <span>⌄</span></button>
          </div>

          <div className="metric-grid">
            <article className="metric-card"><div className="metric-top"><span className="metric-icon"><Icon name="scan" /></span><span className="trend up">↗ 18,4%</span></div><div className="metric-number">4.892</div><div className="metric-label">Escaneos totales</div><small>+759 vs. período anterior</small></article>
            <article className="metric-card"><div className="metric-top"><span className="metric-icon"><Icon name="users" /></span><span className="trend up">↗ 12,1%</span></div><div className="metric-number">3.641</div><div className="metric-label">Usuarios aproximados</div><small>74,4% de los escaneos</small></article>
            <article className="metric-card"><div className="metric-top"><span className="metric-icon"><Icon name="repeat" /></span><span className="trend neutral">25,6%</span></div><div className="metric-number">1.251</div><div className="metric-label">Reescaneos</div><small>Personas que volvieron</small></article>
            <article className="metric-card accent"><div className="metric-top"><span className="metric-icon"><Icon name="message" /></span><span className="coming">PRÓXIMAMENTE</span></div><div className="metric-number muted-number">—</div><div className="metric-label">Conversiones WhatsApp</div><small>Se activa con la integración</small></article>
          </div>

          <div className="analytics-grid">
            <article className="panel chart-panel">
              <div className="panel-heading"><div><p className="panel-title">Escaneos</p><div className="chart-number">4.892 <span>↗ 18,4%</span></div></div><button className="ghost-button">Ver reporte <Icon name="arrow" size={15} /></button></div>
              <div className="chart-area"><div className="y-axis"><span>160</span><span>120</span><span>80</span><span>40</span><span>0</span></div><div className="chart-plot"><div className="grid-lines"><i/><i/><i/><i/><i/></div><Sparkline/><div className="x-axis"><span>25 Ago</span><span>1 Sep</span><span>8 Sep</span><span>15 Sep</span><span>23 Sep</span></div></div></div>
            </article>

            <article className="panel geo-panel">
              <div className="panel-heading"><div><p className="panel-title">Ubicación</p><p className="panel-subtitle">Por ciudad aproximada</p></div><button className="icon-button"><Icon name="more" /></button></div>
              <div className="geo-list">
                {[['Corrientes',72],['Resistencia',14],['Goya',6],['Buenos Aires',4],['Otros',4]].map(([city,value]) => <div className="geo-row" key={city}><div><span>{city}</span><b>{value}%</b></div><div className="geo-bar"><span style={{width:`${value}%`}} /></div></div>)}
              </div>
              <div className="privacy-note"><span>⌖</span> Ubicación estimada por red. No usamos GPS.</div>
            </article>
          </div>

          <article className="panel qr-table-panel" id="qrs">
            <div className="table-heading"><div><p className="panel-title">QR con mejor rendimiento</p><p className="panel-subtitle">Compará rápidamente tus principales puntos de entrada.</p></div><button className="ghost-button">Ver todos <Icon name="arrow" size={15}/></button></div>
            <div className="qr-table">
              <div className="table-row table-header"><span>QR</span><span>CAMPAÑA</span><span>ESCANEOS</span><span>30 DÍAS</span><span>ESTADO</span><span /></div>
              {qrRows.map((row) => <div className="table-row" key={row.slug}><span className="qr-name"><span className="mini-qr"><Icon name="qr" size={18}/></span><span><strong>{row.name}</strong><small>/r/{row.slug}</small></span></span><span>{row.campaign}</span><span className="scan-count">{row.scans}</span><span className="trend-text">↗ {row.trend}</span><span><i className="status-dot" />{row.status}</span><span><button className="icon-button"><Icon name="more" /></button></span></div>)}
            </div>
          </article>
        </div>
      </section>

      {open && <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
        <section className="modal" role="dialog" aria-modal="true" aria-label="Crear nuevo QR">
          <div className="modal-header"><div><p className="eyebrow">NUEVO QR</p><h2>Crear QR rastreable</h2><p>El usuario irá directo a WhatsApp. ScanFlow mide el acceso antes de redirigirlo.</p></div><button className="close-button" onClick={() => setOpen(false)}>×</button></div>
          <div className="modal-grid">
            <div className="form-column">
              <label>Nombre del QR<input value={name} onChange={(e)=>setName(e.target.value)} /></label>
              <label>Campaña<select defaultValue="Folletos 2026"><option>Folletos 2026</option><option>Imanes</option><option>Packaging</option></select></label>
              <div className="field-pair"><label>Destino<select defaultValue="WhatsApp"><option>WhatsApp</option><option>URL</option></select></label><label>Número<input defaultValue="+54 9 3794 141903" /></label></div>
              <label>Mensaje<textarea rows={4} value={message} onChange={(e)=>setMessage(e.target.value)} /></label>
              <div className="info-box"><strong>URL permanente</strong><code>https://{origin}/r/milanga-folleto</code><p>Podrás cambiar el número o destino después sin reimprimir este QR.</p></div>
            </div>
            <div className="preview-column">
              <div className="preview-card"><span className="preview-label">VISTA PREVIA</span>{qrPreview ? <img src={qrPreview} alt={`QR para ${name}`} /> : <div className="qr-loader"/>}<strong>{name || "QR sin nombre"}</strong><small>Escaneá para probar el redirect</small></div>
              <button className="secondary-button" onClick={downloadPreview}><Icon name="download" size={17}/>Descargar preview PNG</button>
            </div>
          </div>
          <div className="modal-footer"><button className="text-button" onClick={() => setOpen(false)}>Cancelar</button><button className="primary-button" onClick={() => setOpen(false)}>Crear QR <Icon name="arrow" size={16}/></button></div>
        </section>
      </div>}
    </main>
  );
}
