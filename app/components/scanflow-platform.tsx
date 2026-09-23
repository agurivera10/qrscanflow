"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";

type View = "overview" | "qrs" | "studio" | "campaigns" | "distribution" | "analytics" | "conversions" | "experiments" | "live" | "integrations";
type DotStyle = "square" | "rounded" | "dots";
type EyeStyle = "square" | "rounded" | "circle";

const NAV: { id: View; label: string; glyph: string }[] = [
  { id: "overview", label: "Overview", glyph: "⌂" },
  { id: "qrs", label: "QRs", glyph: "▦" },
  { id: "studio", label: "Studio", glyph: "✦" },
  { id: "campaigns", label: "Campaigns", glyph: "◎" },
  { id: "distribution", label: "Distribution", glyph: "◇" },
  { id: "analytics", label: "Analytics", glyph: "⌁" },
  { id: "conversions", label: "Conversions", glyph: "↗" },
  { id: "experiments", label: "Experiments", glyph: "A/B" },
  { id: "live", label: "Live", glyph: "●" },
  { id: "integrations", label: "Integrations", glyph: "⌘" },
];

const qrs = [
  { name: "Folleto A6 — Septiembre", slug: "milanga-folleto", campaign: "Lanzamiento Sep", scans: 1942, unique: 1431, conversations: 486, orders: 137, revenue: 1986500, score: 98 },
  { name: "Imán heladera", slug: "iman-heladera", campaign: "Always-on", scans: 1281, unique: 862, conversations: 421, orders: 118, revenue: 1711000, score: 100 },
  { name: "Packaging principal", slug: "packaging", campaign: "Packaging", scans: 934, unique: 711, conversations: 248, orders: 76, revenue: 1102000, score: 96 },
  { name: "Sticker mostrador", slug: "sticker-mostrador", campaign: "POS", scans: 735, unique: 611, conversations: 193, orders: 52, revenue: 754000, score: 94 },
];

const liveEvents = [
  ["Ahora", "Corrientes", "Folleto A6", "iPhone", "WhatsApp"],
  ["11s", "Resistencia", "Imán heladera", "Android", "WhatsApp"],
  ["24s", "Corrientes", "Packaging", "Android", "WhatsApp"],
  ["41s", "Goya", "Folleto A6", "iPhone", "WhatsApp"],
  ["1m", "Corrientes", "Sticker mostrador", "Android", "WhatsApp"],
];

const batches = [
  { batch: "PRINT-SEP-001", zone: "Centro Corrientes", units: 1000, scans: 143, response: 14.3, cost: 26000, revenue: 412000 },
  { batch: "PRINT-SEP-002", zone: "Costanera", units: 1500, scans: 281, response: 18.7, cost: 39000, revenue: 808000 },
  { batch: "PRINT-SEP-003", zone: "Zona Norte", units: 2500, scans: 94, response: 3.8, cost: 65000, revenue: 269000 },
];

function money(value: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(value);
}

function Kpi({ label, value, detail, tone }: { label: string; value: string; detail: string; tone?: "good" | "warn" }) {
  return <article className="sf-kpi"><div className="sf-kpi-top"><span>{label}</span><i className={tone || ""}>↗</i></div><strong>{value}</strong><small>{detail}</small></article>;
}

function Panel({ title, subtitle, children, className = "" }: { title: string; subtitle?: string; children: React.ReactNode; className?: string }) {
  return <section className={`sf-panel ${className}`}><header><div><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div><button aria-label="Más opciones">•••</button></header>{children}</section>;
}

function Funnel() {
  const steps = [
    ["Scans", "8.491", 100], ["Redirect", "7.814", 92], ["WhatsApp", "2.422", 31], ["Conversations", "1.647", 68], ["Orders", "642", 39],
  ] as const;
  return <div className="sf-funnel">{steps.map(([name, value, pct], i) => <div className="sf-funnel-step" key={name}><div><span>{name}</span><b>{value}</b></div><div className="sf-funnel-bar"><span style={{ width: `${Math.max(18, pct)}%` }} /></div>{i < steps.length - 1 && <small>{pct}%</small>}</div>)}</div>;
}

