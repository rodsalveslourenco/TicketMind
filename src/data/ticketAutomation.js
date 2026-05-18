import { getSlaPolicyMinutes, normalizeText } from "./helpdesk.js";

export const DEFAULT_WATCHER_EVENT_KEYS = [
  "ticket_status_changed",
  "ticket_assignment_changed",
  "ticket_commented",
  "ticket_closed",
  "ticket_sla_breached",
  "ticket_approval_pending",
  "ticket_approval_overdue",
  "ticket_approval_reminder",
];

export function normalizeWatcherEventKeys(value) {
  const values = Array.isArray(value) ? value : [];
  const normalized = values
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  return normalized.length ? Array.from(new Set(normalized)) : [...DEFAULT_WATCHER_EVENT_KEYS];
}

export function normalizeWatcherDetails(rawWatchers, users = [], fallbackWatchers = "") {
  const baseWatchers = Array.isArray(rawWatchers) ? rawWatchers : [];
  const normalizedArray = baseWatchers
    .map((watcher, index) => {
      const userId = String(watcher?.userId || watcher?.id || "").trim();
      const matchedUser = userId ? users.find((candidate) => candidate.id === userId) || null : null;
      const name = String(watcher?.name || matchedUser?.name || "").trim();
      const email = String(watcher?.email || matchedUser?.email || "").trim().toLowerCase();
      if (!userId && !name && !email) return null;
      return {
        id: String(watcher?.id || `watcher-${index + 1}`),
        userId,
        name: name || email || "Observador",
        email,
        eventKeys: normalizeWatcherEventKeys(watcher?.eventKeys),
      };
    })
    .filter(Boolean);

  if (normalizedArray.length) return normalizedArray;

  return String(fallbackWatchers || "")
    .split(/[,\n;]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((name, index) => ({
      id: `watcher-legacy-${index + 1}`,
      userId: "",
      name,
      email: "",
      eventKeys: [...DEFAULT_WATCHER_EVENT_KEYS],
    }));
}

export function buildWatchersLabel(watcherDetails = []) {
  return (Array.isArray(watcherDetails) ? watcherDetails : [])
    .map((watcher) => String(watcher?.name || watcher?.email || "").trim())
    .filter(Boolean)
    .join(", ");
}

function stringMatch(candidate, target) {
  if (!candidate) return true;
  return normalizeText(target) === normalizeText(candidate);
}

function stringIncludes(candidate, target) {
  if (!candidate) return true;
  return normalizeText(target).includes(normalizeText(candidate));
}

function isWithinBusinessHours(rule = {}, now = new Date()) {
  if (!rule.businessHoursOnly) return true;
  const startHour = Number(rule.startHour);
  const endHour = Number(rule.endHour);
  const currentHour = now.getHours() + now.getMinutes() / 60;
  const lower = Number.isFinite(startHour) ? startHour : 8;
  const upper = Number.isFinite(endHour) ? endHour : 18;
  return currentHour >= lower && currentHour <= upper;
}

function matchDepartment(rule = {}, ticketLike = {}) {
  const ruleDepartmentId = String(rule.departmentId || "").trim();
  if (ruleDepartmentId) {
    return String(ticketLike.departmentId || "").trim() === ruleDepartmentId;
  }
  return stringMatch(rule.department, ticketLike.department);
}

function matchLocation(rule = {}, ticketLike = {}) {
  return stringIncludes(rule.location, ticketLike.location);
}

function matchKeyword(rule = {}, ticketLike = {}) {
  const keyword = String(rule.keyword || "").trim();
  if (!keyword) return true;
  const haystack = [ticketLike.title, ticketLike.description, ticketLike.category, ticketLike.location]
    .map((value) => normalizeText(value))
    .join(" ");
  return haystack.includes(normalizeText(keyword));
}

export function matchAutomationRule(rule = {}, ticketLike = {}, now = new Date()) {
  if (rule.active === false) return false;
  return (
    stringMatch(rule.type, ticketLike.type) &&
    stringMatch(rule.priority, ticketLike.priority) &&
    stringMatch(rule.category, ticketLike.category) &&
    stringMatch(rule.queue, ticketLike.queue) &&
    stringMatch(rule.source, ticketLike.source) &&
    matchDepartment(rule, ticketLike) &&
    matchLocation(rule, ticketLike) &&
    matchKeyword(rule, ticketLike) &&
    isWithinBusinessHours(rule, now)
  );
}

export function resolveTicketSlaTargets(ticketLike = {}, policies = []) {
  const matchedRule = (Array.isArray(policies) ? policies : []).find((rule) => matchAutomationRule(rule, ticketLike));
  const resolutionMinutes = Number(matchedRule?.resolutionMinutes) || getSlaPolicyMinutes(ticketLike.priority);
  const initialResponseMinutes = Number(matchedRule?.initialResponseMinutes) || Math.max(15, Math.round(resolutionMinutes * 0.25));
  return {
    resolutionMinutes,
    initialResponseMinutes,
    matchedRuleId: String(matchedRule?.id || "").trim(),
    matchedRuleName: String(matchedRule?.name || "").trim(),
  };
}

export function applyAdvancedRoutingRules(ticketLike = {}, routingRules = [], users = [], options = {}) {
  const matchedRule = (Array.isArray(routingRules) ? routingRules : []).find((rule) => matchAutomationRule(rule, ticketLike));
  const currentAssignee = String(ticketLike.assignee || "").trim();
  const preserveManualAssignment = matchedRule?.preserveManualAssignment !== false;
  const assignedUser = matchedRule?.assigneeUserId
    ? users.find((candidate) => candidate.id === matchedRule.assigneeUserId) || null
    : null;
  const nextAssignee =
    preserveManualAssignment && currentAssignee
      ? currentAssignee
      : String(assignedUser?.name || matchedRule?.assigneeName || currentAssignee || "").trim();

  return {
    ...ticketLike,
    assignee: nextAssignee,
    queue: String(matchedRule?.queue || ticketLike.queue || "Service Desk").trim() || "Service Desk",
    departmentId: String(matchedRule?.departmentId || ticketLike.departmentId || "").trim(),
    department: String(matchedRule?.department || ticketLike.department || "").trim(),
    triage: {
      ...(ticketLike.triage && typeof ticketLike.triage === "object" ? ticketLike.triage : {}),
      routedByRule: Boolean(matchedRule),
      routeLabel: String(matchedRule?.triageLabel || ticketLike.triage?.routeLabel || "Triagem manual").trim(),
      queue: String(matchedRule?.queue || ticketLike.queue || ticketLike.triage?.queue || "Service Desk").trim() || "Service Desk",
      allowManualOverride: matchedRule?.preserveManualAssignment !== false,
      hidden: options.hidden === true,
      lastRoutedAt: new Date().toISOString(),
      matchedRuleId: String(matchedRule?.id || "").trim(),
      matchedRuleName: String(matchedRule?.name || "").trim(),
    },
  };
}

export function resolveDelegateForApprover(approverId, delegations = [], users = [], nowIso = new Date().toISOString()) {
  const normalizedApproverId = String(approverId || "").trim();
  if (!normalizedApproverId) return null;
  const nowTime = new Date(nowIso).getTime();
  const matchedDelegation = (Array.isArray(delegations) ? delegations : []).find((delegation) => {
    if (delegation.active === false) return false;
    if (String(delegation.approverUserId || "").trim() !== normalizedApproverId) return false;
    const startTime = delegation.startDate ? new Date(`${delegation.startDate}T00:00:00`).getTime() : null;
    const endTime = delegation.endDate ? new Date(`${delegation.endDate}T23:59:59`).getTime() : null;
    if (startTime && nowTime < startTime) return false;
    if (endTime && nowTime > endTime) return false;
    return String(delegation.delegateUserId || "").trim();
  });
  if (!matchedDelegation) return null;
  const delegateUser = users.find((candidate) => candidate.id === matchedDelegation.delegateUserId) || null;
  if (!delegateUser) return null;
  return {
    id: String(matchedDelegation.id || "").trim(),
    delegateUserId: String(delegateUser.id || "").trim(),
    delegateUserName: String(delegateUser.name || "").trim(),
  };
}

function mapApprovalStep(step = {}, users = [], delegations = [], nowIso = new Date().toISOString(), index = 0) {
  const configuredApproverId = String(step.approverUserId || step.approverId || "").trim();
  const configuredApprover = configuredApproverId ? users.find((candidate) => candidate.id === configuredApproverId) || null : null;
  const delegate = resolveDelegateForApprover(configuredApproverId, delegations, users, nowIso);
  return {
    id: String(step.id || `approval-step-${index + 1}`),
    name: String(step.name || `Etapa ${index + 1}`).trim(),
    departmentId: String(step.departmentId || "").trim(),
    department: String(step.department || "").trim(),
    approverUserId: delegate?.delegateUserId || configuredApproverId,
    approverName: delegate?.delegateUserName || String(configuredApprover?.name || step.approverName || "").trim(),
    originalApproverUserId: configuredApproverId,
    originalApproverName: String(configuredApprover?.name || step.approverName || "").trim(),
    delegatedFromUserId: delegate ? configuredApproverId : "",
    delegatedFromName: delegate ? String(configuredApprover?.name || step.approverName || "").trim() : "",
    delegatedToUserId: delegate?.delegateUserId || "",
    delegatedToName: delegate?.delegateUserName || "",
    status: String(step.status || "pending").trim() || "pending",
    decidedAt: String(step.decidedAt || "").trim(),
    decidedById: String(step.decidedById || "").trim(),
    decidedByName: String(step.decidedByName || "").trim(),
    decisionReason: String(step.decisionReason || "").trim(),
  };
}

export function resolveApprovalWorkflow(ticketLike = {}, approvalRules = [], delegations = [], users = [], fallbackApproverId = "") {
  if (normalizeText(ticketLike.type) !== "requisicao") {
    return { required: false, status: "not_required", steps: [], history: [] };
  }
  const amount = Number(ticketLike.approvalAmount || ticketLike.amount || 0);
  const matchedRule = (Array.isArray(approvalRules) ? approvalRules : []).find((rule) => {
    if (!matchAutomationRule(rule, ticketLike)) return false;
    const minAmount = Number(rule.minAmount);
    const maxAmount = Number(rule.maxAmount);
    if (Number.isFinite(minAmount) && amount < minAmount) return false;
    if (Number.isFinite(maxAmount) && amount > maxAmount) return false;
    return true;
  });

  const ruleSteps = Array.isArray(matchedRule?.steps) ? matchedRule.steps : [];
  const normalizedSteps = ruleSteps
    .map((step, index) => mapApprovalStep(step, users, delegations, new Date().toISOString(), index))
    .filter((step) => step.approverUserId || step.approverName);
  if (!normalizedSteps.length && fallbackApproverId) {
    normalizedSteps.push(
      mapApprovalStep(
        {
          id: "approval-step-fallback",
          name: "Aprovacao principal",
          approverUserId: fallbackApproverId,
        },
        users,
        delegations,
      ),
    );
  }

  const currentStep = normalizedSteps[0] || null;
  const slaMinutes = Number(matchedRule?.slaMinutes) || 240;
  const dueAt = currentStep ? new Date(Date.now() + slaMinutes * 60 * 1000).toISOString() : "";
  return {
    required: true,
    status: currentStep ? "pending" : "not_required",
    ruleId: String(matchedRule?.id || "").trim(),
    ruleName: String(matchedRule?.name || "").trim(),
    amount,
    currentStepIndex: currentStep ? 0 : -1,
    currentApproverId: String(currentStep?.approverUserId || "").trim(),
    currentApproverName: String(currentStep?.approverName || "").trim(),
    slaMinutes,
    dueAt,
    steps: normalizedSteps,
    history: [],
  };
}

export function progressApprovalWorkflow(currentApproval = {}, action = "", actor = {}, users = [], delegations = []) {
  const normalizedAction = normalizeText(action);
  const nowIso = new Date().toISOString();
  const currentSteps = (Array.isArray(currentApproval.steps) ? currentApproval.steps : []).map((step, index) =>
    mapApprovalStep(step, users, delegations, nowIso, index),
  );
  const currentStepIndex = Number(currentApproval.currentStepIndex);
  const activeIndex = Number.isInteger(currentStepIndex) && currentStepIndex >= 0 ? currentStepIndex : 0;
  if (!currentSteps[activeIndex]) return currentApproval;

  const nextSteps = currentSteps.map((step, index) =>
    index === activeIndex
      ? {
          ...step,
          status: normalizedAction === "approve" ? "approved" : "rejected",
          decidedAt: nowIso,
          decidedById: String(actor.id || "").trim(),
          decidedByName: String(actor.name || "Sistema").trim(),
          decisionReason: String(currentApproval.decisionReason || "").trim(),
        }
      : step,
  );

  if (normalizedAction === "reject") {
    return {
      ...currentApproval,
      status: "rejected",
      currentStepIndex: activeIndex,
      currentApproverId: "",
      currentApproverName: "",
      decidedAt: nowIso,
      decidedById: String(actor.id || "").trim(),
      decidedByName: String(actor.name || "Sistema").trim(),
      steps: nextSteps,
    };
  }

  const nextPendingIndex = nextSteps.findIndex((step) => step.status !== "approved");
  if (nextPendingIndex === -1) {
    return {
      ...currentApproval,
      status: "approved",
      currentStepIndex: nextSteps.length - 1,
      currentApproverId: "",
      currentApproverName: "",
      decidedAt: nowIso,
      decidedById: String(actor.id || "").trim(),
      decidedByName: String(actor.name || "Sistema").trim(),
      steps: nextSteps,
      dueAt: "",
    };
  }

  const nextCurrentStep = nextSteps[nextPendingIndex];
  const slaMinutes = Number(currentApproval.slaMinutes) || 240;
  return {
    ...currentApproval,
    status: "pending",
    currentStepIndex: nextPendingIndex,
    currentApproverId: String(nextCurrentStep.approverUserId || "").trim(),
    currentApproverName: String(nextCurrentStep.approverName || "").trim(),
    steps: nextSteps,
    dueAt: new Date(Date.now() + slaMinutes * 60 * 1000).toISOString(),
  };
}

export function parseInboundEmailTicket(payload = {}, users = [], departments = [], serviceCenter = {}) {
  const fromEmail = String(payload.fromEmail || payload.email || "").trim().toLowerCase();
  const subject = String(payload.subject || "").trim();
  const body = String(payload.body || "").trim();
  const requester = users.find((candidate) => normalizeText(candidate.email) === normalizeText(fromEmail)) || null;
  const categoryHints = Array.isArray(serviceCenter?.emailIntake?.categoryHints) ? serviceCenter.emailIntake.categoryHints : [];
  const priorityHints = Array.isArray(serviceCenter?.emailIntake?.priorityHints) ? serviceCenter.emailIntake.priorityHints : [];
  const combinedText = normalizeText(`${subject} ${body}`);
  const matchedCategory = categoryHints.find((hint) => combinedText.includes(normalizeText(hint.keyword))) || null;
  const matchedPriority = priorityHints.find((hint) => combinedText.includes(normalizeText(hint.keyword))) || null;
  const fallbackDepartmentId = String(serviceCenter?.emailIntake?.defaultDepartmentId || "").trim();
  const fallbackDepartment = fallbackDepartmentId ? departments.find((department) => department.id === fallbackDepartmentId) || null : null;
  const normalizedPriority = matchedPriority?.priority || (/urgente|critico|parado/.test(combinedText) ? "Alta" : serviceCenter?.emailIntake?.defaultPriority || "Media");

  return {
    title: subject || "Chamado recebido por e-mail",
    description: body || subject || "Mensagem recebida por e-mail.",
    requester: requester?.name || fromEmail || "Solicitante por e-mail",
    requesterId: requester?.id || "",
    requesterEmail: fromEmail,
    source: "E-mail",
    category: matchedCategory?.category || "Geral",
    priority: normalizedPriority,
    urgency: normalizedPriority,
    impact: normalizedPriority,
    type: matchedCategory?.type || "Incidente",
    departmentId: fallbackDepartment?.id || "",
    department: fallbackDepartment?.name || "",
    queue: fallbackDepartment?.name || "Service Desk",
    location: matchedCategory?.location || "",
    attachments: Array.isArray(payload.attachments) ? payload.attachments : [],
  };
}
