import { Fragment, useEffect, useMemo, useState } from "react";

export function norm(value) { return String(value || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim(); }
const OPEN_STATUSES = ["aberto", "em andamento", "em espera", "pausado", "aguardando usuario", "aguardando aprovacao", "reaberto"];
export function isOpen(status) { return OPEN_STATUSES.includes(norm(status)); }
export function Autocomplete({ value, onChange, options, placeholder, allowFreeText = false }) {
  const opts = Array.isArray(options) ? options : [];
  const selected = opts.find((o) => String(o.value) === String(value));
  const [q, setQ] = useState(selected ? selected.label : (allowFreeText ? String(value || "") : ""));
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const sel = opts.find((o) => String(o.value) === String(value));
    setQ(sel ? sel.label : (allowFreeText ? String(value || "") : ""));
  }, [value]);
  const filtered = opts.filter((o) => norm(o.label).includes(norm(q))).slice(0, 60);
  const pick = (o) => { onChange(o.value); setQ(o.label); setOpen(false); };
  return (
    <div className="ac">
      <input
        value={q}
        placeholder={placeholder || "Digite para buscar..."}
        onChange={(e) => { setQ(e.target.value); setOpen(true); if (allowFreeText) onChange(e.target.value); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => { setOpen(false); if (!allowFreeText) { const sel = opts.find((o) => String(o.value) === String(value)); setQ(sel ? sel.label : ""); } }, 150)}
      />
      {open && filtered.length > 0 && (
        <div className="ac-list">
          {filtered.map((o) => <div key={o.value} className="ac-item" onMouseDown={() => pick(o)}>{o.label}</div>)}
        </div>
      )}
    </div>
  );
}

function val(item, key) {
  const v = item?.[key];
  if (v === null || v === undefined || v === "") return "—";
  if (Array.isArray(v)) return `${v.length} item(ns)`;
  if (typeof v === "object") return "—";
  return String(v);
}

/* ---------- Formulario generico ---------- */
function optValue(o) { return o && typeof o === "object" ? o.value : o; }
function optLabel(o) { return o && typeof o === "object" ? o.label : o; }

function RecordForm({ item, fields, onCancel, onSubmit, onDelete, saving, title }) {
  const [form, setForm] = useState(() => {
    const base = {};
    fields.forEach((f) => { base[f.key] = item?.[f.key] ?? (f.type === "multiselect" ? [] : ""); });
    return base;
  });
  const setVal = (k, v) => setForm((cur) => ({ ...cur, [k]: v }));
  return (
    <div className="drawer-overlay" onClick={onCancel}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head"><h3>{title}</h3><button className="btn btn-ghost" onClick={onCancel}>Fechar</button></div>
        {fields.map((f) => (
          <div className="field" key={f.key}>
            <label>{f.label}{f.required ? " *" : ""}</label>
            {f.type === "textarea" ? (
              <textarea className="solution" value={form[f.key] || ""} onChange={(e) => setVal(f.key, e.target.value)} />
            ) : f.type === "select" ? (
              <select value={form[f.key] || ""} onChange={(e) => setVal(f.key, e.target.value)}>
                <option value="">— Selecionar —</option>
                {(f.options || []).map((o) => <option key={optValue(o)} value={optValue(o)}>{optLabel(o)}</option>)}
              </select>
            ) : f.type === "multiselect" ? (
              <select multiple value={Array.isArray(form[f.key]) ? form[f.key] : []} style={{ minHeight: 130, width: "100%" }}
                onChange={(e) => setVal(f.key, Array.from(e.target.selectedOptions).map((o) => o.value))}>
                {(f.options || []).map((o) => <option key={optValue(o)} value={optValue(o)}>{optLabel(o)}</option>)}
              </select>
            ) : f.type === "password" ? (
              <input type="password" value={form[f.key] || ""} placeholder={item?.id ? "(deixe em branco para manter)" : ""} onChange={(e) => setVal(f.key, e.target.value)} />
            ) : (
              <input value={form[f.key] || ""} onChange={(e) => setVal(f.key, f.type === "number" ? e.target.value.replace(/[^0-9.]/g, "") : e.target.value)} />
            )}
          </div>
        ))}
        <div className="drawer-actions">
          <button className="btn btn-primary" style={{ width: "auto" }} disabled={saving} onClick={() => onSubmit(form)}>{saving ? <span className="spinner" /> : "Salvar"}</button>
          <button className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
          {item?.id && onDelete && <button className="btn-reopen" style={{ marginLeft: "auto" }} disabled={saving} onClick={() => onDelete(item)}>Excluir</button>}
        </div>
      </div>
    </div>
  );
}