function Heatmap() {
  const vals = [[1,1,2,2,2,3,2],[2,2,2,2,3,3,2],[3,3,3,3,4,4,3],[2,2,2,2,3,3,2],[3,3,3,3,4,4,3],[4,4,4,4,4,4,4],[4,4,4,4,4,4,4]];
  const hours = ["08", "10", "12", "14", "16", "18", "20"];
  return <div className="sf-heat"><div className="sf-days"><i /><span>L</span><span>M</span><span>X</span><span>J</span><span>V</span><span>S</span><span>D</span></div>{vals.map((row, r) => <div className="sf-heat-row" key={r}><span>{hours[r]}</span>{row.map((v, c) => <i key={c} data-level={v} />)}</div>)}</div>;
}

function ScoreRing({ score }: { score: number }) {
  return <div className="sf-score" style={{ "--score": `${score * 3.6}deg` } as React.CSSProperties}><div><strong>{score}</strong><small>/100</small></div></div>;
}

function QrStudio() {
  const [payload, setPayload] = useState("https://qrscanflow.vercel.app/r/milanga-folleto");
  const [dotStyle, setDotStyle] = useState<DotStyle>("rounded");
  const [eyeStyle, setEyeStyle] = useState<EyeStyle>("rounded");
  const [fg, setFg] = useState("#101418");
  const [bg, setBg] = useState("#ffffff");
  const [brand, setBrand] = useState("#f25a24");
  const [logo, setLogo] = useState(true);
  const [frame, setFrame] = useState(true);
  const [sizeMm, setSizeMm] = useState(30);
  const svgRef = useRef<SVGSVGElement>(null);
  const qr = useMemo(() => QRCode.create(payload || "https://qrscanflow.vercel.app", { errorCorrectionLevel: "H" }), [payload]);
  const matrixSize = qr.modules.size;
  const matrix = qr.modules.data;
  const quiet = 4;
  const total = matrixSize + quiet * 2;

  function finderCell(row: number, col: number) {
    const starts = [[0,0], [0, matrixSize - 7], [matrixSize - 7, 0]];
    return starts.some(([r,c]) => row >= r && row < r + 7 && col >= c && col < c + 7);
  }

  function eye(x: number, y: number, key: string) {
    const rx = eyeStyle === "rounded" ? 1.6 : eyeStyle === "circle" ? 3.5 : 0;
    return <g key={key} transform={`translate(${x + quiet} ${y + quiet})`}><rect width="7" height="7" rx={rx} fill={fg}/><rect x="1" y="1" width="5" height="5" rx={Math.max(0, rx - .5)} fill={bg}/><rect x="2" y="2" width="3" height="3" rx={eyeStyle === "circle" ? 1.5 : Math.max(0, rx - .8)} fill={brand}/></g>;
  }

  const contrast = fg.toLowerCase() === bg.toLowerCase() ? 1 : 12;
  const score = Math.max(52, Math.min(100, 100 - (contrast < 4 ? 35 : 0) - (sizeMm < 22 ? 22 : sizeMm < 26 ? 8 : 0) - (logo ? 2 : 0)));

  function downloadSvg() {
    if (!svgRef.current) return;
    const xml = new XMLSerializer().serializeToString(svgRef.current);
    const url = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml" }));
    const a = document.createElement("a"); a.href = url; a.download = "scanflow-qr.svg"; a.click(); URL.revokeObjectURL(url);
  }

  return <div className="sf-studio-grid">
    <section className="sf-studio-controls">
      <div className="sf-section-title"><span>01</span><div><b>Destination</b><small>El QR físico queda fijo; el destino puede cambiar.</small></div></div>
      <label>Tracking URL<input value={payload} onChange={e => setPayload(e.target.value)} /></label>
      <div className="sf-section-title"><span>02</span><div><b>Visual system</b><small>Personalizá sin sacrificar capacidad de lectura.</small></div></div>
      <div className="sf-field-grid"><label>Módulos<select value={dotStyle} onChange={e => setDotStyle(e.target.value as DotStyle)}><option value="square">Square</option><option value="rounded">Rounded</option><option value="dots">Dots</option></select></label><label>Eyes<select value={eyeStyle} onChange={e => setEyeStyle(e.target.value as EyeStyle)}><option value="square">Square</option><option value="rounded">Rounded</option><option value="circle">Circle</option></select></label></div>
      <div className="sf-colors"><label>QR<input type="color" value={fg} onChange={e => setFg(e.target.value)} /></label><label>Accent<input type="color" value={brand} onChange={e => setBrand(e.target.value)} /></label><label>Background<input type="color" value={bg} onChange={e => setBg(e.target.value)} /></label></div>
      <div className="sf-toggle-row"><label><input type="checkbox" checked={logo} onChange={e => setLogo(e.target.checked)} /> Centro de marca</label><label><input type="checkbox" checked={frame} onChange={e => setFrame(e.target.checked)} /> CTA frame</label></div>
      <label>Tamaño físico recomendado <div className="sf-range"><input type="range" min="18" max="60" value={sizeMm} onChange={e => setSizeMm(Number(e.target.value))}/><b>{sizeMm} mm</b></div></label>
      <div className="sf-safety"><ScoreRing score={score}/><div><b>Scannability Score</b><p>{score >= 90 ? "Listo para imprenta. Alto contraste, quiet zone y corrección H." : "Ajustá tamaño/contraste antes de imprimir."}</p><small>Simulación: blur · perspectiva · baja luz · compresión</small></div></div>
    </section>
    <section className="sf-studio-preview">
      <div className={`sf-qr-frame ${frame ? "with-frame" : ""}`} style={{ background: bg }}>
        <svg ref={svgRef} viewBox={`0 0 ${total} ${total}`} role="img" aria-label="QR personalizado">
          <rect width={total} height={total} fill={bg}/>
          {Array.from({ length: matrixSize }).flatMap((_, row) => Array.from({ length: matrixSize }).map((__, col) => {
            const on = matrix[row * matrixSize + col]; if (!on || finderCell(row,col)) return null;
            const x = col + quiet, y = row + quiet;
            if (dotStyle === "dots") return <circle key={`${row}-${col}`} cx={x+.5} cy={y+.5} r={.42} fill={fg}/>;
            return <rect key={`${row}-${col}`} x={x+.07} y={y+.07} width={.86} height={.86} rx={dotStyle === "rounded" ? .28 : 0} fill={fg}/>;
          }))}
          {eye(0,0,"tl")}{eye(0,matrixSize-7,"tr")}{eye(matrixSize-7,0,"bl")}
          {logo && <g><rect x={total/2-2.2} y={total/2-2.2} width="4.4" height="4.4" rx="1.1" fill={bg}/><rect x={total/2-1.75} y={total/2-1.75} width="3.5" height="3.5" rx=".9" fill={brand}/><text x={total/2} y={total/2+.55} textAnchor="middle" fontSize="1.65" fontWeight="800" fill="white">M</text></g>}
        </svg>
        {frame && <div className="sf-frame-copy"><b>ESCANEÁ Y PEDÍ</b><span>por WhatsApp</span></div>}
      </div>
      <div className="sf-preview-meta"><span>Vector · Error correction H</span><b>{sizeMm} × {sizeMm} mm</b></div>
      <div className="sf-preview-actions"><button onClick={downloadSvg}>↓ SVG para imprenta</button><button onClick={() => navigator.clipboard?.writeText(payload)}>Copiar URL</button></div>
    </section>
  </div>;
}

