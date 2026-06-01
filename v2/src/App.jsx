import { useEffect, useMemo, useState } from "react";
import { api } from "./api.js";
import { Reports, CollectionView, COLLECTIONS, ServiceCenterView, Dashboard, Autocomplete, InventoryView } from "./modules.jsx";

const LOGO = `${import.meta.env.BASE_URL}logo-wega.png`;
const STATUS_OPTIONS = ["Aberto", "Em andamento", "Em espera", "Pausado", "Aguardando usuario", "Aguardando aprovacao", "Resolvido", "Reaberto"];
const OPEN_STATUSES = ["aberto", "em andamento", "em espera", "pausado", "aguardando usuario", "aguardando aprovacao", "reaberto"];

function norm(v) { return String(v || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim(); }
function isOpen(s) { return OPEN_STATUSES.includes(norm(s)); }
function statusClass(s) {
  const n = norm(s);
  if (n === "resolvido") return "s-resolvido";
  if (n === "em andamento") return "s-andamento";
  if (n === "reaberto") return "s-reaberto";
  if (n === "aberto") return "s-aberto";
  return "s-espera";
}
function priorityClass(p) {
  const n = norm(p);
  if (n === "critica") return "p-critica";
  if (n === "alta") return "p-alta";
  if (n === "baixa") return "p-baixa";
  return "p-media";
}
function hasPerm(user, keys) {
  if (!user) return false;
  if (norm(user.role) === "administrador da plataforma" || user.permissionProfileId === "profile-admin") return true;
  const perms = user.permissions || {};
  return keys.some((k) => perms[k]);
}

// Departamentos de DESTINO (para onde o chamado vai): ativos e habilitados a
// receber chamados na Central de Servicos. Se a Central estiver desativada,
// qualquer departamento ativo pode receber.
function requestableDepartments(departments, serviceCenter) {
  const cfgs = (serviceCenter || {}).departments || {};
  const active = (departments || []).filter((d) => norm(d.status) === "ativo");
  // Departamentos marcados para RECEBER chamados na Central de Servicos.
  const accepting = active.filter((d) => { const c = cfgs[d.id]; return c && c.active !== false && !!c.acceptsTickets; });
  // Fallback: se nenhum estiver configurado, usa todos os ativos (sistema nunca fica sem destino).
  return accepting.length ? accepting : active;
}
// Usuarios que atendem um departamento: pertencem a ele OU sao responsaveis na Central.
function attendantsForDepartment(users, serviceCenter, departmentId) {
  const list = users || [];
  const id = String(departmentId || "").trim();
  if (!id) return list;
  const respIds = (serviceCenter?.departments?.[id]?.responsibleUserIds) || [];
  const eligible = list.filter((u) => String(u.departmentId || "") === id || respIds.includes(u.id));
  return eligible.length ? eligible : list;
}

const MENU = [
  { group: "Operacao", items: [
    { key: "dashboard", label: "Dashboard", icon: "📊" },
    { key: "tickets", label: "Chamados", icon: "🎫" },
    { key: "reports", label: "Relatorios", icon: "📈" },
  ] },
  { group: "Ativos", items: [
    { key: "assets", label: "Ativos", icon: "💻" },
    { key: "inventory", label: "Inventario", icon: "📊" },
    { key: "brands", label: "Marcas", icon: "🏷️" },
    { key: "models", label: "Modelos", icon: "📦" },
  ] },
  { group: "Gestao", items: [
    { key: "projects", label: "Projetos", icon: "📁" },
    { key: "knowledgeArticles", label: "Base de Conhecimento", icon: "📚" },
  ] },
  { group: "Pessoas", items: [
    { key: "users", label: "Usuarios", icon: "👤", perm: ["users_view", "users_admin"] },
    { key: "teams", label: "Equipes", icon: "👥", perm: ["users_view", "users_admin"] },
    { key: "permissionProfiles", label: "Perfis de Permissao", icon: "🔐", perm: ["users_manage_permissions", "users_admin"] },
    { key: "technicians", label: "Tecnicos", icon: "🛠️" },
  ] },
  { group: "Estrutura", items: [
    { key: "departments", label: "Departamentos", icon: "🏢" },
    { key: "locations", label: "Locais", icon: "📍" },
  ] },
  { group: "Configuracoes", items: [
    { key: "serviceCenter", label: "Central de Servicos", icon: "⚙️", perm: ["service_center_manage", "service_center_departments_manage", "users_admin"] },
    { key: "notificationRules", label: "Notificacoes", icon: "🔔" },
    { key: "emailLayouts", label: "Layouts de E-mail", icon: "✉️", perm: ["email_layouts_view", "email_layouts_manage", "users_admin"] },
    { key: "apiConfigs", label: "Config de API", icon: "🔌", perm: ["api_rest_view", "api_rest_admin", "users_admin"] },
  ] },
  { group: "Sistema", items: [
    { key: "logs", label: "Logs do Sistema", icon: "🧾", perm: ["system_logs_view", "users_admin"] },
    { key: "profile", label: "Meu Perfil", icon: "👤" },
  ] },
];

function Brand({ light }) {
  return (
    <div className="brand">
      <img src={LOGO} alt="WEGA" className="brand-logo" onError={(e) => { e.target.style.display = "none"; }} />
      <div>
        <div className="brand-name" style={light ? { color: "#fff" } : undefined}>TicketMind 2</div>
        {!light && <div className="brand-sub" style={{ margin: 0 }}>WEGA Marine</div>}
      </div>
    </div>
  );
}

function Login({ onSuccess }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setError(""); setLoading(true);
    try { const r = await api.login(email.trim(), password); onSuccess(r?.user || null); }
    catch (err) { setError(err.message || "Falha ao entrar."); }
    finally { setLoading(false); }
  };
  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <Brand />
        <p className="brand-sub">Central de chamados — acesse com seu e-mail corporativo.</p>
        {error && <div className="error-banner">{error}</div>}
        <div className="field"><label>E-mail</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required /></div>
        <div className="field"><label>Senha</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
        <button className="btn btn-primary" type="submit" disabled={loading}>{loading ? <span className="spinner" /> : "Entrar"}</button>
      </form>
    </div>
  );
}

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString("pt-BR");
}