/* ---------- Lista com busca, detalhe e edicao ---------- */
export function CollectionView({ title, items, columns, editable, fields, onCreate, onSave, onDelete, saving }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null); // {mode:'new'|'edit', item}
  const list = Array.isArray(items) ? items : [];
  const filtered = useMemo(() => {
    const q = norm(search);
    if (!q) return list;
    return list.filter((item) => norm(JSON.stringify(item)).includes(q));
  }, [list, search]);

  const submit = async (formValues) => {
    if (editing.mode === "new") { const ok = await onCreate(formValues); if (ok) setEditing(null); }
    else { const ok = await onSave(editing.item.id, formValues); if (ok) setEditing(null); }
  };
  const remove = async (item) => { const ok = await onDelete(item.id); if (ok) { setEditing(null); setSelected(null); } };

  return (
    <div>
      <div className="toolbar">
        <input className="search" placeholder={`Buscar em ${title.toLowerCase()}...`} value={search} onChange={(e) => setSearch(e.target.value)} />
        <span style={{ color: "var(--muted)", fontSize: 13 }}>{filtered.length} registro(s)</span>
        <button className="btn btn-ghost" style={{ width: "auto", marginLeft: "auto" }} onClick={() => exportCollectionCsv(title, columns, filtered)} disabled={!filtered.length}>Exportar CSV</button>
        {editable && <button className="btn btn-primary" style={{ width: "auto" }} onClick={() => setEditing({ mode: "new", item: {} })}>+ Novo</button>}
      </div>
      {filtered.length === 0 ? (
        <div className="panel"><div className="empty">Nenhum registro encontrado.</div></div>
      ) : (
        <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
          <table className="data-table">
            <thead><tr>{columns.map((c) => <th key={c.key}>{c.label}</th>)}{editable && <th></th>}</tr></thead>
            <tbody>
              {filtered.map((item, i) => (
                <tr key={item.id || i} onClick={() => (editable ? setEditing({ mode: "edit", item }) : setSelected(item))}>
                  {columns.map((c) => <td key={c.key}>{c.render ? c.render(item) : val(item, c.key)}</td>)}
                  {editable && <td style={{ textAlign: "right", color: "var(--wega-blue)", fontWeight: 700 }}>editar ›</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selected && !editable && (
        <div className="drawer-overlay" onClick={() => setSelected(null)}>
          <div className="drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-head"><h3>{selected.name || selected.title || selected.id || "Detalhe"}</h3><button className="btn btn-ghost" onClick={() => setSelected(null)}>Fechar</button></div>
            <div className="kv" style={{ gridTemplateColumns: "180px 1fr" }}>
              {Object.entries(selected).filter(([, v]) => v !== null && v !== undefined && typeof v !== "object").map(([k, v]) => (
                <><div className="k" key={`k-${k}`}>{k}</div><div key={`v-${k}`}>{String(v) || "—"}</div></>
              ))}
            </div>
          </div>
        </div>
      )}
      {editing && (
        <RecordForm
          title={editing.mode === "new" ? `Novo registro — ${title}` : `Editar — ${title}`}
          item={editing.item} fields={fields} saving={saving}
          onCancel={() => setEditing(null)} onSubmit={submit} onDelete={remove}
        />
      )}
    </div>
  );
}

/* ---------- Relatorios ---------- */
function BarRow({ label, value, max, color, onClick, active }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div
      className={`bar-row${onClick ? " bar-row-click" : ""}${active ? " bar-row-active" : ""}`}
      onClick={onClick}
      style={onClick ? { cursor: "pointer", borderRadius: 6, background: active ? "var(--wega-blue-050, rgba(21,101,192,.08))" : undefined } : undefined}
      title={onClick ? `Filtrar por ${label}` : undefined}
    >
      <div className="bar-label">{label}</div>
      <div className="bar-track"><div className="bar-fill" style={{ width: `${pct}%`, background: color || "var(--wega-blue)" }} /></div>
      <div className="bar-value">{value}</div>
    </div>
  );
}
function countBy(items, keyFn) {
  const map = new Map();
  items.forEach((it) => { const k = keyFn(it) || "—"; map.set(k, (map.get(k) || 0) + 1); });
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}
/* ---------- Metricas e exportacao ---------- */
function avgResponseMin(list) {
  const w = list.filter((t) => t.firstResponseAt && t.openedAt);
  if (!w.length) return 0;
  const tot = w.reduce((sum, t) => { const o = new Date(t.openedAt).getTime(); const r = new Date(t.firstResponseAt).getTime(); if (!Number.isFinite(o) || !Number.isFinite(r) || r < o) return sum; return sum + Math.round((r - o) / 60000); }, 0);
  return Math.round(tot / w.length);
}
function avgResolutionMin(list) {
  const r = list.filter((t) => Number.isFinite(Number(t.resolutionMinutes)) && Number(t.resolutionMinutes) > 0);
  if (r.length) return Math.round(r.reduce((sum, t) => sum + Number(t.resolutionMinutes), 0) / r.length);
  const res = list.filter((t) => norm(t.status) === "resolvido" && t.resolvedAt && t.openedAt);
  if (!res.length) return 0;
  const tot = res.reduce((sum, t) => { const d = (new Date(t.resolvedAt) - new Date(t.openedAt)) / 60000; return sum + (Number.isFinite(d) && d >= 0 ? d : 0); }, 0);
  return Math.round(tot / res.length);
}
function csatAvg(list) {
  const vals = list.map((t) => Number(t.csat ?? t.satisfactionRating ?? t.rating)).filter((v) => Number.isFinite(v) && v > 0);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}
// SLA segue estritamente o campo Prazo (SLA) (dueDate), fim de dia em GMT-03.
function ticketDeadlineMsV2(t) {
  const due = t && t.dueDate ? String(t.dueDate).slice(0, 10) : "";
  if (!due) return Number.POSITIVE_INFINITY;
  const ms = new Date(`${due}T23:59:59.999-03:00`).getTime();
  return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY;
}
function isOverduePrazo(t) {
  if (!t || norm(t.status) === "resolvido") return false;
  const ms = ticketDeadlineMsV2(t);
  return Number.isFinite(ms) && ms < Date.now();
}
function resolvedLatePrazo(t) {
  if (!t || norm(t.status) !== "resolvido" || !t.resolvedAt) return false;
  const ms = ticketDeadlineMsV2(t);
  return Number.isFinite(ms) && new Date(t.resolvedAt).getTime() > ms;
}
function slaPct(list) {
  const m = list.filter((t) => isOpen(t.status) || norm(t.status) === "resolvido");
  if (!m.length) return 100;
  const breached = m.filter((t) => isOverduePrazo(t) || resolvedLatePrazo(t)).length;
  return Math.round(((m.length - breached) / m.length) * 100);
}
function fmtMin(m) {
  if (!m || m <= 0) return "—";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60); const mm = m % 60;
  return mm ? `${h}h ${mm}min` : `${h}h`;
}
function slaColor(p) { return p >= 90 ? "var(--ok)" : p >= 70 ? "var(--warn)" : "var(--crit)"; }
function technicianProductivity(list) {
  const names = [...new Set(list.filter((t) => t.assignee).map((t) => t.assignee))];
  return names.map((name) => {
    const a = list.filter((t) => t.assignee === name);
    return { name, assigned: a.length, open: a.filter((t) => isOpen(t.status)).length, resolved: a.filter((t) => norm(t.status) === "resolvido").length, critical: a.filter((t) => norm(t.priority) === "critica" && isOpen(t.status)).length, sla: slaPct(a), avgRes: avgResolutionMin(a), firstResp: avgResponseMin(a) };
  }).sort((x, y) => y.assigned - x.assigned);
}
function downloadCsv(filename, rows) {
  const esc = (v) => { const str = v == null ? "" : String(v); return /[";\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str; };
  const csv = rows.map((r) => r.map(esc).join(";")).join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
export function exportCollectionCsv(title, columns, items) {
  const cols = (columns || []).filter((c) => c && c.key);
  const header = cols.map((c) => c.label || c.key);
  const rows = (items || []).map((it) => cols.map((c) => { const raw = it[c.key]; if (raw == null) return ""; if (Array.isArray(raw)) return `${raw.length} item(ns)`; if (typeof raw === "object") return ""; return raw; }));
  downloadCsv(`${norm(title).replace(/\s+/g, "-") || "dados"}-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...rows]);
}

export function Reports({ tickets }) {
  const data = useMemo(() => {
    const list = Array.isArray(tickets) ? tickets : [];
    const byStatus = countBy(list, (t) => t.status || "Aberto");
    const byPriority = countBy(list, (t) => t.priority || "Media");
    const byDept = countBy(list, (t) => t.department || t.queue || "—").slice(0, 8);
    const byAssignee = countBy(list.filter((t) => t.assignee), (t) => t.assignee).slice(0, 8);
    const resolved = list.filter((t) => norm(t.status) === "resolvido");
    const breached = list.filter((t) => isOverduePrazo(t) || resolvedLatePrazo(t));
    const sla = slaPct(list);
    const deptNames = [...new Set(list.map((t) => t.department || t.queue || "—"))].filter((x) => x && x !== "—");
    const slaByDept = deptNames.map((dn) => [dn, slaPct(list.filter((t) => (t.department || t.queue || "—") === dn))]).sort((a, b) => a[1] - b[1]).slice(0, 8);
    const tech = technicianProductivity(list).slice(0, 15);
    return { list, byStatus, byPriority, byDept, byAssignee, slaByDept, tech, resolved: resolved.length, breached: breached.length, sla, avgRes: avgResolutionMin(list), firstResp: avgResponseMin(list), csat: csatAvg(list) };
  }, [tickets]);
  const mx = (arr) => Math.max(1, ...arr.map((x) => x[1]));
  const prioColor = (p) => ({ critica: "var(--crit)", alta: "var(--warn)", media: "var(--info)", baixa: "var(--muted)" }[norm(p)] || "var(--info)");
  const exportTickets = () => {
    const header = ["ID", "Titulo", "Status", "Prioridade", "Departamento", "Solicitante", "Responsavel", "Aberto em", "Resolvido em", "SLA prazo", "SLA violado"];
    const rows = data.list.map((t) => [t.id, t.title || "", t.status || "", t.priority || "", t.department || t.queue || "", t.requester || "", t.assignee || "", t.openedAt || "", t.resolvedAt || "", Number.isFinite(ticketDeadlineMsV2(t)) ? new Date(ticketDeadlineMsV2(t)).toISOString() : "", (isOverduePrazo(t) || resolvedLatePrazo(t)) ? "Sim" : "Nao"]);
    downloadCsv(`chamados-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...rows]);
  };
  const exportProd = () => {
    const header = ["Tecnico", "Atribuidos", "Em aberto", "Resolvidos", "Criticos", "SLA %", "Tempo medio resolucao (min)", "1a resposta (min)"];
    const rows = data.tech.map((t) => [t.name, t.assigned, t.open, t.resolved, t.critical, t.sla, t.avgRes, t.firstResp]);
    downloadCsv(`produtividade-tecnica-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...rows]);
  };
  return (
    <div>
      <div className="toolbar">
        <span style={{ color: "var(--muted)", fontSize: 13 }}>Indicadores consolidados de {data.list.length} chamado(s).</span>
        <button className="btn btn-ghost" style={{ width: "auto", marginLeft: "auto" }} onClick={exportTickets} disabled={!data.list.length}>Exportar chamados (CSV)</button>
        <button className="btn btn-ghost" style={{ width: "auto" }} onClick={exportProd} disabled={!data.tech.length}>Exportar produtividade (CSV)</button>
      </div>
      <div className="kpi-grid">
        <div className="kpi"><div className="label">Total</div><div className="value">{data.list.length}</div></div>
        <div className="kpi"><div className="label">Resolvidos</div><div className="value ok">{data.resolved}</div></div>
        <div className="kpi"><div className="label">SLA no prazo</div><div className={`value ${data.sla >= 90 ? "ok" : data.sla >= 70 ? "warn" : "crit"}`}>{data.sla}%</div></div>
        <div className="kpi"><div className="label">SLA violado</div><div className="value crit">{data.breached}</div></div>
        <div className="kpi"><div className="label">Tempo medio resolucao</div><div className="value">{fmtMin(data.avgRes)}</div></div>
        <div className="kpi"><div className="label">1a resposta media</div><div className="value">{fmtMin(data.firstResp)}</div></div>
        <div className="kpi"><div className="label">CSAT</div><div className="value">{data.csat ? `${data.csat.toFixed(1)}/5` : "—"}</div></div>
      </div>
      <div className="report-grid">
        <div className="panel"><h2>Por status</h2>{data.byStatus.map(([k, v]) => <BarRow key={k} label={k} value={v} max={mx(data.byStatus)} />)}</div>
        <div className="panel"><h2>Por prioridade</h2>{data.byPriority.map(([k, v]) => <BarRow key={k} label={k} value={v} max={mx(data.byPriority)} color={prioColor(k)} />)}</div>
        <div className="panel"><h2>Por setor / fila</h2>{data.byDept.map(([k, v]) => <BarRow key={k} label={k} value={v} max={mx(data.byDept)} color="var(--wega-teal)" />)}</div>
        <div className="panel"><h2>SLA por departamento</h2>{data.slaByDept.length ? data.slaByDept.map(([k, v]) => <BarRow key={k} label={k} value={v} max={100} color={slaColor(v)} />) : <div className="empty">Sem dados de SLA.</div>}</div>
      </div>
      <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
        <h2 style={{ padding: "18px 20px 0" }}>Produtividade dos tecnicos</h2>
        <table className="data-table">
          <thead><tr><th>Tecnico</th><th>Atribuidos</th><th>Em aberto</th><th>Resolvidos</th><th>SLA %</th><th>Tempo medio</th><th>1a resposta</th></tr></thead>
          <tbody>
            {data.tech.length === 0 ? <tr><td colSpan={7}><div className="empty">Sem chamados atribuidos.</div></td></tr> : data.tech.map((t) => (
              <tr key={t.name}><td>{t.name}</td><td>{t.assigned}</td><td><strong>{t.open}</strong></td><td>{t.resolved}</td><td style={{ color: slaColor(t.sla), fontWeight: 700 }}>{t.sla}%</td><td>{fmtMin(t.avgRes)}</td><td>{fmtMin(t.firstResp)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------- Dashboard rico ---------- */
function pastDue(t) {
  return isOverduePrazo(t);
}
export function Dashboard({ tickets, onGo }) {
  const [filter, setFilter] = useState(null);
  const [expandedTech, setExpandedTech] = useState(null);
  const baseList = Array.isArray(tickets) ? tickets : [];
  const matchFilter = (t, f) => {
    if (!f) return true;
    if (f.dim === "status") return (t.status || "Aberto") === f.val;
    if (f.dim === "priority") return norm(t.priority || "Media") === norm(f.val);
    if (f.dim === "dept") return (t.department || t.queue || "—") === f.val;
    if (f.dim === "kpi") {
      if (f.val === "abertos") return isOpen(t.status);
      if (f.val === "andamento") return norm(t.status) === "em andamento";
      if (f.val === "aguardando") return isOpen(t.status) && (norm(t.status).startsWith("aguardando") || norm(t.status) === "em espera" || norm(t.status) === "pausado");
      if (f.val === "criticos") return isOpen(t.status) && norm(t.priority) === "critica";
      if (f.val === "slaRisco") return isOpen(t.status) && pastDue(t);
      if (f.val === "resolvidos") return norm(t.status) === "resolvido";
      return true;
    }
    return true;
  };
  const toggle = (dim, val, label) => { setExpandedTech(null); setFilter((cur) => (cur && cur.dim === dim && cur.val === val ? null : { dim, val, label })); };
  const fActive = (dim, val) => Boolean(filter && filter.dim === dim && filter.val === val);
  const d = useMemo(() => {
    const list = baseList.filter((t) => matchFilter(t, filter));
    const open = list.filter((t) => isOpen(t.status));
    const resolved = list.filter((t) => norm(t.status) === "resolvido");
    const slaRisco = open.filter(pastDue);
    const sla = slaPct(list);
    const byStatus = countBy(list, (t) => t.status || "Aberto");
    const byPriority = countBy(list, (t) => t.priority || "Media");
    const byDept = countBy(list, (t) => t.department || t.queue || "—").slice(0, 8);
    const deptNames = [...new Set(list.map((t) => t.department || t.queue || "—"))].filter((x) => x && x !== "—");
    const slaByDept = deptNames.map((dn) => [dn, slaPct(list.filter((t) => (t.department || t.queue || "—") === dn))]).sort((a, b) => a[1] - b[1]).slice(0, 6);
    const months = []; const base = new Date(); base.setDate(1);
    for (let i = 5; i >= 0; i -= 1) { const dt = new Date(base.getFullYear(), base.getMonth() - i, 1); months.push(dt); }
    const vol6 = months.map((dt) => { const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`; const label = dt.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""); return [label, list.filter((t) => String(t.openedAt || "").slice(0, 7) === key).length]; });
    const tech = technicianProductivity(list).slice(0, 8);
    const agenda = open.filter((t) => Number.isFinite(ticketDeadlineMsV2(t))).map((t) => ({ id: t.id, title: t.title, when: new Date(ticketDeadlineMsV2(t)).toISOString(), assignee: t.assignee, dept: t.department || t.queue })).sort((a, b) => String(a.when).localeCompare(String(b.when))).slice(0, 6);
    const alertas = [];
    slaRisco.slice(0, 6).forEach((t) => alertas.push({ kind: "crit", text: `SLA em risco: ${t.id} — ${t.title || ""}` }));
    open.filter((t) => !t.assignee).slice(0, 6).forEach((t) => alertas.push({ kind: "warn", text: `Sem responsavel: ${t.id} — ${t.title || ""}` }));
    open.filter((t) => norm(t.status) === "aguardando aprovacao").slice(0, 6).forEach((t) => alertas.push({ kind: "info", text: `Aguardando aprovacao: ${t.id} — ${t.title || ""}` }));
    let tarefasTotal = 0, tarefasFeitas = 0;
    list.forEach((t) => (Array.isArray(t.checklistItems) ? t.checklistItems : []).forEach((c) => { tarefasTotal += 1; if (c.done) tarefasFeitas += 1; }));
    return {
      total: list.length, abertos: open.length,
      andamento: list.filter((t) => norm(t.status) === "em andamento").length,
      aguardando: open.filter((t) => norm(t.status).startsWith("aguardando") || norm(t.status) === "em espera" || norm(t.status) === "pausado").length,
      criticos: open.filter((t) => norm(t.priority) === "critica").length,
      resolvidos: resolved.length, slaRisco: slaRisco.length, sla,
      csat: csatAvg(list), firstResp: avgResponseMin(list), avgRes: avgResolutionMin(list),
      byStatus, byPriority, byDept, slaByDept, vol6, tech, agenda, alertas: alertas.slice(0, 10), tarefasTotal, tarefasFeitas,
      recentes: [...list].sort((a, b) => String(b.updatedAtIso || b.openedAt || "").localeCompare(String(a.updatedAtIso || a.openedAt || ""))).slice(0, 6),
      list,
    };
  }, [tickets, filter]);
  const mx = (arr) => Math.max(1, ...arr.map((x) => x[1]));
  const prioColor = (p) => ({ critica: "var(--crit)", alta: "var(--warn)", media: "var(--info)", baixa: "var(--muted)" }[norm(p)] || "var(--info)");
  return (
    <div>
      {filter && (
        <div className="panel" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", marginBottom: 12 }}>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>Filtro ativo:</span>
          <strong style={{ fontSize: 13 }}>{filter.label}</strong>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>· {d.total} chamado(s)</span>
          <button className="btn btn-ghost" style={{ width: "auto", marginLeft: "auto" }} onClick={() => setFilter(null)}>✕ Limpar filtro</button>
        </div>
      )}
      <div className="kpi-grid">
        <div className={`kpi${fActive("kpi", "total") ? " kpi-active" : ""}`} onClick={() => toggle("kpi", "total", "Todos os chamados")} style={{ cursor: "pointer" }}><div className="label">Total</div><div className="value">{d.total}</div></div>
        <div className={`kpi${fActive("kpi", "abertos") ? " kpi-active" : ""}`} onClick={() => toggle("kpi", "abertos", "Em aberto")} style={{ cursor: "pointer" }}><div className="label">Em aberto</div><div className="value warn">{d.abertos}</div></div>
        <div className={`kpi${fActive("kpi", "andamento") ? " kpi-active" : ""}`} onClick={() => toggle("kpi", "andamento", "Em andamento")} style={{ cursor: "pointer" }}><div className="label">Em andamento</div><div className="value">{d.andamento}</div></div>
        <div className={`kpi${fActive("kpi", "aguardando") ? " kpi-active" : ""}`} onClick={() => toggle("kpi", "aguardando", "Aguardando")} style={{ cursor: "pointer" }}><div className="label">Aguardando</div><div className="value">{d.aguardando}</div></div>
        <div className={`kpi${fActive("kpi", "criticos") ? " kpi-active" : ""}`} onClick={() => toggle("kpi", "criticos", "Criticos abertos")} style={{ cursor: "pointer" }}><div className="label">Criticos abertos</div><div className="value crit">{d.criticos}</div></div>
        <div className={`kpi${fActive("kpi", "slaRisco") ? " kpi-active" : ""}`} onClick={() => toggle("kpi", "slaRisco", "SLA sob risco")} style={{ cursor: "pointer" }}><div className="label">SLA sob risco</div><div className="value crit">{d.slaRisco}</div></div>
        <div className="kpi"><div className="label">SLA cumprido</div><div className={`value ${d.sla >= 90 ? "ok" : d.sla >= 70 ? "warn" : "crit"}`}>{d.sla}%</div></div>
        <div className={`kpi${fActive("kpi", "resolvidos") ? " kpi-active" : ""}`} onClick={() => toggle("kpi", "resolvidos", "Resolvidos")} style={{ cursor: "pointer" }}><div className="label">Resolvidos</div><div className="value ok">{d.resolvidos}</div></div>
        <div className="kpi"><div className="label">CSAT</div><div className="value">{d.csat ? `${d.csat.toFixed(1)}/5` : "—"}</div></div>
        <div className="kpi"><div className="label">1a resposta</div><div className="value">{fmtMin(d.firstResp)}</div></div>
        <div className="kpi"><div className="label">Tempo medio resolucao</div><div className="value">{fmtMin(d.avgRes)}</div></div>
      </div>
      <div className="report-grid">
        <div className="panel"><h2>Distribuicao por status</h2>{d.byStatus.map(([k, v]) => <BarRow key={k} label={k} value={v} max={mx(d.byStatus)} onClick={() => toggle("status", k, `Status: ${k}`)} active={fActive("status", k)} />)}</div>
        <div className="panel"><h2>Distribuicao por prioridade</h2>{d.byPriority.map(([k, v]) => <BarRow key={k} label={k} value={v} max={mx(d.byPriority)} color={prioColor(k)} onClick={() => toggle("priority", k, `Prioridade: ${k}`)} active={fActive("priority", k)} />)}</div>
        <div className="panel"><h2>Chamados por departamento</h2>{d.byDept.map(([k, v]) => <BarRow key={k} label={k} value={v} max={mx(d.byDept)} color="var(--wega-teal)" onClick={() => toggle("dept", k, `Departamento: ${k}`)} active={fActive("dept", k)} />)}</div>
        <div className="panel"><h2>Volume (ultimos 6 meses)</h2>{d.vol6.map(([k, v]) => <BarRow key={k} label={k} value={v} max={mx(d.vol6)} color="var(--wega-navy)" />)}</div>
      </div>
      <div className="report-grid">
        <div className="panel"><h2>SLA por departamento</h2>{d.slaByDept.length ? d.slaByDept.map(([k, v]) => <BarRow key={k} label={k} value={v} max={100} color={slaColor(v)} />) : <div className="empty">Sem dados de SLA.</div>}</div>
        <div className="panel"><h2>Alertas operacionais</h2>
          <div className="followup-list">
            {d.alertas.length === 0 ? <p style={{ color: "var(--muted)", fontSize: 13 }}>Nenhum alerta no momento.</p> : d.alertas.map((a, i) => (
              <div className="followup" key={i} style={{ borderLeft: `3px solid ${a.kind === "crit" ? "var(--crit)" : a.kind === "warn" ? "var(--warn)" : "var(--info)"}` }}><div className="followup-msg">{a.text}</div></div>
            ))}
          </div>
        </div>
      </div>
      <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
        <h2 style={{ padding: "18px 20px 0" }}>Produtividade dos tecnicos <span style={{ fontSize: 12, fontWeight: 400, color: "var(--muted)" }}>— clique num tecnico para ver os chamados em aberto</span></h2>
        <table className="data-table">
          <thead><tr><th>Tecnico</th><th>Em aberto</th><th>Resolvidos</th><th>Criticos</th><th>SLA %</th><th>Tempo medio</th><th>1a resposta</th></tr></thead>
          <tbody>
            {d.tech.length === 0 ? <tr><td colSpan={7}><div className="empty">Sem chamados atribuidos.</div></td></tr> : d.tech.map((t) => {
              const techOpen = d.list.filter((x) => x.assignee === t.name && isOpen(x.status)).sort((a, b) => ticketDeadlineMsV2(a) - ticketDeadlineMsV2(b));
              const exp = expandedTech === t.name;
              return (
                <Fragment key={t.name}>
                  <tr onClick={() => setExpandedTech(exp ? null : t.name)} style={{ cursor: "pointer", background: exp ? "rgba(21,101,192,.06)" : undefined }} title="Ver chamados em aberto deste tecnico">
                    <td><span style={{ display: "inline-block", width: 14, color: "var(--muted)" }}>{exp ? "▾" : "▸"}</span>{t.name}</td>
                    <td><strong>{t.open}</strong></td><td>{t.resolved}</td><td style={{ color: t.critical ? "var(--crit)" : "inherit" }}>{t.critical}</td><td style={{ color: slaColor(t.sla), fontWeight: 700 }}>{t.sla}%</td><td>{fmtMin(t.avgRes)}</td><td>{fmtMin(t.firstResp)}</td>
                  </tr>
                  {exp && (
                    <tr><td colSpan={7} style={{ padding: 0, background: "rgba(0,0,0,.02)" }}>
                      {techOpen.length === 0 ? <div className="empty" style={{ padding: "10px 20px" }}>Nenhum chamado em aberto.</div> : (
                        <div style={{ padding: "8px 16px 12px" }}>
                          {techOpen.map((x) => {
                            const overdue = pastDue(x);
                            return (
                              <div key={x.id} onClick={(ev) => { ev.stopPropagation(); onGo && onGo("tickets"); }} style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 8px", borderBottom: "1px solid var(--border)", cursor: onGo ? "pointer" : "default" }}>
                                <strong style={{ minWidth: 84 }}>{x.id}</strong>
                                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.title || "(sem titulo)"}</span>
                                <span className={`badge ${({ resolvido: "s-resolvido", "em andamento": "s-andamento", reaberto: "s-reaberto", aberto: "s-aberto" })[norm(x.status)] || "s-espera"}`} style={{ whiteSpace: "nowrap" }}>{x.status}</span>
                                <span style={{ fontSize: 12, color: overdue ? "var(--crit)" : "var(--muted)", whiteSpace: "nowrap" }}>{Number.isFinite(ticketDeadlineMsV2(x)) ? `Prazo: ${new Date(ticketDeadlineMsV2(x)).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}` : "Sem prazo"}{overdue ? " · vencido" : ""}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </td></tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="report-grid">
        <div className="panel"><h2>Agenda executiva — proximos vencimentos</h2>
          <div className="followup-list">
            {d.agenda.length === 0 ? <p style={{ color: "var(--muted)", fontSize: 13 }}>Sem prazos de SLA proximos.</p> : d.agenda.map((a) => (
              <div className="followup" key={a.id}><div className="followup-head"><strong>{a.id}</strong><span className="followup-date">{new Date(a.when).toLocaleString("pt-BR")}</span></div><div className="followup-msg">{a.title || ""} · {a.dept || "—"} · {a.assignee || "Sem responsavel"}</div></div>
            ))}
          </div>
        </div>
        <div className="panel"><h2>Tarefas dos chamados</h2>
          <div className="kpi-grid" style={{ marginBottom: 12 }}>
            <div className="kpi"><div className="label">Total de tarefas</div><div className="value">{d.tarefasTotal}</div></div>
            <div className="kpi"><div className="label">Concluidas</div><div className="value ok">{d.tarefasFeitas}</div></div>
            <div className="kpi"><div className="label">Pendentes</div><div className="value warn">{d.tarefasTotal - d.tarefasFeitas}</div></div>
          </div>
          <h2 style={{ marginTop: 4 }}>Chamados recentes</h2>
          <div className="ticket-list">
            {d.recentes.map((t) => (
              <div key={t.id} className="ticket-card" style={{ gridTemplateColumns: "70px 1fr auto", cursor: "default", borderLeftColor: prioColor(t.priority) }}>
                <div className="ticket-id">{t.id}</div>
                <div><div className="ticket-title">{t.title || "(sem titulo)"}</div><div className="ticket-meta">{t.department || t.queue || "—"} · {t.assignee || "Sem responsavel"}</div></div>
                <div><span className={`badge ${({ resolvido: "s-resolvido", "em andamento": "s-andamento", reaberto: "s-reaberto", aberto: "s-aberto" })[norm(t.status)] || "s-espera"}`}>{t.status || "Aberto"}</span></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Central de Servicos (config funcional) ---------- */
function Toggle({ label, checked, onChange }) {
  return (
    <label className="toggle"><input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} /><span>{label}</span></label>
  );
}
export function ServiceCenterView({ serviceCenter, departments, users, onSave, saving }) {
  const [sc, setSc] = useState(() => JSON.parse(JSON.stringify(serviceCenter || {})));
  const [dirty, setDirty] = useState(false);
  useEffect(() => { setSc(JSON.parse(JSON.stringify(serviceCenter || {}))); setDirty(false); }, [serviceCenter]);
  const upd = (patch) => { setSc((cur) => ({ ...cur, ...patch })); setDirty(true); };
  const updPath = (obj, patch) => { setSc((cur) => ({ ...cur, [obj]: { ...(cur[obj] || {}), ...patch } })); setDirty(true); };
  const profiles = sc.ticketStatusProfiles || {};
  const esc = sc.escalationRules || {};
  const intake = sc.publicIntake || {};
  const reasons = sc.statusReasonRules || {};
  const deptCfg = sc.departments || {};
  const setProfile = (type, text) => { updPath("ticketStatusProfiles", { [type]: text.split(/[\n,]/).map((x) => x.trim()).filter(Boolean) }); };
  const setReason = (key, text) => { updPath("statusReasonRules", { [key]: text.split(/[\n,]/).map((x) => x.trim()).filter(Boolean) }); };
  const setDept = (id, patch) => {
    setSc((cur) => {
      const existing = cur.departments?.[id] || {};
      const next = { ...existing, ...patch };
      if (next.active === undefined) next.active = true; // grava ativo explicito
      return { ...cur, departments: { ...(cur.departments || {}), [id]: next } };
    });
    setDirty(true);
  };

  return (
    <div>
      <div className="toolbar">
        <span style={{ color: "var(--muted)", fontSize: 13 }}>Configuracoes do atendimento, portal, status, escalonamento e setores.</span>
        <button className="btn btn-primary" style={{ width: "auto", marginLeft: "auto" }} disabled={saving || !dirty} onClick={() => onSave(sc)}>{saving ? <span className="spinner" /> : dirty ? "Salvar alteracoes" : "Salvo"}</button>
      </div>

      <div className="panel"><h2>Geral</h2>
        <Toggle label="Central de Servicos ativa" checked={sc.enabled} onChange={(v) => upd({ enabled: v })} />
        <Toggle label="Painel de triagem visivel" checked={sc.triagePanelVisible} onChange={(v) => upd({ triagePanelVisible: v })} />
      </div>

      <div className="panel"><h2>Portal publico de chamados</h2>
        <Toggle label="Portal habilitado" checked={intake.enabled} onChange={(v) => updPath("publicIntake", { enabled: v })} />
        <div className="form-row">
          <div className="field"><label>Titulo do portal</label><input value={intake.portalTitle || ""} onChange={(e) => updPath("publicIntake", { portalTitle: e.target.value })} /></div>
          <div className="field"><label>Token de acesso</label><input value={intake.accessToken || ""} onChange={(e) => updPath("publicIntake", { accessToken: e.target.value })} /></div>
        </div>
        <div className="field"><label>Descricao</label><textarea className="solution" value={intake.portalDescription || ""} onChange={(e) => updPath("publicIntake", { portalDescription: e.target.value })} /></div>
        <div className="drawer-actions">
          {!intake.accessToken && <button className="btn btn-ghost" onClick={() => updPath("publicIntake", { accessToken: `portal-${Math.random().toString(36).slice(2, 10)}` })}>Gerar token</button>}
        </div>
        {intake.accessToken ? (() => {
          const link = `${typeof window !== "undefined" ? window.location.origin : ""}/#/public/request/${encodeURIComponent(intake.accessToken)}`;
          return (
            <div className="field"><label>Link do portal publico (compartilhe com solicitantes)</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input readOnly value={link} onFocus={(e) => e.target.select()} />
                <button className="btn btn-ghost" style={{ whiteSpace: "nowrap" }} onClick={() => { try { navigator.clipboard.writeText(link); } catch { /* ignore */ } }}>Copiar</button>
              </div>
              <small style={{ color: intake.enabled ? "var(--muted)" : "var(--crit)" }}>{intake.enabled ? "Portal habilitado." : "Ative o portal acima para o link funcionar."}</small>
            </div>
          );
        })() : null}
      </div>

      <div className="panel"><h2>Perfis de status por tipo</h2>
        <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 0 }}>Status permitidos por tipo (separados por virgula). "Resolvido" e "Reaberto" sao sempre garantidos.</p>
        {["incidente", "requisicao", "problema"].map((type) => (
          <div className="field" key={type}><label style={{ textTransform: "capitalize" }}>{type}</label>
            <input value={(profiles[type] || []).join(", ")} onChange={(e) => setProfile(type, e.target.value)} />
          </div>
        ))}
      </div>

      <div className="panel"><h2>Escalonamento</h2>
        <Toggle label="Escalonamento ativo" checked={esc.enabled !== false} onChange={(v) => updPath("escalationRules", { enabled: v })} />
        <Toggle label="Escalar chamados sem responsavel" checked={esc.unassignedEnabled !== false} onChange={(v) => updPath("escalationRules", { unassignedEnabled: v })} />
        <Toggle label="Escalar chamados em atraso (SLA)" checked={esc.overdueEnabled !== false} onChange={(v) => updPath("escalationRules", { overdueEnabled: v })} />
        <div className="form-row">
          <div className="field"><label>Minutos sem responsavel</label><input value={esc.unassignedMinutes ?? 60} onChange={(e) => updPath("escalationRules", { unassignedMinutes: Number(e.target.value.replace(/[^0-9]/g, "")) || 0 })} /></div>
          <div className="field"><label>Nivel maximo de escalonamento</label><input value={esc.maxEscalationLevel ?? 3} onChange={(e) => updPath("escalationRules", { maxEscalationLevel: Number(e.target.value.replace(/[^0-9]/g, "")) || 1 })} /></div>
        </div>
      </div>

      <div className="panel"><h2>Motivos de status</h2>
        <div className="field"><label>Status que exigem motivo de pausa</label><input value={(reasons.pauseStatuses || []).join(", ")} onChange={(e) => setReason("pauseStatuses", e.target.value)} /></div>
        <div className="field"><label>Status que exigem motivo de espera</label><input value={(reasons.waitingStatuses || []).join(", ")} onChange={(e) => setReason("waitingStatuses", e.target.value)} /></div>
      </div>

      <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
        <h2 style={{ padding: "18px 20px 0" }}>Setores no atendimento</h2>
        <table className="data-table">
          <thead><tr><th>Setor</th><th>Ativo</th><th>Aceita chamados</th><th>No portal</th><th>Responsaveis</th></tr></thead>
          <tbody>
            {(departments || []).map((d) => {
              const cfg = deptCfg[d.id] || {};
              return (
                <tr key={d.id}>
                  <td>{d.name}</td>
                  <td><input type="checkbox" checked={cfg.active !== false} onChange={(e) => setDept(d.id, { active: e.target.checked })} /></td>
                  <td><input type="checkbox" checked={!!cfg.acceptsTickets} onChange={(e) => setDept(d.id, { acceptsTickets: e.target.checked })} /></td>
                  <td><input type="checkbox" checked={!!cfg.showInRequestPortal} onChange={(e) => setDept(d.id, { showInRequestPortal: e.target.checked })} /></td>
                  <td style={{ minWidth: 240 }}>
                    <div className="resp-list">
                      {(users || []).map((u) => {
                        const checked = (cfg.responsibleUserIds || []).includes(u.id);
                        return (
                          <label key={u.id} className="resp-item">
                            <input type="checkbox" checked={checked} onChange={(e) => {
                              const set = new Set(cfg.responsibleUserIds || []);
                              if (e.target.checked) set.add(u.id); else set.delete(u.id);
                              setDept(d.id, { responsibleUserIds: [...set] });
                            }} /> {u.name}
                          </label>
                        );
                      })}
                    </div>
                    <div className="resp-count">{(cfg.responsibleUserIds || []).length} responsavel(is)</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------- Inventario (consolidado de ativos) ---------- */
export function InventoryView({ assets }) {
  const [sel, setSel] = useState(null);
  const groups = useMemo(() => {
    const map = new Map();
    (Array.isArray(assets) ? assets : []).forEach((a) => {
      const key = `${a.type || "—"}||${a.manufacturer || "—"}||${a.model || "—"}`;
      const g = map.get(key) || { key, type: a.type || "—", manufacturer: a.manufacturer || "—", model: a.model || "—", qty: 0, serials: [] };
      g.qty += 1;
      const s = a.serial || a.assetTag; if (s) g.serials.push(s);
      map.set(key, g);
    });
    return [...map.values()].sort((x, y) => y.qty - x.qty);
  }, [assets]);
  const total = (assets || []).length;
  return (
    <div>
      <div className="kpi-grid">
        <div className="kpi"><div className="label">Ativos cadastrados</div><div className="value">{total}</div></div>
        <div className="kpi"><div className="label">Itens de catalogo</div><div className="value">{groups.length}</div></div>
      </div>
      <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
        <table className="data-table">
          <thead><tr><th>Tipo</th><th>Fabricante</th><th>Modelo</th><th>Quantidade</th></tr></thead>
          <tbody>
            {groups.length === 0 ? <tr><td colSpan={4}><div className="empty">Nenhum ativo cadastrado.</div></td></tr> : groups.map((g) => (
              <tr key={g.key} onClick={() => setSel(g)}>
                <td>{g.type}</td><td>{g.manufacturer}</td><td>{g.model}</td><td><strong>{g.qty}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sel && (
        <div className="drawer-overlay" onClick={() => setSel(null)}>
          <div className="drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-head"><h3>{sel.type} · {sel.manufacturer} · {sel.model}</h3><button className="btn btn-ghost" onClick={() => setSel(null)}>Fechar</button></div>
            <p style={{ color: "var(--muted)" }}>{sel.qty} unidade(s). Numeros de serie / patrimonio:</p>
            <div className="followup-list">
              {sel.serials.length ? sel.serials.map((s, i) => <div className="followup" key={i}><div className="followup-msg">{s}</div></div>) : <p style={{ color: "var(--muted)" }}>Sem numero de serie registrado.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Config de colecoes (menus) ---------- */
const STATUS_ATIVO = ["Ativo", "Inativo"];
const KNOWLEDGE_CATEGORIES = ["Procedimento", "Acesso", "Aplicacoes", "Infraestrutura", "Rede", "Seguranca"];
const ASSET_TYPES = ["Notebook", "Desktop", "Celular", "Monitor", "Impressora", "Servidor", "Rede", "Outros"];
export const COLLECTIONS = {
  assets: { label: "Ativos", editable: true,
    columns: [
      { key: "assetTag", label: "Tag", render: (i) => i.assetTag || i.serial || i.id },
      { key: "name", label: "Nome" }, { key: "type", label: "Tipo" }, { key: "manufacturer", label: "Fabricante" },
      { key: "owner", label: "Responsavel" }, { key: "location", label: "Local" },
      { key: "status", label: "Status", render: (i) => <span className={`badge ${i.status === "Ativo" ? "s-resolvido" : "s-espera"}`}>{i.status || "—"}</span> },
    ],
    fields: [
      { key: "name", label: "Nome", required: true }, { key: "assetTag", label: "Patrimonio / Tag" },
      { key: "type", label: "Tipo", type: "select", options: ASSET_TYPES }, { key: "manufacturer", label: "Fabricante" },
      { key: "model", label: "Modelo" }, { key: "serial", label: "Numero de serie" },
      { key: "ram", label: "Memoria RAM" }, { key: "storage", label: "Armazenamento" }, { key: "processor", label: "Processador" },
      { key: "imei", label: "IMEI (celular)" }, { key: "phoneLine", label: "Linha telefonica (celular)" },
      { key: "technicalSpec", label: "Especificacao tecnica", type: "textarea" },
      { key: "owner", label: "Responsavel" }, { key: "location", label: "Local" },
      { key: "criticality", label: "Criticidade", type: "select", options: ["Baixa", "Media", "Alta", "Critica"] },
      { key: "status", label: "Status", type: "select", options: STATUS_ATIVO },
    ] },
  brands: { label: "Marcas", editable: true,
    columns: [{ key: "name", label: "Marca" }, { key: "assetType", label: "Tipo de ativo" }, { key: "status", label: "Status" }],
    fields: [{ key: "name", label: "Marca" }, { key: "assetType", label: "Tipo de ativo" }, { key: "status", label: "Status", type: "select", options: STATUS_ATIVO }] },
  models: { label: "Modelos", editable: true,
    columns: [{ key: "name", label: "Modelo" }, { key: "brandName", label: "Marca" }, { key: "assetType", label: "Tipo" }, { key: "status", label: "Status" }],
    fields: [{ key: "name", label: "Modelo" }, { key: "brandName", label: "Marca" }, { key: "assetType", label: "Tipo de ativo" }, { key: "status", label: "Status", type: "select", options: STATUS_ATIVO }] },
  projects: { label: "Projetos", editable: true,
    columns: [
      { key: "name", label: "Projeto" }, { key: "manager", label: "Gerente" }, { key: "sponsor", label: "Patrocinador" },
      { key: "progress", label: "Progresso", render: (i) => `${i.progress ?? 0}%` }, { key: "dueDate", label: "Prazo" },
      { key: "status", label: "Status", render: (i) => <span className={`badge ${norm(i.status) === "concluido" ? "s-resolvido" : "s-andamento"}`}>{i.status || "—"}</span> },
    ],
    fields: [
      { key: "name", label: "Projeto" }, { key: "manager", label: "Gerente" }, { key: "sponsor", label: "Patrocinador" },
      { key: "status", label: "Status", type: "select", options: ["Planejado", "Em andamento", "Em risco", "Concluido", "Pausado"] },
      { key: "progress", label: "Progresso (%)", type: "number" }, { key: "dueDate", label: "Prazo (AAAA-MM-DD)" }, { key: "summary", label: "Resumo", type: "textarea" },
    ] },
  knowledgeArticles: { label: "Base de Conhecimento", editable: true,
    columns: [{ key: "title", label: "Titulo" }, { key: "category", label: "Categoria" }, { key: "owner", label: "Autor" }, { key: "lastUpdateLabel", label: "Atualizado" }, { key: "status", label: "Status" }],
    fields: [
      { key: "title", label: "Titulo", required: true },
      { key: "category", label: "Categoria", type: "select", options: KNOWLEDGE_CATEGORIES },
      { key: "owner", label: "Autor" }, { key: "keywords", label: "Palavras-chave (separadas por virgula)" },
      { key: "status", label: "Status", type: "select", options: STATUS_ATIVO },
      { key: "problemDescription", label: "Descricao do problema", type: "textarea" }, { key: "solutionApplied", label: "Solucao aplicada", type: "textarea" },
    ] },
  users: { label: "Usuarios", editable: true, writeVia: "v1", domain: "users",
    columns: [
      { key: "name", label: "Nome" }, { key: "email", label: "E-mail" }, { key: "role", label: "Perfil" }, { key: "department", label: "Setor" },
      { key: "status", label: "Status", render: (i) => <span className={`badge ${norm(i.status) === "ativo" ? "s-resolvido" : "s-espera"}`}>{i.status || "—"}</span> },
    ],
    fields: [
      { key: "name", label: "Nome", required: true }, { key: "email", label: "E-mail", required: true },
      { key: "permissionProfileId", label: "Perfil de permissao", type: "select", optionsFrom: "profiles" },
      { key: "departmentId", label: "Setor", type: "select", optionsFrom: "departments" },
      { key: "team", label: "Equipe", type: "select", optionsFrom: "teams" },
      { key: "status", label: "Status", type: "select", options: ["Ativo", "Inativo"] },
      { key: "password", label: "Senha", type: "password" },
      { key: "mustChangePassword", label: "Exigir troca de senha no proximo acesso", type: "select", options: ["Sim", "Nao"] },
    ] },
  teams: { label: "Equipes", columns: [{ key: "name", label: "Equipe" }, { key: "department", label: "Setor" }, { key: "status", label: "Status" }] },
  permissionProfiles: { label: "Perfis de Permissao", editable: true, writeVia: "profiles", domain: "permissionProfiles",
    columns: [
      { key: "name", label: "Perfil" }, { key: "description", label: "Descricao" },
      { key: "permissions", label: "Permissoes", render: (i) => (i.permissions === "ALL" ? "Acesso total" : `${(i.permissions || []).length} permissao(oes)`) },
      { key: "status", label: "Status" },
    ],
    fields: [
      { key: "name", label: "Nome do perfil", required: true }, { key: "description", label: "Descricao", type: "textarea" },
      { key: "status", label: "Status", type: "select", options: ["Ativo", "Inativo"] },
      { key: "permissions", label: "Permissoes", type: "multiselect", optionsFrom: "permissions" },
    ] },
  departments: { label: "Departamentos", editable: true, writeVia: "v1", domain: "departments",
    columns: [{ key: "code", label: "Codigo" }, { key: "name", label: "Nome" }, { key: "status", label: "Status" }],
    fields: [{ key: "code", label: "Codigo" }, { key: "name", label: "Nome", required: true }, { key: "color", label: "Cor (hex)" }, { key: "status", label: "Status", type: "select", options: ["Ativo", "Inativo"] }] },
  locations: { label: "Locais", editable: true, writeVia: "v1", domain: "locations",
    columns: [{ key: "code", label: "Codigo" }, { key: "name", label: "Nome" }, { key: "status", label: "Status" }],
    fields: [{ key: "code", label: "Codigo" }, { key: "name", label: "Nome", required: true }, { key: "departmentId", label: "Setor", type: "select", optionsFrom: "departments" }, { key: "status", label: "Status", type: "select", options: ["Ativo", "Inativo"] }] },
  emailLayouts: { label: "Layouts de E-mail", editable: true,
    columns: [{ key: "name", label: "Nome" }, { key: "subject", label: "Assunto" }, { key: "status", label: "Status" }],
    fields: [{ key: "name", label: "Nome", required: true }, { key: "subject", label: "Assunto" }, { key: "body", label: "Corpo (HTML/texto)", type: "textarea" }, { key: "status", label: "Status", type: "select", options: ["Ativo", "Inativo"] }] },
  apiConfigs: { label: "Config de API", editable: true,
    columns: [{ key: "name", label: "Nome" }, { key: "baseUrl", label: "URL base" }, { key: "method", label: "Metodo" }, { key: "authType", label: "Auth" }, { key: "status", label: "Status" }],
    fields: [
      { key: "name", label: "Nome", required: true }, { key: "baseUrl", label: "URL base" }, { key: "resource", label: "Recurso" },
      { key: "method", label: "Metodo", type: "select", options: ["GET", "POST", "PUT", "DELETE"] },
      { key: "authType", label: "Autenticacao", type: "select", options: ["none", "bearer", "basic", "apikey"] },
      { key: "timeout", label: "Timeout (ms)", type: "number" }, { key: "status", label: "Status", type: "select", options: ["Ativo", "Inativo"] },
    ] },
  notificationRules: { label: "Notificacoes", editable: true,
    columns: [{ key: "name", label: "Regra" }, { key: "event", label: "Evento" }, { key: "active", label: "Ativa", render: (i) => (i.active ? "Sim" : "Nao") }],
    fields: [{ key: "name", label: "Nome da regra" }, { key: "event", label: "Evento" }, { key: "active", label: "Ativa (Sim/Nao)", type: "select", options: ["Sim", "Nao"] }] },
};