function Overview() {
  return <>
    <div className="sf-demo-banner"><b>Intelligence mode</b><span>Datos demo hasta conectar el nuevo proyecto de Supabase · La arquitectura de tracking ya está preparada.</span></div>
    <div className="sf-kpis"><Kpi label="Scans" value="8.491" detail="+18,4% vs período anterior" tone="good"/><Kpi label="Unique visitors" value="6.218" detail="73,2% estimados"/><Kpi label="Conversations" value="2.422" detail="28,5% scan → conversación" tone="good"/><Kpi label="Orders" value="642" detail="26,5% conversación → pedido"/><Kpi label="Attributed revenue" value="$7,86M" detail="Revenue demo" tone="good"/></div>
    <div className="sf-grid-2"><Panel title="Full-funnel attribution" subtitle="Del mundo físico a revenue"><Funnel/></Panel><Panel title="Live activity" subtitle="Últimos eventos"><div className="sf-live-list">{liveEvents.map((e,i)=><div key={i}><i/><span><b>{e[2]}</b><small>{e[1]} · {e[3]} → {e[4]}</small></span><time>{e[0]}</time></div>)}</div></Panel></div>
    <div className="sf-grid-3"><Panel title="Top physical channels"><div className="sf-ranking">{qrs.map((q,i)=><div key={q.slug}><em>0{i+1}</em><span><b>{q.name}</b><small>{q.scans.toLocaleString("es-AR")} scans · {q.orders} orders</small></span><strong>{money(q.revenue)}</strong></div>)}</div></Panel><Panel title="Time heatmap" subtitle="Escaneos por día/hora"><Heatmap/></Panel><Panel title="System health"><div className="sf-health"><div><i className="ok"/><span><b>Redirect network</b><small>Operational</small></span></div><div><i className="ok"/><span><b>QR destinations</b><small>4/4 healthy</small></span></div><div><i className="warn"/><span><b>Supabase</b><small>Waiting for new account</small></span></div><div><i className="warn"/><span><b>WhatsApp webhook</b><small>Not connected</small></span></div></div></Panel></div>
  </>;
}

