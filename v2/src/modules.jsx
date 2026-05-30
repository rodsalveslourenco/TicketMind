import { useEffect, useMemo, useState } from "react";

export function norm(value) { return String(value || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim(); }
const OPEN_STATUSES = ["aberto", "em andamento", "em espera", "pausado", "aguardando usuario", "aguardando aprovacao", "reaberto"];
export function isOpen(status) { return OPEN_STATUSES.includes(norm(status)); }
function val(item, key) {
  const v = item?.[key];
  if (v === null || v === undefined || v === "") return "—";
  if (Array.isArray(v)) return `${v.length} item(ns)`;
  if (typeof v === "object") return "—";
  return String(v);
}

/* ---------- Formulario generico ---------- */
function RecordForm({ item, fields, onCancel, onSubmit, onDelete, saving, title }) {
  const [form, setForm] = useState(() => {
    const base = {};
    fields.forEach((f) => { base[f.key] = item?.[f.key] ?? (f.type === "number" ? "" : ""); });
    return base;
  });
  const set = (k, type) => (e) => {
    const v = type === "number" ? e.target.value.replace(/[^0-9.]/g, "") : e.target.value;
    setForm((cur) => ({ ...cur, [k]: v }));
  };
  return (
    <div className="drawer-overlay" onClick={onCancel}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head"><h3>{title}</h3><button className="btn btn-ghost" onClick={onCancel}>Fechar</button></div>
        {fields.map((f) => (
          <div className="field" key={f.key}>
            <label>{f.label}</label>
            {f.type === "textarea" ? (
              <textarea className="solution" value={form[f.key] || ""} onChange={set(f.key)} />
            ) : f.type === "select" ? (
              <select value={form[f.key] || ""} onChange={set(f.key)}>
                <option value="">— Selecionar —</option>
                {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input value={form[f.key] || ""} onChange={set(f.key, f.type)} />
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
  const setDept = (id, patch) => { setSc((cur) => ({ ...cur, departments: { ...(cur.departments || {}), [id]: { ...(cur.departments?.[id] || {}), ...patch } } })); setDirty(true); };

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
                  <td style={{ minWidth: 200 }}>
                    <select multiple value={cfg.responsibleUserIds || []} onChange={(e) => setDept(d.id, { responsibleUserIds: Array.from(e.target.selectedOptions).map((o) => o.value) })} style={{ width: "100%", minHeight: 64 }}>
                      {(users || []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
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
  users: { label: "Usuarios", columns: [
    { key: "name", label: "Nome" }, { key: "email", label: "E-mail" }, { key: "role", label: "Perfil" }, { key: "department", label: "Setor" },
    { key: "status", label: "Status", render: (i) => <span className={`badge ${norm(i.status) === "ativo" ? "s-resolvido" : "s-espera"}`}>{i.status || "—"}</span> },
  ] },
  teams: { label: "Equipes", columns: [{ key: "name", label: "Equipe" }, { key: "department", label: "Setor" }, { key: "status", label: "Status" }] },
  permissionProfiles: { label: "Perfis de Permissao", columns: [{ key: "name", label: "Perfil" }, { key: "description", label: "Descricao" }, { key: "status", label: "Status" }] },
  departments: { label: "Departamentos", columns: [{ key: "code", label: "Codigo" }, { key: "name", label: "Nome" }, { key: "status", label: "Status" }] },
  locations: { label: "Locais", columns: [{ key: "code", label: "Codigo" }, { key: "name", label: "Nome" }, { key: "status", label: "Status" }] },
  notificationRules: { label: "Notificacoes", editable: true,
    columns: [{ key: "name", label: "Regra" }, { key: "event", label: "Evento" }, { key: "active", label: "Ativa", render: (i) => (i.active ? "Sim" : "Nao") }],
    fields: [{ key: "name", label: "Nome da regra" }, { key: "event", label: "Evento" }, { key: "active", label: "Ativa (Sim/Nao)", type: "select", options: ["Sim", "Nao"] }] },
};
