// Fonte unica de verdade para visibilidade de chamados (compartilhada entre
// frontend e servidor). Centraliza as regras para evitar divergencia entre as
// duas camadas, que antes mantinham copias quase identicas (e ja divergentes).
//
// Modelo de visibilidade (definido pelos perfis padrao):
//   - Visao global  -> SOMENTE o administrador do sistema (Administrador da
//       Plataforma / perfil profile-admin).
//   - Visao por setor -> quem possui service_center_view_department_tickets
//       ou service_center_attend_linked_departments, limitado ao(s) seu(s)
//       departamento(s) e aos departamentos vinculados (responsavel no Service Center).
//   - Visao propria  -> quem possui tickets_view_own ve apenas os chamados
//       em que e o solicitante.

import { normalizeText } from "./helpdesk.js";
import { canViewOwnTickets, hasAnyPermission, isSystemAdministrator } from "./permissions.js";

const DEPARTMENT_VIEW_PERMISSIONS = [
  "service_center_view_department_tickets",
  "service_center_attend_linked_departments",
  "tickets_admin",
];

function getDepartmentConfig(serviceCenter, departmentId) {
  const id = String(departmentId || "").trim();
  const config = (id && serviceCenter && serviceCenter.departments && serviceCenter.departments[id]) || {};
  return {
    active: config.active !== false,
    responsibleUserIds: Array.isArray(config.responsibleUserIds)
      ? config.responsibleUserIds.map((value) => String(value || "").trim()).filter(Boolean)
      : [],
  };
}

export function isGlobalTicketViewer(user) {
  // Apenas o administrador do sistema enxerga todos os chamados de todos os
  // setores. Demais perfis sao limitados ao proprio escopo (setor + proprios).
  if (!user) return false;
  return isSystemAdministrator(user);
}

// Mantido como alias para compatibilidade com chamadas existentes.
export function canViewAllTicketsForUser(user) {
  return isGlobalTicketViewer(user);
}

export function getScopedDepartments(user, departments = [], serviceCenter = {}) {
  const ids = new Set();
  const names = new Set();
  if (!user) return { ids, names };
  const list = Array.isArray(departments) ? departments : [];
  const userId = String(user.id || "").trim();

  const addDepartment = (department) => {
    if (!department) return;
    const status = normalizeText(department.status);
    if (status && status !== "ativo") return;
    const config = getDepartmentConfig(serviceCenter, department.id);
    if (!config.active) return;
    const id = String(department.id || "").trim();
    if (id) ids.add(id);
    if (department.name) names.add(normalizeText(department.name));
  };

  const userDepartmentId = String(user.departmentId || "").trim();
  if (userDepartmentId) {
    addDepartment(list.find((candidate) => String(candidate.id || "") === userDepartmentId));
  }

  for (const department of list) {
    const config = getDepartmentConfig(serviceCenter, department.id);
    if (userId && config.responsibleUserIds.includes(userId)) {
      addDepartment(department);
    }
  }

  // Garante que o proprio departamento do usuario (por nome) esteja no escopo,
  // cobrindo chamados antigos que guardam apenas o nome do setor.
  const userDepartmentName = normalizeText(user.department);
  if (userDepartmentName) names.add(userDepartmentName);

  return { ids, names };
}

export function getScopedDepartmentIds(user, departments = [], serviceCenter = {}) {
  return Array.from(getScopedDepartments(user, departments, serviceCenter).ids);
}

export function getLinkedDepartmentIds(user, departments = [], serviceCenter = {}) {
  if (!user || !user.id) return [];
  const userId = String(user.id || "").trim();
  return (Array.isArray(departments) ? departments : [])
    .filter((department) => {
      const config = getDepartmentConfig(serviceCenter, department.id);
      return config.active && config.responsibleUserIds.includes(userId);
    })
    .map((department) => String(department.id || "").trim())
    .filter(Boolean);
}

export function canViewDepartmentTicketsForUser(user, departments = [], serviceCenter = {}) {
  if (!user) return false;
  if (!hasAnyPermission(user, DEPARTMENT_VIEW_PERMISSIONS)) return false;
  const scope = getScopedDepartments(user, departments, serviceCenter);
  return scope.ids.size > 0 || scope.names.size > 0;
}

function ticketMatchesScope(ticket, scope) {
  const departmentId = String(ticket?.departmentId || "").trim();
  if (departmentId && scope.ids.has(departmentId)) return true;
  const departmentName = normalizeText(ticket?.department);
  return Boolean(departmentName && scope.names.has(departmentName));
}

function ticketBelongsToUser(ticket, user) {
  const requesterId = String(ticket?.requesterId || "").trim();
  return Boolean(requesterId && requesterId === String(user?.id || "").trim());
}

export function canAccessTicket(ticket, user, departments = [], serviceCenter = {}) {
  if (!ticket || !user) return false;
  if (isGlobalTicketViewer(user)) return true;
  if (canViewOwnTickets(user) && ticketBelongsToUser(ticket, user)) return true;
  if (!canViewDepartmentTicketsForUser(user, departments, serviceCenter)) return false;
  return ticketMatchesScope(ticket, getScopedDepartments(user, departments, serviceCenter));
}

export function filterTicketsForUser(tickets = [], user = null, departments = [], serviceCenter = {}) {
  if (!user) return [];
  const list = Array.isArray(tickets) ? tickets : [];
  if (isGlobalTicketViewer(user)) return list;

  const scope = getScopedDepartments(user, departments, serviceCenter);
  const canViewDepartment = canViewDepartmentTicketsForUser(user, departments, serviceCenter);
  const canViewOwn = canViewOwnTickets(user);
  if (!canViewOwn && !canViewDepartment) return [];

  return list.filter((ticket) => {
    if (canViewOwn && ticketBelongsToUser(ticket, user)) return true;
    if (!canViewDepartment) return false;
    return ticketMatchesScope(ticket, scope);
  });
}