function Qrs() {
  return <Panel title="QR inventory" subtitle="Cada código mantiene historial, versiones y atribución"><div className="sf-data-table"><div className="head"><span>QR</span><span>Campaign</span><span>Scans</span><span>Conv.</span><span>Orders</span><span>Revenue</span><span>Safety</span></div>{qrs.map(q=><div key={q.slug}><span><b>{q.name}</b><small>/r/{q.slug}</small></span><span>{q.campaign}</span><span>{q.scans.toLocaleString("es-AR")}</span><span>{q.conversations}</span><span>{q.orders}</span><span>{money(q.revenue)}</span><span><i className="sf-score-pill">{q.score}</i></span></div>)}</div></Panel>;
}

function Campaigns() {
  return <div className="sf-campaign-grid">{[
    ["Lanzamiento Septiembre","5.000 piezas físicas","4 QR · 3 batches","3.184 scans","$4,8M revenue"],
    ["Always-on heladeras","Imanes de recompra","1 QR · evergreen","1.281 scans","$1,71M revenue"],
    ["Packaging","Post-compra + recompra","2 QR · 2 variants","934 scans","$1,10M revenue"],
  ].map((c,i)=><article key={i}><div className="sf-campaign-icon">{String(i+1).padStart(2,"0")}</div><small>ACTIVE CAMPAIGN</small><h3>{c[0]}</h3><p>{c[1]}</p><div><span>{c[2]}</span><b>{c[3]}</b><strong>{c[4]}</strong></div></article>)}</div>;
}

