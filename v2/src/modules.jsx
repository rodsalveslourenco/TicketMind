import { useMemo, useState } from "react";

export function norm(value) {
  return String(value || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}
const OPEN_STATUSES = ["aberto", "em andamento", "em espera", "pausado", "aguardando usuario", "aguardando aprovacao", "reaberto"];
export function isOpen(status) { return OPEN_STATUSES.includes(norm(status)); }

function val(item, key) {
  const v = item?.[key];
  if (v === null || v === undefined || v === "") return "—";
  if (Array.isArray(v)) return `${v.length} item(ns)`;
  if (typeof v === "object") return "—";
  return String(v);
}

/* ---------- Lista generica com busca e detalhe ---------- */
export function CollectionView({ title, subtitle, items, columns }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const list = Array.isArray(items) ? items : [];
  const filtered = useMemo(() => {
    const q = norm(search);
    if (!q) return list;
    return list.filter((item) => norm(JSON.stringify(item)).includes(q));
  }, [list, search]);

  return (
    <div>
      <div className="toolbar">
        <input className="search" placeholder={`Buscar em ${title.toLowerCase()}...`} value={search} onChange={(e) => setSearch(e.target.value)} />
        <span style={{ color: "var(--muted)", fontSize: 13 }}>{filtered.length} registro(s)</span>
      </div>
      {filtered.length === 0 ? (
        <div className="panel"><div className="empty">Nenhum registro encontrado.</div></div>
      ) : (
        <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
          <table className="data-table">
            <thead>
              <tr>{columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr>
            </thead>
            <tbody>
              {filtered.map((item, i) => (
                <tr key={item.id || i} onClick={() => setSelected(item)}>
                  {columns.map((c) => <td key={c.key}>{c.render ? c.render(item) : val(item, c.key)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selected && (
        <div className="drawer-overlay" onClick={() => setSelected(null)}>
          <div className="drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-head">
              <h3>{selected.name || selected.title || selected.id || "Detalhe"}</h3>
              <button className="btn btn-ghost" onClick={() => setSelected(null)}>Fechar</button>
            </div>
            <div className="kv" style={{ gridTemplateColumns: "180px 1fr" }}>
              {Object.entries(selected).filter(([, v]) => v !== null && v !== undefined && typeof v !== "object").map(([k, v]) => (
                <><div className="k" key={`k-${k}`}>{k}</div><div key={`v-${k}`}>{String(v) || "—"}</div></>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Relatorios otimizados ---------- */
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
    // resolucao media (h)
    const durations = resolved
      .map((t) => (t.resolvedAt && t.openedAt ? (new Date(t.resolvedAt) - new Date(t.openedAt)) / 3600000 : null))
      .filter((d) => d !== null && Number.isFinite(d) && d >= 0);
    const avgH = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
    return { list, byStatus, byPriority, byDept, byAssignee, resolved: resolved.length, breached: breached.length, slaOk, avgH };
  }, [tickets]);

  const maxStatus = Math.max(1, ...data.byStatus.map((x) => x[1]));
  const maxPrio = Math.max(1, ...data.byPriority.map((x) => x[1]));
  const maxDept = Math.max(1, ...data.byDept.map((x) => x[1]));
  const maxAss = Math.max(1, ...data.byAssignee.map((x) => x[1]));
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
        <div className="panel"><h2>Por status</h2>{data.byStatus.map(([k, v]) => <BarRow key={k} label={k} value={v} max={maxStatus} />)}</div>
        <div className="panel"><h2>Por prioridade</h2>{data.byPriority.map(([k, v]) => <BarRow key={k} label={k} value={v} max={maxPrio} color={prioColor(k)} />)}</div>
        <div className="panel"><h2>Por setor / fila</h2>{data.byDept.map(([k, v]) => <BarRow key={k} label={k} value={v} max={maxDept} color="var(--wega-teal)" />)}</div>
        <div className="panel"><h2>Por responsavel</h2>{data.byAssignee.length ? data.byAssignee.map(([k, v]) => <BarRow key={k} label={k} value={v} max={maxAss} color="var(--wega-navy)" />) : <div className="empty">Sem responsaveis atribuidos.</div>}</div>
      </div>
    </div>
  );
}

/* ---------- Configuracao de colecoes (menus tipo v1) ---------- */
export const COLLECTIONS = {
  assets: { label: "Ativos", columns: [
    { key: "assetTag", label: "Tag", render: (i) => i.assetTag || i.serial || i.id },
    { key: "name", label: "Nome" }, { key: "type", label: "Tipo" },
    { key: "manufacturer", label: "Fabricante" }, { key: "model", label: "Modelo" },
    { key: "owner", label: "Responsavel" }, { key: "location", label: "Local" },
    { key: "status", label: "Status", render: (i) => <span className={`badge ${i.status === "Ativo" ? "s-resolvido" : "s-espera"}`}>{i.status || "—"}</span> },
  ] },
  brands: { label: "Marcas", columns: [
    { key: "name", label: "Marca" }, { key: "assetType", label: "Tipo de ativo" }, { key: "status", label: "Status" },
  ] },
  models: { label: "Modelos", columns: [
    { key: "name", label: "Modelo" }, { key: "brandName", label: "Marca" }, { key: "assetType", label: "Tipo" }, { key: "status", label: "Status" },
  ] },
  projects: { label: "Projetos", columns: [
    { key: "name", label: "Projeto" }, { key: "manager", label: "Gerente" }, { key: "sponsor", label: "Patrocinador" },
    { key: "progress", label: "Progresso", render: (i) => `${i.progress ?? 0}%` },
    { key: "dueDate", label: "Prazo" }, { key: "status", label: "Status", render: (i) => <span className={`badge ${norm(i.status) === "concluido" ? "s-resolvido" : "s-andamento"}`}>{i.status || "—"}</span> },
  ] },
  knowledgeArticles: { label: "Base de Conhecimento", columns: [
    { key: "title", label: "Titulo" }, { key: "category", label: "Categoria" }, { key: "owner", label: "Autor" },
    { key: "lastUpdateLabel", label: "Atualizado" }, { key: "status", label: "Status" },
  ] },
  users: { label: "Usuarios", columns: [
    { key: "name", label: "Nome" }, { key: "email", label: "E-mail" }, { key: "role", label: "Perfil" },
    { key: "department", label: "Setor" }, { key: "status", label: "Status", render: (i) => <span className={`badge ${norm(i.status) === "ativo" ? "s-resolvido" : "s-espera"}`}>{i.status || "—"}</span> },
  ] },
  teams: { label: "Equipes", columns: [
    { key: "name", label: "Equipe" }, { key: "department", label: "Setor" }, { key: "status", label: "Status" },
  ] },
  permissionProfiles: { label: "Perfis de Permissao", columns: [
    { key: "name", label: "Perfil" }, { key: "description", label: "Descricao" }, { key: "status", label: "Status" },
  ] },
  departments: { label: "Departamentos", columns: [
    { key: "code", label: "Codigo" }, { key: "name", label: "Nome" }, { key: "status", label: "Status" },
  ] },
  locations: { label: "Locais", columns: [
    { key: "code", label: "Codigo" }, { key: "name", label: "Nome" }, { key: "status", label: "Status" },
  ] },
  notificationRules: { label: "Notificacoes", columns: [
    { key: "name", label: "Regra" }, { key: "event", label: "Evento" }, { key: "active", label: "Ativa", render: (i) => (i.active ? "Sim" : "Nao") },
  ] },
};