function TicketDrawer({ ticket, departments, requestableDepts, serviceCenter, users, assets, projects, knowledgeArticles, user, onClose, onSave, saving }) {
  const [status, setStatus] = useState(ticket.status || "Aberto");
  const [solution, setSolution] = useState(ticket.resolutionNotes || "");
  const [departmentId, setDepartmentId] = useState(ticket.departmentId || "");
  const [assignee, setAssignee] = useState(ticket.assignee || "");
  const [watcherIds, setWatcherIds] = useState(() => (Array.isArray(ticket.watcherDetails) ? ticket.watcherDetails.map((w) => w.id).filter(Boolean) : []));
  const [priority, setPriority] = useState(ticket.priority || "Media");
  const [category, setCategory] = useState(ticket.category || "");
  const [urgency, setUrgency] = useState(ticket.urgency || ticket.priority || "Media");
  const [impact, setImpact] = useState(ticket.impact || ticket.priority || "Media");
  const [dueDate, setDueDate] = useState(ticket.dueDate ? String(ticket.dueDate).slice(0, 10) : "");
  const [assetId, setAssetId] = useState(ticket.assetId || "");
  const [projectId, setProjectId] = useState(ticket.projectId || "");
  const [knowledgeIds, setKnowledgeIds] = useState(() => (Array.isArray(ticket.knowledgeArticleIds) ? ticket.knowledgeArticleIds : []));
  const [followText, setFollowText] = useState("");
  const [followVis, setFollowVis] = useState("public");
  const [checkText, setCheckText] = useState("");
  const [approverId, setApproverId] = useState(ticket.approval?.currentApproverId || ticket.approval?.approverId || "");
  const [approvalReason, setApprovalReason] = useState("");
  useEffect(() => {
    setStatus(ticket.status || "Aberto");
    setSolution(ticket.resolutionNotes || "");
    setDepartmentId(ticket.departmentId || "");
    setAssignee(ticket.assignee || "");
    setWatcherIds(Array.isArray(ticket.watcherDetails) ? ticket.watcherDetails.map((w) => w.id).filter(Boolean) : []);
    setPriority(ticket.priority || "Media");
    setCategory(ticket.category || "");
    setUrgency(ticket.urgency || ticket.priority || "Media");
    setImpact(ticket.impact || ticket.priority || "Media");
    setDueDate(ticket.dueDate ? String(ticket.dueDate).slice(0, 10) : "");
    setAssetId(ticket.assetId || "");
    setProjectId(ticket.projectId || "");
    setKnowledgeIds(Array.isArray(ticket.knowledgeArticleIds) ? ticket.knowledgeArticleIds : []);
    setFollowText("");
    setCheckText("");
    setApproverId(ticket.approval?.currentApproverId || ticket.approval?.approverId || "");
    setApprovalReason("");
  }, [ticket.id]);

  const deptList = departments || [];
  const userList = users || [];
  // Destino: somente departamentos que recebem chamados (Central de Servicos),
  // garantindo que o destino atual do chamado apareca mesmo se nao listado.
  const destOptions = (() => {
    const base = requestableDepts || deptList;
    if (departmentId && !base.some((d) => String(d.id) === String(departmentId))) {
      const cur = deptList.find((d) => String(d.id) === String(departmentId));
      if (cur) return [cur, ...base];
    }
    return base;
  })();
  // Responsavel: somente quem pertence ao departamento de destino (ou e
  // responsavel por ele na Central). Mantem o responsavel atual como opcao.
  const respIds = (serviceCenter?.departments?.[departmentId]?.responsibleUserIds) || [];
  let eligibleUsers = userList.filter((u) => String(u.departmentId || "") === String(departmentId) || respIds.includes(u.id));
  if (!departmentId || eligibleUsers.length === 0) eligibleUsers = userList;
  const assigneeNames = [...new Set(eligibleUsers.map((u) => u.name).filter(Boolean))];
  if (assignee && !assigneeNames.includes(assignee)) assigneeNames.unshift(assignee);
  const watcherDetails = userList.filter((u) => watcherIds.includes(u.id)).map((u) => ({ id: u.id, name: u.name, email: u.email }));
  const watchersLabel = watcherDetails.map((w) => w.name).join(", ");
  const withDept = (obj) => {
    const dept = deptList.find((d) => String(d.id) === String(departmentId));
    const asset = (assets || []).find((a) => String(a.id) === String(assetId));
    const project = (projects || []).find((pr) => String(pr.id) === String(projectId));
    const base = {
      ...obj, assignee, watchers: watchersLabel, watcherDetails,
      priority, category, urgency, impact, dueDate,
      assetId, assetName: asset ? (asset.assetTag || asset.name || "") : "",
      projectId, projectName: project?.name || "",
      knowledgeArticleIds: knowledgeIds,
    };
    return dept ? { ...base, departmentId: dept.id, department: dept.name, queue: obj.queue || dept.name } : base;
  };
  const checklist = Array.isArray(ticket.checklistItems) ? ticket.checklistItems : [];
  const addCheck = () => {
    if (!checkText.trim()) return;
    const item = { id: `ck-${Date.now().toString(36)}`, label: checkText.trim(), done: false };
    onSave(withDept({ ...ticket, checklistItems: [...checklist, item] }));
    setCheckText("");
  };
  const toggleCheck = (id) => onSave(withDept({ ...ticket, checklistItems: checklist.map((c) => (c.id === id ? { ...c, done: !c.done } : c)) }));
  const removeCheck = (id) => onSave(withDept({ ...ticket, checklistItems: checklist.filter((c) => c.id !== id) }));
  const approval = ticket.approval || {};
  const canDecideApproval = Boolean((user?.id && (user.id === approval.currentApproverId || user.id === approval.approverId)) || hasPerm(user, ["tickets_admin"]));
  const requestApproval = () => {
    const ap = userList.find((u) => u.id === approverId);
    const now = new Date().toISOString();
    onSave(withDept({
      ...ticket, status: "Aguardando aprovacao",
      approval: { required: true, status: "pending", approverId, approverName: ap?.name || "", currentApproverId: approverId, currentApproverName: ap?.name || "", requestedAt: now, requestedById: user?.id || "", requestedByName: user?.name || "", decisionReason: "", history: [{ action: "requested", actorName: user?.name || "Sistema", createdAt: now }, ...(Array.isArray(approval.history) ? approval.history : [])] },
    }));
  };
  const decideApproval = (action) => {
    const now = new Date().toISOString();
    const next = action === "approve" ? "approved" : "rejected";
    const nextStatus = action === "approve" ? "Em andamento" : "Aguardando usuario";
    const note = `Aprovacao ${next === "approved" ? "aprovada" : "rejeitada"}${approvalReason ? ": " + approvalReason : ""}`;
    onSave(withDept({
      ...ticket, status: nextStatus,
      approval: { ...approval, status: next, decisionReason: approvalReason, decidedById: user?.id || "", decidedByName: user?.name || "", decidedAt: now, history: [{ action: next, actorName: user?.name || "Sistema", reason: approvalReason, createdAt: now }, ...(Array.isArray(approval.history) ? approval.history : [])] },
      followUps: [{ id: `fu-${Date.now().toString(36)}`, message: note, visibility: "private", authorId: user?.id || "", authorName: user?.name || "Sistema", createdAt: now }, ...followUps],
    }));
    setApprovalReason("");
  };
  const currentDeptName = deptList.find((d) => String(d.id) === String(ticket.departmentId))?.name || ticket.department || "—";
  const followUps = Array.isArray(ticket.followUps) ? ticket.followUps : [];
  const attachments = Array.isArray(ticket.attachments) ? ticket.attachments : [];

  const addFollowUp = () => {
    if (!followText.trim()) return;
    const entry = {
      id: `fu-${Date.now().toString(36)}`,
      message: followText.trim(),
      visibility: followVis,
      authorId: user?.id || "",
      authorName: user?.name || "Sistema",
      createdAt: new Date().toISOString(),
    };
    onSave(withDept({ ...ticket, followUps: [entry, ...followUps] }));
    setFollowText("");
  };
  const addAttachment = (file) => {
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) { window.alert("Anexo muito grande (max 4MB)."); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const att = { id: `att-${Date.now().toString(36)}`, name: file.name, type: file.type, size: file.size, dataUrl: reader.result, addedAt: new Date().toISOString(), addedBy: user?.name || "" };
      onSave(withDept({ ...ticket, attachments: [att, ...attachments] }));
    };
    reader.readAsDataURL(file);
  };
  const removeAttachment = (id) => onSave(withDept({ ...ticket, attachments: attachments.filter((a) => a.id !== id) }));

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div><div className="ticket-id">{ticket.id}</div><h3>{ticket.title || "(sem titulo)"}</h3><span className={`badge ${statusClass(ticket.status)}`}>{ticket.status}</span></div>
          <button className="btn btn-ghost" onClick={onClose}>Fechar</button>
        </div>
        <div className="kv">
          <div className="k">Solicitante</div><div>{ticket.requester || "—"}</div>
          <div className="k">Departamento de destino</div><div>{currentDeptName}</div>
          <div className="k">Responsavel</div><div>{ticket.assignee || "Sem responsavel"}</div>
          <div className="k">Prioridade</div><div>{ticket.priority || "Media"}</div>
          <div className="k">Categoria</div><div>{ticket.category || "—"}</div>
          <div className="k">Aberto em</div><div>{ticket.openedAtLabel || fmtDate(ticket.openedAt)}</div>
        </div>
        {ticket.description && (<><div className="section-title">Descricao</div><p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{ticket.description}</p></>)}

        <div className="section-title">Departamento de destino</div>
        <div className="drawer-actions">
          <select className="status-select" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} style={{ minWidth: 220 }}>
            <option value="">— Selecionar —</option>
            {destOptions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <button className="btn btn-ghost" onClick={() => onSave(withDept({ ...ticket, status, resolutionNotes: solution }))} disabled={saving}>Salvar departamento</button>
        </div>

        <div className="section-title">Atendimento</div>
        <div className="form-row">
          <div className="field"><label>Responsavel</label>
            <Autocomplete value={assignee} onChange={setAssignee} allowFreeText placeholder="Sem responsavel" options={assigneeNames.map((n) => ({ value: n, label: n }))} />
          </div>
          <div className="field"><label>Observadores (watchers)</label>
            <select multiple value={watcherIds} onChange={(e) => setWatcherIds(Array.from(e.target.selectedOptions).map((o) => o.value))} style={{ minHeight: 90 }}>
              {userList.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
        </div>
        <div className="drawer-actions">
          <button className="btn btn-ghost" onClick={() => onSave(withDept({ ...ticket, status, resolutionNotes: solution }))} disabled={saving}>Salvar atendimento</button>
        </div>

        <div className="section-title">Dados do chamado</div>
        <div className="form-row">
          <div className="field"><label>Prioridade</label><select value={priority} onChange={(e) => setPriority(e.target.value)}>{["Baixa", "Media", "Alta", "Critica"].map((o) => <option key={o}>{o}</option>)}</select></div>
          <div className="field"><label>Categoria</label><input value={category} onChange={(e) => setCategory(e.target.value)} /></div>
        </div>
        <div className="form-row">
          <div className="field"><label>Urgencia</label><select value={urgency} onChange={(e) => setUrgency(e.target.value)}>{["Baixa", "Media", "Alta", "Critica"].map((o) => <option key={o}>{o}</option>)}</select></div>
          <div className="field"><label>Impacto</label><select value={impact} onChange={(e) => setImpact(e.target.value)}>{["Baixa", "Media", "Alta", "Critica"].map((o) => <option key={o}>{o}</option>)}</select></div>
        </div>
        <div className="form-row">
          <div className="field"><label>Prazo (SLA)</label><input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
          <div className="field"><label>&nbsp;</label><button className="btn btn-ghost" onClick={() => onSave(withDept({ ...ticket, status, resolutionNotes: solution }))} disabled={saving}>Salvar dados</button></div>
        </div>
        {ticket.slaDeadlineAt && <p style={{ fontSize: 12.5, color: ticket.slaBreachedAt ? "var(--crit)" : "var(--muted)" }}>{ticket.slaBreachedAt ? `SLA violado em ${fmtDate(ticket.slaBreachedAt)}` : `Prazo SLA: ${fmtDate(ticket.slaDeadlineAt)}`}</p>}

        <div className="section-title">Vinculos</div>
        <div className="form-row">
          <div className="field"><label>Ativo</label><Autocomplete value={assetId} onChange={setAssetId} placeholder="Buscar ativo..." options={(assets || []).map((a) => ({ value: a.id, label: a.assetTag || a.name || a.id }))} /></div>
          <div className="field"><label>Projeto</label><Autocomplete value={projectId} onChange={setProjectId} placeholder="Buscar projeto..." options={(projects || []).map((pr) => ({ value: pr.id, label: pr.name || pr.id }))} /></div>
        </div>
        <div className="field"><label>Base de conhecimento</label><select multiple value={knowledgeIds} onChange={(e) => setKnowledgeIds(Array.from(e.target.selectedOptions).map((o) => o.value))} style={{ minHeight: 80 }}>{(knowledgeArticles || []).map((k) => <option key={k.id} value={k.id}>{k.title || k.id}</option>)}</select></div>
        <div className="drawer-actions"><button className="btn btn-ghost" onClick={() => onSave(withDept({ ...ticket, status, resolutionNotes: solution }))} disabled={saving}>Salvar vinculos</button></div>

        <div className="section-title">Tarefas / checklist</div>
        <div className="drawer-actions">
          <input className="search" style={{ flex: 1 }} value={checkText} onChange={(e) => setCheckText(e.target.value)} placeholder="Nova tarefa..." onKeyDown={(e) => { if (e.key === "Enter") addCheck(); }} />
          <button className="btn btn-primary" style={{ width: "auto" }} onClick={addCheck} disabled={saving || !checkText.trim()}>Adicionar</button>
        </div>
        <div className="check-list">
          {checklist.length === 0 ? <p style={{ color: "var(--muted)", fontSize: 13 }}>Nenhuma tarefa.</p> : checklist.map((c) => (
            <label className="check-item" key={c.id}>
              <input type="checkbox" checked={!!c.done} onChange={() => toggleCheck(c.id)} />
              <span style={{ textDecoration: c.done ? "line-through" : "none", color: c.done ? "var(--muted)" : "var(--text)" }}>{c.label}</span>
              <button className="attach-rm" onClick={(e) => { e.preventDefault(); removeCheck(c.id); }}>✕</button>
            </label>
          ))}
        </div>

        <div className="section-title">Aprovacao</div>
        {approval.status === "pending" ? (
          <div className="panel" style={{ boxShadow: "none", border: "1px solid var(--border)", padding: 14 }}>
            <p style={{ margin: "0 0 8px" }}>Aguardando aprovacao de <strong>{approval.currentApproverName || approval.approverName || "—"}</strong>.</p>
            {canDecideApproval ? (
              <>
                <textarea className="solution" style={{ minHeight: 56 }} value={approvalReason} onChange={(e) => setApprovalReason(e.target.value)} placeholder="Motivo da decisao (opcional)" />
                <div className="drawer-actions">
                  <button className="btn-ok" onClick={() => decideApproval("approve")} disabled={saving}>Aprovar</button>
                  <button className="btn-reopen" onClick={() => decideApproval("reject")} disabled={saving}>Rejeitar</button>
                </div>
              </>
            ) : <p style={{ color: "var(--muted)", fontSize: 13, margin: 0 }}>Somente o aprovador designado pode decidir.</p>}
          </div>
        ) : approval.status === "approved" || approval.status === "rejected" ? (
          <p style={{ color: approval.status === "approved" ? "var(--ok)" : "var(--crit)" }}>
            Aprovacao <strong>{approval.status === "approved" ? "aprovada" : "rejeitada"}</strong>{approval.decisionReason ? `: ${approval.decisionReason}` : ""}{approval.decidedByName ? ` (por ${approval.decidedByName})` : ""}.
          </p>
        ) : (
          <div className="drawer-actions">
            <select className="status-select" value={approverId} onChange={(e) => setApproverId(e.target.value)} style={{ minWidth: 200 }}>
              <option value="">— Aprovador —</option>
              {userList.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <button className="btn btn-ghost" onClick={requestApproval} disabled={saving || !approverId}>Solicitar aprovacao</button>
          </div>
        )}

        <div className="section-title">Acompanhamentos</div>
        <div className="followup-add">
          <textarea className="solution" value={followText} onChange={(e) => setFollowText(e.target.value)} placeholder="Escreva um acompanhamento..." style={{ minHeight: 70 }} />
          <div className="drawer-actions">
            <select className="status-select" value={followVis} onChange={(e) => setFollowVis(e.target.value)}>
              <option value="public">Publico</option><option value="private">Interno</option>
            </select>
            <button className="btn btn-primary" style={{ width: "auto" }} onClick={addFollowUp} disabled={saving || !followText.trim()}>Adicionar</button>
          </div>
        </div>
        <div className="followup-list">
          {followUps.length === 0 ? <p style={{ color: "var(--muted)", fontSize: 13 }}>Nenhum acompanhamento ainda.</p> : followUps.map((f) => (
            <div className="followup" key={f.id || f.createdAt}>
              <div className="followup-head"><strong>{f.authorName || "—"}</strong><span className={`badge ${f.visibility === "private" ? "s-espera" : "s-andamento"}`}>{f.visibility === "private" ? "Interno" : "Publico"}</span><span className="followup-date">{fmtDate(f.createdAt)}</span></div>
              <div className="followup-msg">{f.message}</div>
            </div>
          ))}
        </div>

        <div className="section-title">Anexos</div>
        <div className="drawer-actions">
          <input type="file" onChange={(e) => { addAttachment(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
        <div className="attach-list">
          {attachments.length === 0 ? <p style={{ color: "var(--muted)", fontSize: 13 }}>Nenhum anexo.</p> : attachments.map((a) => (
            <div className="attach" key={a.id || a.name}>
              <a href={a.dataUrl || a.url || "#"} download={a.name} target="_blank" rel="noreferrer">📎 {a.name}</a>
              <button className="attach-rm" onClick={() => removeAttachment(a.id)} title="Remover">✕</button>
            </div>
          ))}
        </div>

        <div className="section-title">Historico</div>
        <div className="followup-list">
          {(Array.isArray(ticket.history) ? ticket.history.slice().reverse().slice(0, 30) : []).map((h, i) => (
            <div className="followup" key={h.id || i}>
              <div className="followup-head"><strong>{h.actorName || "Sistema"}</strong><span className="followup-date">{fmtDate(h.createdAt || h.at)}</span></div>
              <div className="followup-msg">{h.message || h.type || ""}</div>
            </div>
          ))}
          {(!ticket.history || !ticket.history.length) && <p style={{ color: "var(--muted)", fontSize: 13 }}>Sem historico registrado.</p>}
        </div>

        <div className="section-title">Solucao</div>
        <textarea className="solution" value={solution} onChange={(e) => setSolution(e.target.value)} placeholder="Descreva a solucao aplicada antes de resolver..." />
        <div className="section-title">Status</div>
        <div className="drawer-actions">
          <select className="status-select" value={status} onChange={(e) => setStatus(e.target.value)}>{STATUS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}</select>
          <button className="btn btn-ghost" onClick={() => onSave(withDept({ ...ticket, status, resolutionNotes: solution }))} disabled={saving}>Aplicar status</button>
        </div>
        <div className="drawer-actions">
          {norm(ticket.status) !== "resolvido"
            ? <button className="btn-ok" onClick={() => onSave(withDept({ ...ticket, status: "Resolvido", resolutionNotes: solution }))} disabled={saving || !solution.trim()}>{saving ? <span className="spinner" /> : "Resolver chamado"}</button>
            : <button className="btn-reopen" onClick={() => onSave(withDept({ ...ticket, status: "Reaberto" }))} disabled={saving}>Reabrir chamado</button>}
        </div>
        {norm(ticket.status) !== "resolvido" && !solution.trim() && <p style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 8 }}>Informe a solucao para habilitar a resolucao.</p>}
      </div>
    </div>
  );
}

function NewTicketModal({ departments, user, onClose, onCreate, saving }) {
  const [form, setForm] = useState({
    title: "", type: "Incidente", priority: "Media", departmentId: "", category: "",
    description: "", requester: user?.name || "", requesterEmail: user?.email || "",
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async () => {
    if (!form.title.trim()) return;
    if ((departments || []).length && !form.departmentId) return;
    const dept = (departments || []).find((d) => String(d.id) === String(form.departmentId));
    const nowIso = new Date().toISOString();
    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      type: form.type,
      priority: form.priority,
      status: "Aberto",
      category: String(form.category || "Geral").trim(),
      departmentId: dept?.id || "",
      department: dept?.name || "",
      queue: dept?.name || "Service Desk",
      requester: form.requester.trim() || user?.name || "",
      requesterId: user?.id || "",
      requesterEmail: form.requesterEmail.trim().toLowerCase(),
      source: "TicketMind 2",
      openedAt: nowIso,
      slaTargetMinutes: 240,
    };
    const created = await onCreate(payload);
    if (created) onClose();
  };
  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head"><h3>Abrir novo chamado</h3><button className="btn btn-ghost" onClick={onClose}>Fechar</button></div>
        <div className="field"><label>Titulo *</label><input value={form.title} onChange={set("title")} autoFocus /></div>
        <div className="form-row">
          <div className="field"><label>Tipo</label><select value={form.type} onChange={set("type")}><option>Incidente</option><option>Requisicao</option><option>Problema</option></select></div>
          <div className="field"><label>Prioridade</label><select value={form.priority} onChange={set("priority")}><option>Baixa</option><option>Media</option><option>Alta</option><option>Critica</option></select></div>
        </div>
        <div className="form-row">
          <div className="field"><label>Departamento de destino *</label><select value={form.departmentId} onChange={set("departmentId")}><option value="">— Para onde vai o chamado —</option>{(departments || []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>{!(departments || []).length ? <small style={{ color: "var(--crit)" }}>Nenhum departamento habilitado a receber chamados. Ative em Central de Servicos.</small> : null}</div>
          <div className="field"><label>Categoria</label><input value={form.category} onChange={set("category")} placeholder="Ex.: Infraestrutura" /></div>
        </div>
        <div className="form-row">
          <div className="field"><label>Solicitante</label><input value={form.requester} onChange={set("requester")} /></div>
          <div className="field"><label>E-mail do solicitante</label><input value={form.requesterEmail} onChange={set("requesterEmail")} /></div>
        </div>
        <div className="field"><label>Descricao</label><textarea className="solution" value={form.description} onChange={set("description")} placeholder="Descreva o chamado..." /></div>
        <div className="drawer-actions">
          <button className="btn btn-primary" style={{ width: "auto" }} onClick={submit} disabled={saving || !form.title.trim() || ((departments || []).length && !form.departmentId)}>{saving ? <span className="spinner" /> : "Abrir chamado"}</button>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

function TicketsView({ tickets, onSave, onCreate, departments, requestableDepts, serviceCenter, users, assets, projects, knowledgeArticles, user, saving }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("abertos");
  const [selected, setSelected] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const filtered = useMemo(() => {
    const q = norm(search);
    return tickets
      .filter((t) => statusFilter === "abertos" ? isOpen(t.status) : statusFilter === "resolvidos" ? norm(t.status) === "resolvido" : true)
      .filter((t) => !q || norm(`${t.id} ${t.title} ${t.requester} ${t.department} ${t.assignee}`).includes(q))
      .sort((a, b) => String(b.updatedAtIso || b.openedAt || "").localeCompare(String(a.updatedAtIso || a.openedAt || "")));
  }, [tickets, search, statusFilter]);
  const current = selected ? tickets.find((t) => t.id === selected) || null : null;
  return (
    <div>
      <div className="toolbar">
        <input className="search" placeholder="Buscar por id, titulo, solicitante..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="abertos">Em aberto</option><option value="resolvidos">Resolvidos</option><option value="todos">Todos</option>
        </select>
        <span style={{ color: "var(--muted)", fontSize: 13 }}>{filtered.length} chamado(s)</span>
        <button className="btn btn-primary" style={{ width: "auto", marginLeft: "auto" }} onClick={() => setShowNew(true)}>+ Novo chamado</button>
      </div>
      {filtered.length === 0 ? <div className="panel"><div className="empty">Nenhum chamado neste filtro.</div></div> : (
        <div className="ticket-list">
          {filtered.map((t) => (
            <div key={t.id} className={`ticket-card ${priorityClass(t.priority)}`} onClick={() => setSelected(t.id)}>
              <div><div className="ticket-id">{t.id}</div><div className="ticket-meta">{t.priority || "Media"}</div></div>
              <div><div className="ticket-title">{t.title || "(sem titulo)"}</div><div className="ticket-meta">{t.department || t.queue || "—"} · {t.requester || "—"} · {t.assignee || "Sem responsavel"}</div></div>
              <div><span className={`badge ${statusClass(t.status)}`}>{t.status || "Aberto"}</span></div>
            </div>
          ))}
        </div>
      )}
      {current && <TicketDrawer ticket={current} departments={departments} requestableDepts={requestableDepts} serviceCenter={serviceCenter} users={users} assets={assets} projects={projects} knowledgeArticles={knowledgeArticles} user={user} saving={saving} onClose={() => setSelected(null)} onSave={onSave} />}
      {showNew && <NewTicketModal departments={requestableDepts} user={user} saving={saving} onClose={() => setShowNew(false)} onCreate={onCreate} />}
    </div>
  );
}

function LogsView() {
  const [logs, setLogs] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/system-logs?limit=100", { credentials: "include" });
        const p = await r.json();
        if (!r.ok) throw new Error(p?.error || "Falha ao carregar logs.");
        setLogs(Array.isArray(p?.items) ? p.items : []);
      } catch (err) { setError(err.message); setLogs([]); }
    })();
  }, []);
  if (logs === null) return <div className="panel"><div className="empty"><span className="spinner" style={{ borderTopColor: "#1565c0", borderColor: "#cbd5e1" }} /> Carregando...</div></div>;
  if (error) return <div className="panel"><div className="empty">{error}</div></div>;
  return (
    <CollectionView title="Logs do Sistema" items={logs} columns={[
      { key: "occurredAt", label: "Data", render: (i) => i.occurredAtLabel || i.occurredAt || i.sentAt || "—" },
      { key: "userName", label: "Usuario" }, { key: "module", label: "Modulo" },
      { key: "eventType", label: "Evento" }, { key: "description", label: "Descricao" },
      { key: "status", label: "Status" },
    ]} />
  );
}

function TechniciansView({ users, tickets }) {
  const agents = (users || []).filter((u) => {
    const pr = u.permissions || {};
    return pr.tickets_edit || pr.tickets_assign || pr.tickets_change_status || pr.tickets_admin || norm(u.role) !== "solicitante interno";
  });
  const countAll = (name) => (tickets || []).filter((t) => (t.assignee || "") === name).length;
  const countOpen = (name) => (tickets || []).filter((t) => (t.assignee || "") === name && isOpen(t.status)).length;
  return (
    <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
      <table className="data-table">
        <thead><tr><th>Tecnico</th><th>Perfil</th><th>Setor</th><th>E-mail</th><th>Atribuidos</th><th>Em aberto</th></tr></thead>
        <tbody>
          {agents.length === 0 ? <tr><td colSpan={6}><div className="empty">Nenhum tecnico encontrado.</div></td></tr> : agents.map((u) => (
            <tr key={u.id}>
              <td>{u.name}</td><td>{u.role || "—"}</td><td>{u.department || "—"}</td><td>{u.email || "—"}</td>
              <td>{countAll(u.name)}</td><td><strong>{countOpen(u.name)}</strong></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProfileView({ user, onChangePassword }) {
  const [cur, setCur] = useState("");
  const [nw, setNw] = useState("");
  const [cf, setCf] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!cur || !nw) return;
    if (nw !== cf) { window.alert("A confirmacao da nova senha nao confere."); return; }
    setBusy(true);
    const ok = await onChangePassword(cur, nw);
    setBusy(false);
    if (ok) { setCur(""); setNw(""); setCf(""); }
  };
  return (
    <div>
      <div className="panel"><h2>Meus dados</h2>
        <div className="kv" style={{ gridTemplateColumns: "160px 1fr" }}>
          <div className="k">Nome</div><div>{user?.name || "—"}</div>
          <div className="k">E-mail</div><div>{user?.email || "—"}</div>
          <div className="k">Perfil</div><div>{user?.role || "—"}</div>
          <div className="k">Setor</div><div>{user?.department || "—"}</div>
        </div>
      </div>
      <div className="panel" style={{ maxWidth: 460 }}><h2>Alterar senha</h2>
        <div className="field"><label>Senha atual</label><input type="password" value={cur} onChange={(e) => setCur(e.target.value)} /></div>
        <div className="field"><label>Nova senha</label><input type="password" value={nw} onChange={(e) => setNw(e.target.value)} /></div>
        <div className="field"><label>Confirmar nova senha</label><input type="password" value={cf} onChange={(e) => setCf(e.target.value)} /></div>
        <button className="btn btn-primary" style={{ width: "auto" }} disabled={busy || !cur || !nw} onClick={submit}>{busy ? <span className="spinner" /> : "Alterar senha"}</button>
      </div>
    </div>
  );
}

function PublicPortal({ token }) {
  const [boot, setBoot] = useState(null);
  const [err, setErr] = useState("");
  const [form, setForm] = useState({ requesterName: "", requesterEmail: "", requesterDepartmentId: "", requesterLocation: "", title: "", description: "", destinationDepartmentId: "", priority: "Media" });
  const [busy, setBusy] = useState(false);
  const [sentId, setSentId] = useState("");
  useEffect(() => {
    (async () => {
      try { const env = await api.publicIntake(token); setBoot(env?.data || env || {}); }
      catch (e) { setErr(e.message || "Canal de abertura indisponivel."); }
    })();
  }, [token]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async () => {
    if (!form.title.trim() || !form.description.trim() || !form.destinationDepartmentId) return;
    setBusy(true); setErr("");
    try {
      const env = await api.createPublicTicket(token, {
        requesterName: form.requesterName, requesterEmail: form.requesterEmail,
        requesterDepartmentId: form.requesterDepartmentId, requesterLocation: form.requesterLocation,
        destinationDepartmentId: form.destinationDepartmentId,
        title: form.title, description: form.description,
        type: "Incidente", priority: form.priority, urgency: form.priority,
      });
      const t = env?.data || env;
      setSentId(t?.id || "OK");
    } catch (e) { setErr(e.message || "Falha ao abrir o chamado."); }
    finally { setBusy(false); }
  };
  const [lookup, setLookup] = useState(null);
  const doLookup = async () => {
    const email = form.requesterEmail.trim();
    if (!email) return;
    try {
      const env = await api.publicRequester(token, email);
      const r = env?.data || env;
      setLookup(r || null);
      setForm((f) => ({ ...f, requesterName: f.requesterName || r?.requesterName || "", requesterDepartmentId: f.requesterDepartmentId || r?.requesterDepartmentId || "", requesterLocation: f.requesterLocation || r?.requesterLocation || "" }));
    } catch { setLookup(null); }
  };
  const destDepts = boot?.destinationDepartments || [];
  const reqDepts = boot?.requesterDepartments || [];
  const locations = boot?.locations || [];
  return (
    <div className="login-wrap">
      <div className="login-card" style={{ maxWidth: 560 }}>
        <Brand />
        <h2 style={{ margin: "6px 0 2px" }}>{boot?.portal?.portalTitle || "Abrir chamado"}</h2>
        <p className="brand-sub">{boot?.portal?.portalDescription || "Registre sua solicitacao para a equipe de atendimento."}</p>
        {err && <div className="error-banner">{err}</div>}
        {sentId ? (
          <div>
            <div className="kpi" style={{ textAlign: "center" }}><div className="label">Chamado registrado</div><div className="value ok">{sentId}</div></div>
            <p style={{ color: "var(--muted)" }}>Guarde este numero para acompanhamento. Voce pode fechar esta pagina.</p>
            <button className="btn btn-ghost" onClick={() => { setSentId(""); setForm({ requesterName: "", requesterEmail: "", requesterDepartmentId: "", requesterLocation: "", title: "", description: "", destinationDepartmentId: "", priority: "Media" }); }}>Abrir outro chamado</button>
          </div>
        ) : boot?.portal && boot.portal.enabled === false ? (
          <div className="error-banner">A abertura externa esta desativada no momento.</div>
        ) : (
          <>
            <div className="form-row">
              <div className="field"><label>Seu nome</label><input value={form.requesterName} onChange={set("requesterName")} /></div>
              <div className="field"><label>Seu e-mail</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input value={form.requesterEmail} onChange={set("requesterEmail")} onBlur={doLookup} />
                  <button type="button" className="btn btn-ghost" style={{ whiteSpace: "nowrap" }} onClick={doLookup}>Buscar</button>
                </div>
              </div>
            </div>
            {lookup && (lookup.hasRegisteredUser || lookup.hasPreRegisteredUser || (lookup.previousTickets || []).length) ? (
              <div className="portal-prev">
                {lookup.requesterName ? <div style={{ fontSize: 13 }}>Ola, <strong>{lookup.requesterName}</strong>{lookup.hasPreRegisteredUser && !lookup.hasRegisteredUser ? " (pre-cadastro)" : ""}.</div> : null}
                {(lookup.previousTickets || []).length ? (
                  <>
                    <div style={{ fontSize: 12, color: "var(--muted)", margin: "6px 0 2px" }}>Seus chamados:</div>
                    {(lookup.previousTickets || []).slice(0, 6).map((t) => (
                      <div className="pt" key={t.id}><span><strong>{t.id}</strong> {t.title || ""}</span><span>{t.status || ""}</span></div>
                    ))}
                  </>
                ) : <div style={{ fontSize: 12, color: "var(--muted)" }}>Nenhum chamado anterior.</div>}
              </div>
            ) : null}
            <div className="form-row">
              <div className="field"><label>Seu setor *</label>
                <select value={form.requesterDepartmentId} onChange={set("requesterDepartmentId")}>
                  <option value="">— Selecionar —</option>
                  {reqDepts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div className="field"><label>Seu local *</label>
                <input list="portal-locais" value={form.requesterLocation} onChange={set("requesterLocation")} placeholder="Ex.: Matriz" />
                <datalist id="portal-locais">{locations.map((l) => <option key={l.id} value={l.name} />)}</datalist>
              </div>
            </div>
            <div className="form-row">
              <div className="field"><label>Departamento de destino *</label>
                <select value={form.destinationDepartmentId} onChange={set("destinationDepartmentId")} disabled={!destDepts.length}>
                  <option value="">— Selecionar —</option>
                  {destDepts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                {!destDepts.length ? <small style={{ color: "var(--crit)" }}>Nenhum departamento habilitado para abertura externa. Habilite em Central de Servicos (Aceita chamados + No portal).</small> : null}
              </div>
              <div className="field"><label>Prioridade</label><select value={form.priority} onChange={set("priority")}><option>Baixa</option><option>Media</option><option>Alta</option><option>Critica</option></select></div>
            </div>
            <div className="field"><label>Titulo *</label><input value={form.title} onChange={set("title")} /></div>
            <div className="field"><label>Descricao *</label><textarea className="solution" value={form.description} onChange={set("description")} /></div>
            <button className="btn btn-primary" disabled={busy || !form.title.trim() || !form.description.trim() || !form.destinationDepartmentId || !form.requesterDepartmentId || !form.requesterLocation || !form.requesterName.trim() || !form.requesterEmail.trim()} onClick={submit}>{busy ? <span className="spinner" /> : "Abrir chamado"}</button>
          </>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState(null);
  const [data, setData] = useState({});
  const [view, setView] = useState("dashboard");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem("tm2.collapsed") === "1"; } catch { return false; } });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const toggleCollapse = () => setCollapsed((c) => { const n = !c; try { localStorage.setItem("tm2.collapsed", n ? "1" : "0"); } catch { /* ignore */ } return n; });

  const tickets = Array.isArray(data.tickets) ? data.tickets : [];
  const showToast = (message, kind = "ok") => { setToast({ message, kind }); window.setTimeout(() => setToast(null), 3200); };

  const loadState = async () => {
    const state = await api.state();
    const d = state?.data || state || {};
    setData(d);
    if (d.currentUser) setUser(d.currentUser);
  };

  const portalToken = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("portal") : null;
  useEffect(() => {
    if (portalToken) { setBooting(false); return; }
    (async () => {
      try { const s = await api.session(); if (s?.user) { setUser(s.user); await loadState(); } }
      catch { /* sem sessao */ }
      finally { setBooting(false); }
    })();
  }, []);

  const onLoginSuccess = async (loggedUser) => {
    // Entra no app imediatamente (sem tela de carregando travando a transicao)
    // e carrega os dados em segundo plano.
    if (loggedUser) setUser(loggedUser);
    setView("dashboard");
    try { await loadState(); } catch (err) { console.error(err); }
  };
  const onLogout = async () => { try { await api.logout(); } catch { /* ignore */ } setUser(null); setData({}); };

  const createTicket = async (payload) => {
    setSaving(true);
    try {
      const env = await api.createTicket(payload);
      const ticket = env?.data || env;
      if (ticket?.id) setData((cur) => ({ ...cur, tickets: [ticket, ...(cur.tickets || [])] }));
      showToast(`Chamado ${ticket?.id || ""} aberto.`, "ok");
      return ticket;
    } catch (err) {
      showToast(err.message || "Falha ao abrir o chamado.", "err");
      return null;
    } finally { setSaving(false); }
  };

  const normalizeItem = (item) => {
    const out = { ...item };
    if (out.active === "Sim") out.active = true;
    if (out.active === "Nao") out.active = false;
    if (out.progress !== undefined && out.progress !== "") out.progress = Number(out.progress) || 0;
    if (out.mustChangePassword === "Sim") out.mustChangePassword = true;
    if (out.mustChangePassword === "Nao") out.mustChangePassword = false;
    return out;
  };
  const writeVia = (domain) => COLLECTIONS[domain]?.writeVia || "collection";

  const createItem = async (domain, item) => {
    setSaving(true);
    try {
      const via = writeVia(domain);
      if (via === "v1") {
        const env = await api.createV1(domain, normalizeItem(item));
        const saved = env?.data || env;
        setData((cur) => ({ ...cur, [domain]: [saved, ...(cur[domain] || [])] }));
      } else if (via === "profiles") {
        const id = `profile-${Date.now().toString(36)}`;
        const next = [{ id, ...normalizeItem(item), permissions: Array.isArray(item.permissions) ? item.permissions : [] }, ...(data.permissionProfiles || [])];
        const saved = await api.saveSingleton("permissionProfiles", next);
        setData((cur) => ({ ...cur, permissionProfiles: Array.isArray(saved) ? saved : next }));
      } else {
        const payload = normalizeItem(item);
        if (domain === "knowledgeArticles" && !payload.owner) payload.owner = user?.name || "";
        const saved = await api.createCollectionItem(domain, payload);
        setData((cur) => ({ ...cur, [domain]: [saved, ...(cur[domain] || [])] }));
      }
      showToast("Registro criado."); return true;
    } catch (err) { showToast(err.message || "Falha ao criar.", "err"); return false; } finally { setSaving(false); }
  };
  const saveItem = async (domain, id, item) => {
    setSaving(true);
    try {
      const via = writeVia(domain);
      if (via === "v1") {
        const env = await api.saveV1(domain, id, normalizeItem(item));
        const saved = env?.data || env;
        setData((cur) => ({ ...cur, [domain]: (cur[domain] || []).map((x) => (x.id === id ? { ...x, ...saved } : x)) }));
      } else if (via === "profiles") {
        const next = (data.permissionProfiles || []).map((p) => {
          if (p.id !== id) return p;
          const wasAll = p.permissions === "ALL";
          return { ...p, name: item.name, description: item.description, status: item.status, permissions: wasAll ? "ALL" : (Array.isArray(item.permissions) ? item.permissions : []) };
        });
        const saved = await api.saveSingleton("permissionProfiles", next);
        setData((cur) => ({ ...cur, permissionProfiles: Array.isArray(saved) ? saved : next }));
      } else {
        const saved = await api.saveCollectionItem(domain, id, normalizeItem(item));
        setData((cur) => ({ ...cur, [domain]: (cur[domain] || []).map((x) => (x.id === id ? { ...x, ...saved } : x)) }));
      }
      showToast("Registro salvo."); return true;
    } catch (err) { showToast(err.message || "Falha ao salvar.", "err"); return false; } finally { setSaving(false); }
  };
  const deleteItem = async (domain, id) => {
    setSaving(true);
    try {
      const via = writeVia(domain);
      if (via === "v1") {
        await api.deleteV1(domain, id);
        setData((cur) => ({ ...cur, [domain]: (cur[domain] || []).filter((x) => x.id !== id) }));
      } else if (via === "profiles") {
        const next = (data.permissionProfiles || []).filter((p) => p.id !== id);
        const saved = await api.saveSingleton("permissionProfiles", next);
        setData((cur) => ({ ...cur, permissionProfiles: Array.isArray(saved) ? saved : next }));
      } else {
        await api.removeCollectionItem(domain, id);
        setData((cur) => ({ ...cur, [domain]: (cur[domain] || []).filter((x) => x.id !== id) }));
      }
      showToast("Registro excluido."); return true;
    } catch (err) { showToast(err.message || "Falha ao excluir.", "err"); return false; } finally { setSaving(false); }
  };

  const resolveFields = (cfg) => {
    if (!cfg?.fields) return cfg?.fields;
    const opts = {
      departments: (data.departments || []).map((d) => ({ value: d.id, label: d.name })),
      profiles: (data.permissionProfiles || []).map((p) => ({ value: p.id, label: p.name })),
      teams: (data.teams || []).map((t) => ({ value: t.name, label: t.name })),
      permissions: (Array.isArray(data.permissionCatalog) ? data.permissionCatalog : []).flatMap((m) =>
        (Array.isArray(m.permissions) ? m.permissions : []).map((pp) => ({ value: pp.key || pp, label: `${m.label || m.module || ""} · ${pp.label || pp.key || pp}` }))),
    };
    return cfg.fields.map((f) => (f.optionsFrom ? { ...f, options: opts[f.optionsFrom] || [] } : f));
  };
  const saveServiceCenter = async (sc) => {
    setSaving(true);
    try { const saved = await api.saveSingleton("serviceCenter", sc); setData((cur) => ({ ...cur, serviceCenter: saved })); showToast("Central de Servicos salva."); return true; }
    catch (err) { showToast(err.message || "Falha ao salvar a Central de Servicos.", "err"); return false; } finally { setSaving(false); }
  };
  const changePassword = async (curPass, newPass) => {
    try { await api.changePassword(curPass, newPass); showToast("Senha alterada com sucesso."); return true; }
    catch (err) { showToast(err.message || "Falha ao alterar a senha.", "err"); return false; }
  };

  const saveTicket = async (nextTicket) => {
    setSaving(true);
    try {
      const saved = await api.saveTicket(nextTicket.id, nextTicket);
      const merged = saved && saved.id ? saved : nextTicket;
      setData((cur) => ({ ...cur, tickets: (cur.tickets || []).map((t) => (t.id === nextTicket.id ? { ...t, ...merged } : t)) }));
      showToast(`Chamado ${nextTicket.id} atualizado.`, "ok");
    } catch (err) { showToast(err.message || "Falha ao salvar o chamado.", "err"); }
    finally { setSaving(false); }
  };

  if (portalToken) return <PublicPortal token={portalToken} />;
  if (booting) return <div className="center-load"><span className="spinner" style={{ borderTopColor: "#1565c0", borderColor: "#cbd5e1" }} /> &nbsp;Carregando...</div>;
  if (!user) return <Login onSuccess={onLoginSuccess} />;

  const visibleMenu = MENU.map((g) => ({ ...g, items: g.items.filter((it) => !it.perm || hasPerm(user, it.perm)) })).filter((g) => g.items.length);
  const currentItem = MENU.flatMap((g) => g.items).find((it) => it.key === view);
  const collectionCfg = COLLECTIONS[view];

  return (
    <div className={`shell${collapsed ? " shell-collapsed" : ""}${mobileOpen ? " shell-mobile-open" : ""}`}>
      {mobileOpen && <div className="sidebar-backdrop" onClick={() => setMobileOpen(false)} />}
      <aside className="sidebar">
        <div className="sidebar-top">
          <Brand light />
          <button className="collapse-btn" title={collapsed ? "Expandir menu" : "Recolher menu"} onClick={toggleCollapse}>{collapsed ? "»" : "«"}</button>
        </div>
        <nav className="nav">
          {visibleMenu.map((g) => (
            <div key={g.group} className="nav-group">
              <div className="nav-group-title">{g.group}</div>
              {g.items.map((it) => (
                <button key={it.key} className={`nav-item ${view === it.key ? "active" : ""}`} title={it.label} onClick={() => { setView(it.key); setMobileOpen(false); }}>
                  <span className="nav-icon">{it.icon}</span> <span className="nav-label">{it.label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      <main className="main">
        <div className="topbar">
          <div className="topbar-left">
            <button className="icon-btn" title="Menu" onClick={() => { if (typeof window !== "undefined" && window.innerWidth <= 860) setMobileOpen((o) => !o); else toggleCollapse(); }}>☰</button>
            <div>
              <h1>{currentItem?.label || "TicketMind 2"}</h1>
              <div className="sub">{view === "dashboard" ? "Visao geral da operacao" : view === "reports" ? "Indicadores e relatorios" : currentItem?.label}</div>
            </div>
          </div>
          <div className="topbar-right">
            <button className="btn btn-ghost" onClick={() => loadState().then(() => showToast("Atualizado.")).catch(() => showToast("Falha ao atualizar.", "err"))}>Atualizar</button>
            <div className="user-menu">
              <button className="user-btn" onClick={() => setUserMenuOpen((o) => !o)}>
                <span className="user-avatar">{(user.name || "?").slice(0, 1).toUpperCase()}</span>
                <span className="user-name">{user.name}</span>
                <span style={{ color: "var(--muted)" }}>▾</span>
              </button>
              {userMenuOpen && (
                <>
                  <div className="user-menu-backdrop" onClick={() => setUserMenuOpen(false)} />
                  <div className="user-dropdown">
                    <div className="user-dropdown-head">{user.name}<br /><small style={{ color: "var(--muted)" }}>{user.email}</small></div>
                    <button onClick={() => { setView("profile"); setUserMenuOpen(false); }}>Meu Perfil</button>
                    <button onClick={() => { setUserMenuOpen(false); onLogout(); }}>Sair</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
        {view === "dashboard" && <Dashboard tickets={tickets} onGo={setView} />}
        {view === "tickets" && <TicketsView tickets={tickets} onSave={saveTicket} onCreate={createTicket} departments={(data.departments || []).filter((d) => norm(d.status) === "ativo")} requestableDepts={requestableDepartments(data.departments || [], data.serviceCenter || {})} serviceCenter={data.serviceCenter || {}} users={data.users || []} assets={data.assets || []} projects={data.projects || []} knowledgeArticles={data.knowledgeArticles || []} user={user} saving={saving} />}
        {view === "reports" && <Reports tickets={tickets} />}
        {view === "logs" && <LogsView />}
        {view === "serviceCenter" && <ServiceCenterView serviceCenter={data.serviceCenter || {}} departments={data.departments || []} users={data.users || []} onSave={saveServiceCenter} saving={saving} />}
        {view === "technicians" && <TechniciansView users={data.users || []} tickets={tickets} />}
        {view === "inventory" && <InventoryView assets={data.assets || []} />}
        {view === "profile" && <ProfileView user={user} onChangePassword={changePassword} />}
        {collectionCfg && (
          <CollectionView
            title={collectionCfg.label} items={data[view]} columns={collectionCfg.columns}
            editable={collectionCfg.editable} fields={resolveFields(collectionCfg)} saving={saving}
            onCreate={(item) => createItem(view, item)} onSave={(id, item) => saveItem(view, id, item)} onDelete={(id) => deleteItem(view, id)}
          />
        )}
      </main>
      {toast && <div className={`toast ${toast.kind}`}>{toast.message}</div>}
    </div>
  );
}