function Distribution() {
  return <><div className="sf-kpis"><Kpi label="Printed units" value="5.000" detail="Septiembre"/><Kpi label="Tracked batches" value="3" detail="100% etiquetados"/><Kpi label="Avg response" value="10,4%" detail="Scan / unidades" tone="good"/><Kpi label="Physical ROAS" value="11,5×" detail="Revenue / impresión" tone="good"/></div><Panel title="Distribution intelligence" subtitle="Qué lote, zona y distribución realmente genera respuesta"><div className="sf-data-table distribution"><div className="head"><span>Batch</span><span>Zone</span><span>Units</span><span>Scans</span><span>Response</span><span>Cost</span><span>Revenue</span></div>{batches.map(b=><div key={b.batch}><span><b>{b.batch}</b></span><span>{b.zone}</span><span>{b.units}</span><span>{b.scans}</span><span><i className={b.response > 10 ? "sf-good" : "sf-warn"}>{b.response}%</i></span><span>{money(b.cost)}</span><span><b>{money(b.revenue)}</b></span></div>)}</div></Panel></>;
}

function Analytics() {
  return <div className="sf-grid-2"><Panel title="Time intelligence" subtitle="Cuándo ocurre la intención"><Heatmap/><p className="sf-insight">41% de los escaneos ocurre entre 19:00 y 22:00. Sugerencia: concentrar distribución y respuesta comercial en esa ventana.</p></Panel><Panel title="Approximate geography" subtitle="IP-derived; nunca GPS sin permiso"><div className="sf-geo">{[["Corrientes",68],["Resistencia",16],["Goya",7],["Buenos Aires",5],["Otros",4]].map(([n,v])=><div key={n as string}><span>{n}</span><div><i style={{width:`${v}%`}}/></div><b>{v}%</b></div>)}</div></Panel></div>;
}

function Conversions() {
  return <div className="sf-grid-2"><Panel title="Conversion journey" subtitle="Eventos exactos vs señales estimadas"><Funnel/><div className="sf-legend"><span><i className="exact"/> Exact event</span><span><i className="estimated"/> Estimated identity/location</span></div></Panel><Panel title="Recent attributed journeys"><div className="sf-journeys">{[["v_7A92F","Folleto A6","19:41 scan → 19:42 message → 19:51 order","$34.500"],["v_3K81P","Imán heladera","18:17 scan → 18:18 message → 18:29 order","$23.000"],["v_9Q2AX","Packaging","17:03 scan → 17:05 conversation","—"]].map(j=><div key={j[0]}><code>{j[0]}</code><span><b>{j[1]}</b><small>{j[2]}</small></span><strong>{j[3]}</strong></div>)}</div></Panel></div>;
}

function Experiments() {
  return <div className="sf-experiments"><article><div><span>RUNNING</span><b>WhatsApp opening message</b><small>50/50 split · 4.281 exposures</small></div><div className="sf-ab"><section><em>A</em><p>“Hola MILANGA, quiero hacer un pedido.”</p><b>19,3%</b><small>conversation rate</small></section><section className="winner"><em>B</em><p>“Hola MILANGA 👋 Vi el folleto. ¿Qué promos tienen?”</p><b>25,7%</b><small>conversation rate · +33,2%</small></section></div></article><article><div><span>DRAFT</span><b>QR frame CTA</b><small>“Escaneá y pedí” vs “Pedí por WhatsApp”</small></div><button>Configure experiment</button></article></div>;
}

function Live() {
  return <div className="sf-live-page"><Panel title="Live signal map" subtitle="Actividad en tiempo real"><div className="sf-map"><div className="pulse p1"/><div className="pulse p2"/><div className="pulse p3"/><div className="pulse p4"/><span>Corrientes</span><small>● 4 active sessions</small></div></Panel><Panel title="Event stream" subtitle="Scan → redirect → conversion"><div className="sf-event-stream">{liveEvents.concat(liveEvents).map((e,i)=><div key={i}><code>evt_{(93281+i*791).toString(16)}</code><i className={i<2?"hot":""}/><span><b>{e[2]}</b><small>{e[1]} · {e[3]}</small></span><strong>{i%3===0?"scan":i%3===1?"redirect":"conversation"}</strong><time>{e[0]}</time></div>)}</div></Panel></div>;
}

