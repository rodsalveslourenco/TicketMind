import { useEffect, useMemo, useState } from "react";

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
        {editable && <button className="btn btn-primary" style={{ width: "auto", marginLeft: "auto" }} onClick={() => setEditing({ mode: "new", item: {} })}>+ Novo</button>}
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
function BarRow({ label, value, max, color }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="bar-row">
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
export function Reports({ tickets }) {
  const data = useMemo(() => {
    const list = Array.isArray(tickets) ? tickets : [];
    const byStatus = countBy(list, (t) => t.status || "Aberto");
    const byPriority = countBy(list, (t) => t.priority || "Media");
    const byDept = countBy(list, (t) => t.department || t.queue || "—").slice(0, 8);
    const byAssignee = countBy(list.filter((t) => t.assignee), (t) => t.assignee).slice(0, 8);
    const resolved = list.filter((t) => norm(t.status) === "resolvido");
    const breached = list.filter((t) => t.slaBreachedAt);
    const slaOk = list.length ? Math.round(((list.length - breached.length) / list.length) * 100) : 100;
    const durations = resolved.map((t) => (t.resolvedAt && t.openedAt ? (new Date(t.resolvedAt) - new Date(t.openedAt)) / 3600000 : null)).filter((d) => d !== null && Number.isFinite(d) && d >= 0);
    const avgH = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
    return { list, byStatus, byPriority, byDept, byAssignee, resolved: resolved.length, breached: breached.length, slaOk, avgH };
  }, [tickets]);
  const mx = (arr) => Math.max(1, ...arr.map((x) => x[1]));
  const prioColor = (p) => ({ critica: "var(--crit)", alta: "var(--warn)", media: "var(--info)", baixa: "var(--muted)" }[norm(p)] || "var(--info)");
  return (
    <div>
      <div className="kpi-grid">
        <div className="kpi"><div className="label">Total</div><div className="value">{data.list.length}</div></div>
        <div className="kpi"><div className="label">Resolvidos</div><div className="value ok">{data.resolved}</div></div>
        <div className="kpi"><div className="label">SLA no prazo</div><div className={`value ${data.slaOk >= 90 ? "ok" : data.slaOk >= 70 ? "warn" : "crit"}`}>{data.slaOk}%</div></div>
        <div className="kpi"><div className="label">SLA violado</div><div className="value crit">{data.breached}</div></div>
        <div className="kpi"><div className="label">Tempo medio resolucao</div><div className="value">{data.avgH}h</div></div>
      </div>
      <div className="report-grid">
        <div className="panel"><h2>Por status</h2>{data.byStatus.map(([k, v]) => <BarRow key={k} label={k} value={v} max={mx(data.byStatus)} />)}</div>
        <div className="panel"><h2>Por prioridade</h2>{data.byPriority.map(([k, v]) => <BarRow key={k} label={k} value={v} max={mx(data.byPriority)} color={prioColor(k)} />)}</div>
        <div className="panel"><h2>Por setor / fila</h2>{data.byDept.map(([k, v]) => <BarRow key={k} label={k} value={v} max={mx(data.byDept)} color="var(--wega-teal)" />)}</div>
        <div className="panel"><h2>Por responsavel</h2>{data.byAssignee.length ? data.byAssignee.map(([k, v]) => <BarRow key={k} label={k} value={v} max={mx(data.byAssignee)} color="var(--wega-navy)" />) : <div className="empty">Sem responsaveis atribuidos.</div>}</div>
      </div>
    </div>
  );
}

/* ---------- Dashboard rico ---------- */
function pastDue(t) {
  if (norm(t.status) === "resolvido") return false;
  if (t.slaBreachedAt) return true;
  return Boolean(t.slaDeadlineAt && new Date(t.slaDeadlineAt).getTime() < Date.now());
}
export function Dashboard({ tickets, onGo }) {
  const d = useMemo(() => {
    const list = Array.isArray(tickets) ? tickets : [];
    const open = list.filter((t) => isOpen(t.status));
    const resolved = list.filter((t) => norm(t.status) === "resolvido");
    const breached = list.filter((t) => t.slaBreachedAt);
    const slaRisco = open.filter(pastDue);
    const slaOk = list.length ? Math.round(((list.length - breached.length) / list.length) * 100) : 100;
    const byStatus = countBy(list, (t) => t.status || "Aberto");
    const byPriority = countBy(list, (t) => t.priority || "Media");
    const byDept = countBy(list, (t) => t.department || t.queue || "—").slice(0, 8);
    // volume ultimos 7 dias
    const days = [];
    for (let i = 6; i >= 0; i -= 1) { const dt = new Date(); dt.setDate(dt.getDate() - i); days.push(dt.toISOString().slice(0, 10)); }
    const vol = days.map((day) => [day.slice(8, 10) + "/" + day.slice(5, 7), list.filter((t) => String(t.openedAt || "").slice(0, 10) === day).length]);
    // performance por tecnico
    const techMap = new Map();
    open.forEach((t) => {
      const a = t.assignee || "Sem responsavel";
      const e = techMap.get(a) || { abertos: 0, criticos: 0 };
      e.abertos += 1; if (norm(t.priority) === "critica") e.criticos += 1; techMap.set(a, e);
    });
    const tech = [...techMap.entries()].map(([name, v]) => ({ name, ...v })).sort((x, y) => y.abertos - x.abertos).slice(0, 10);
    // tarefas
    let tarefasTotal = 0, tarefasFeitas = 0;
    list.forEach((t) => (Array.isArray(t.checklistItems) ? t.checklistItems : []).forEach((c) => { tarefasTotal += 1; if (c.done) tarefasFeitas += 1; }));
    return {
      total: list.length, abertos: open.length,
      andamento: list.filter((t) => norm(t.status) === "em andamento").length,
      aguardando: open.filter((t) => norm(t.status).startsWith("aguardando") || norm(t.status) === "em espera" || norm(t.status) === "pausado").length,
      criticos: open.filter((t) => norm(t.priority) === "critica").length,
      resolvidos: resolved.length, slaRisco: slaRisco.length, slaOk,
      byStatus, byPriority, byDept, vol, tech, tarefasTotal, tarefasFeitas,
      recentes: [...list].sort((a, b) => String(b.updatedAtIso || b.openedAt || "").localeCompare(String(a.updatedAtIso || a.openedAt || ""))).slice(0, 6),
    };
  }, [tickets]);
  const mx = (arr) => Math.max(1, ...arr.map((x) => x[1]));
  const prioColor = (p) => ({ critica: "var(--crit)", alta: "var(--warn)", media: "var(--info)", baixa: "var(--muted)" }[norm(p)] || "var(--info)");
  return (
    <div>
      <div className="kpi-grid">
        <div className="kpi" onClick={() => onGo && onGo("tickets")} style={{ cursor: "pointer" }}><div className="label">Total</div><div className="value">{d.total}</div></div>
        <div className="kpi"><div className="label">Em aberto</div><div className="value warn">{d.abertos}</div></div>
        <div className="kpi"><div className="label">Em andamento</div><div className="value">{d.andamento}</div></div>
        <div className="kpi"><div className="label">Aguardando</div><div className="value">{d.aguardando}</div></div>
        <div className="kpi"><div className="label">Criticos abertos</div><div className="value crit">{d.criticos}</div></div>
        <div className="kpi"><div className="label">SLA sob risco</div><div className="value crit">{d.slaRisco}</div></div>
        <div className="kpi"><div className="label">SLA cumprido</div><div className={`value ${d.slaOk >= 90 ? "ok" : d.slaOk >= 70 ? "warn" : "crit"}`}>{d.slaOk}%</div></div>
        <div className="kpi"><div className="label">Resolvidos</div><div className="value ok">{d.resolvidos}</div></div>
      </div>
      <div className="report-grid">
        <div className="panel"><h2>Distribuicao por status</h2>{d.byStatus.map(([k, v]) => <BarRow key={k} label={k} value={v} max={mx(d.byStatus)} />)}</div>
        <div className="panel"><h2>Distribuicao por prioridade</h2>{d.byPriority.map(([k, v]) => <BarRow key={k} label={k} value={v} max={mx(d.byPriority)} color={prioColor(k)} />)}</div>
        <div className="panel"><h2>Chamados por departamento</h2>{d.byDept.map(([k, v]) => <BarRow key={k} label={k} value={v} max={mx(d.byDept)} color="var(--wega-teal)" />)}</div>
        <div className="panel"><h2>Volume (ultimos 7 dias)</h2>{d.vol.map(([k, v]) => <BarRow key={k} label={k} value={v} max={mx(d.vol)} color="var(--wega-navy)" />)}</div>
      </div>
      <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
        <h2 style={{ padding: "18px 20px 0" }}>Performance dos tecnicos (chamados em aberto)</h2>
        <table className="data-table">
          <thead><tr><th>Tecnico</th><th>Em aberto</th><th>Criticos</th></tr></thead>
          <tbody>
            {d.tech.length === 0 ? <tr><td colSpan={3}><div className="empty">Sem chamados atribuidos.</div></td></tr> : d.tech.map((t) => (
              <tr key={t.name}><td>{t.name}</td><td><strong>{t.abertos}</strong></td><td style={{ color: t.criticos ? "var(--crit)" : "inherit" }}>{t.criticos}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="report-grid">
        <div className="panel"><h2>Tarefas dos chamados</h2>
          <div className="kpi-grid" style={{ marginBottom: 0 }}>
            <div className="kpi"><div className="label">Total de tarefas</div><div className="value">{d.tarefasTotal}</div></div>
            <div className="kpi"><div className="label">Concluidas</div><div className="value ok">{d.tarefasFeitas}</div></div>
            <div className="kpi"><div className="label">Pendentes</div><div className="value warn">{d.tarefasTotal - d.tarefasFeitas}</div></div>
          </div>
        </div>
        <div className="panel"><h2>Chamados recentes</h2>
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
          const link = `${typeof window !== "undefined" ? window.location.origin : ""}/v2/?portal=${encodeURIComponent(intake.accessToken)}`;
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

/* ---------- Config de colecoes (menus) ---------- */
const STATUS_ATIVO = ["Ativo", "Inativo"];
export const COLLECTIONS = {
  assets: { label: "Ativos", editable: true,
    columns: [
      { key: "assetTag", label: "Tag", render: (i) => i.assetTag || i.serial || i.id },
      { key: "name", label: "Nome" }, { key: "type", label: "Tipo" }, { key: "manufacturer", label: "Fabricante" },
      { key: "owner", label: "Responsavel" }, { key: "location", label: "Local" },
      { key: "status", label: "Status", render: (i) => <span className={`badge ${i.status === "Ativo" ? "s-resolvido" : "s-espera"}`}>{i.status || "—"}</span> },
    ],
    fields: [
      { key: "name", label: "Nome" }, { key: "assetTag", label: "Tag" }, { key: "type", label: "Tipo" },
      { key: "manufacturer", label: "Fabricante" }, { key: "model", label: "Modelo" }, { key: "serial", label: "Numero de serie" },
      { key: "owner", label: "Responsavel" }, { key: "location", label: "Local" }, { key: "criticality", label: "Criticidade" },
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
      { key: "status", label: "Status", type: "select", options: ["Planejado", "Em andamento", "Concluido", "Pausado"] },
      { key: "progress", label: "Progresso (%)", type: "number" }, { key: "dueDate", label: "Prazo (AAAA-MM-DD)" }, { key: "summary", label: "Resumo", type: "textarea" },
    ] },
  knowledgeArticles: { label: "Base de Conhecimento", editable: true,
    columns: [{ key: "title", label: "Titulo" }, { key: "category", label: "Categoria" }, { key: "owner", label: "Autor" }, { key: "lastUpdateLabel", label: "Atualizado" }, { key: "status", label: "Status" }],
    fields: [
      { key: "title", label: "Titulo" }, { key: "category", label: "Categoria" }, { key: "owner", label: "Autor" },
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
      { key: "status", label: "Status", type: "select", options: ["Ativo", "Inativo"] },
      { key: "password", label: "Senha", type: "password" },
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