function Integrations() {
  return <div className="sf-integrations">{[
    ["Supabase","Event warehouse + Auth + Realtime","Waiting for new MILANGA account","pending"],
    ["WhatsApp Business Platform","Messages, conversations and delivery/read webhooks","Ready to connect","ready"],
    ["Vercel","Redirect runtime, geo headers and deployment","Connected through GitHub","connected"],
    ["Webhooks","Send ScanFlow events to external systems","Ingest + outbound endpoints prepared","ready"],
  ].map(i=><article key={i[0]}><div className="sf-integration-logo">{i[0].slice(0,2).toUpperCase()}</div><div><h3>{i[0]}</h3><p>{i[1]}</p><span className={i[3]}>{i[2]}</span></div><button>{i[3]==="connected"?"Manage":"Connect"}</button></article>)}</div>;
}

export default function ScanFlowPlatform() {
  const [view, setView] = useState<View>("overview");
  const [query, setQuery] = useState("");
  useEffect(() => { const onKey=(e:KeyboardEvent)=>{ if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="k"){e.preventDefault();document.getElementById("sf-search")?.focus();}}; window.addEventListener("keydown",onKey); return()=>window.removeEventListener("keydown",onKey);},[]);
  const titles: Record<View,[string,string]> = {
    overview:["Command Center","Physical-to-digital attribution, in one place."], qrs:["QR Inventory","Permanent endpoints with full version history."], studio:["QR Studio","Brandable, printable and automatically safety-scored."], campaigns:["Campaigns","Group creative, destinations, batches and outcomes."], distribution:["Distribution","Measure where physical media actually performs."], analytics:["Analytics","Time, geography, devices and repeat behavior."], conversions:["Conversions","Connect scans to conversations, orders and revenue."], experiments:["Experiments","A/B test messages, destinations, offers and creative."], live:["Live","Watch physical intent become digital activity."], integrations:["Integrations","Connect the systems that complete attribution."],
  };
  const content: Record<View, React.ReactNode> = { overview:<Overview/>, qrs:<Qrs/>, studio:<QrStudio/>, campaigns:<Campaigns/>, distribution:<Distribution/>, analytics:<Analytics/>, conversions:<Conversions/>, experiments:<Experiments/>, live:<Live/>, integrations:<Integrations/> };
  return <main className="sf-shell">
    <aside className="sf-sidebar"><div className="sf-brand"><div><i/><i/><i/><i/></div><b>ScanFlow</b><span>BETA</span></div><button className="sf-workspace"><em>M</em><span><b>MILANGA</b><small>Workspace</small></span><i>⌄</i></button><nav>{NAV.map(n=><button key={n.id} className={view===n.id?"active":""} onClick={()=>setView(n.id)}><i>{n.glyph}</i><span>{n.label}</span>{n.id==="live"&&<em/>}</button>)}</nav><div className="sf-side-bottom"><div><span>Tracking infrastructure</span><b><i/> Operational</b></div><small>Privacy-first · no raw IP storage</small></div></aside>
    <section className="sf-main"><header className="sf-top"><div className="sf-search"><span>⌕</span><input id="sf-search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search QR, campaign, batch, visitor…"/><kbd>⌘ K</kbd></div><div><span className="sf-live-chip"><i/> LIVE</span><button className="sf-top-icon">?</button><button className="sf-avatar">AR</button></div></header><div className="sf-page"><div className="sf-page-head"><div><span>SCANFLOW INTELLIGENCE / {view.toUpperCase()}</span><h1>{titles[view][0]}</h1><p>{titles[view][1]}</p></div><div><button className="sf-secondary">Last 30 days⌄</button><button className="sf-primary" onClick={()=>setView("studio")}>＋ Create QR</button></div></div>{content[view]}</div></section>
  </main>;
}
