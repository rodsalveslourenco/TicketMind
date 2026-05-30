import { Router } from "express";
import { hasAnyPermission } from "../../../src/data/permissions.js";
import { canAccessTicket, filterTicketsForUser } from "../../../src/data/ticketVisibility.js";
import { prepareStateForClient } from "../../notifications.js";
import { buildEnvelope } from "../envelope.js";

function sanitizeUserRecord(user) {
  if (!user || typeof user !== "object") return user;
  const { password, passwordReveal, ...rest } = user;
  return { ...rest, hasPassword: Boolean(String(password || "").trim()) };
}

function sanitizeCollectionItems(domainKey, items) {
  if (domainKey !== "users") return items;
  return (Array.isArray(items) ? items : []).map(sanitizeUserRecord);
}

function handleAsync(handler) {
  return (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}

function toCollectionEnvelope(state, domainKey, items, extraMeta = {}) {
  return buildEnvelope(
    {
      apiVersion: "v1",
      payloadVersion: state.payloadVersion,
      schemaVersion: state.schemaVersion,
      schemaUpdatedAt: state.schemaUpdatedAt,
      domain: domainKey,
      domainVersion: state.domainVersions?.[domainKey] || 1,
      ...extraMeta,
    },
    items,
  );
}

function canManageDomain(user, domainKey) {
  switch (domainKey) {
    case "tickets":
      return hasAnyPermission(user, ["tickets_edit", "tickets_create", "tickets_delete", "tickets_admin"]);
    case "users":
      return hasAnyPermission(user, [
        "users_create",
        "users_edit",
        "users_delete",
        "users_reset_password",
        "users_manage_permissions",
        "users_admin",
      ]);
    case "departments":
    case "locations":
      return hasAnyPermission(user, ["service_center_departments_manage", "service_center_manage", "users_admin"]);
    default:
      return false;
  }
}

export function createV1Router({ requireAuthenticatedUser, stateService, ticketService, collectionService, persistStateChange }) {
  const router = Router();
  const readableCollectionDomains = [
    "users",
    "departments",
    "locations",
    "assets",
    "brands",
    "models",
    "projects",
    "knowledgeArticles",
    "apiConfigs",
    "emailLayouts",
    "notificationRules",
    "notificationLogs",
    "reports",
  ];

  router.get("/meta", handleAsync(async (request, response) => {
    const auth = await requireAuthenticatedUser(request, response);
    if (!auth) return;
    const state = await stateService.getState();
    response.json(
      buildEnvelope({
        apiVersion: "v1",
        payloadVersion: state.payloadVersion,
        schemaVersion: state.schemaVersion,
        schemaUpdatedAt: state.schemaUpdatedAt,
        domainVersions: state.domainVersions,
      }),
    );
  }));

  router.get("/state", handleAsync(async (request, response) => {
    const auth = await requireAuthenticatedUser(request, response);
    if (!auth) return;
    const state = await stateService.getState();
    // Aplica o mesmo saneamento/visibilidade da rota /api/state: nunca expoe
    // senhas/segredos e filtra os chamados pelo escopo do usuario autenticado.
    const safeState = prepareStateForClient(state, auth.requestUser);
    response.json(
      buildEnvelope(
        {
          apiVersion: "v1",
          payloadVersion: state.payloadVersion,
          schemaVersion: state.schemaVersion,
          schemaUpdatedAt: state.schemaUpdatedAt,
          domainVersions: state.domainVersions,
        },
        safeState,
      ),
    );
  }));

  router.get("/tickets", handleAsync(async (request, response) => {
    const auth = await requireAuthenticatedUser(request, response);
    if (!auth) return;
    const state = await stateService.getState();
    const result = await ticketService.listTickets({
      status: String(request.query.status || "").trim(),
      priority: String(request.query.priority || "").trim(),
      assignee: String(request.query.assignee || "").trim(),
      requesterId: String(request.query.requesterId || "").trim(),
      departmentId: String(request.query.departmentId || "").trim(),
      updatedSince: String(request.query.updatedSince || "").trim(),
      q: String(request.query.q || "").trim(),
      limit: Number(request.query.limit) || 100,
    });
    const visibleItems = filterTicketsForUser(
      result.items,
      auth.requestUser,
      Array.isArray(state.departments) ? state.departments : [],
      state.serviceCenter || {},
    );
    response.json(
      buildEnvelope(
        {
          apiVersion: "v1",
          payloadVersion: result.payloadVersion,
          schemaVersion: result.schemaVersion,
          domain: "tickets",
          domainVersion: result.domainVersion,
          total: visibleItems.length,
          limit: result.limit,
        },
        visibleItems,
      ),
    );
  }));

  router.get("/tickets/:ticketId", handleAsync(async (request, response) => {
    const auth = await requireAuthenticatedUser(request, response);
    if (!auth) return;
    const state = await stateService.getState();
    const ticket = await ticketService.getTicketById(request.params.ticketId);
    if (
      !ticket ||
      !canAccessTicket(
        ticket,
        auth.requestUser,
        Array.isArray(state.departments) ? state.departments : [],
        state.serviceCenter || {},
      )
    ) {
      response.status(404).json({ error: "Chamado nao encontrado." });
      return;
    }
    response.json(toCollectionEnvelope(state, "tickets", ticket));
  }));

  for (const domainKey of readableCollectionDomains) {
    router.get(`/${domainKey}`, handleAsync(async (request, response) => {
      const auth = await requireAuthenticatedUser(request, response);
      if (!auth) return;
      const { items, state } = await collectionService.list(domainKey);
      const safeItems = sanitizeCollectionItems(domainKey, items);
      response.json(toCollectionEnvelope(state, domainKey, safeItems, { total: safeItems.length }));
    }));

    router.get(`/${domainKey}/:itemId`, handleAsync(async (request, response) => {
      const auth = await requireAuthenticatedUser(request, response);
      if (!auth) return;
      const { item, state } = await collectionService.getById(domainKey, request.params.itemId);
      if (!item) {
        response.status(404).json({ error: "Registro nao encontrado." });
        return;
      }
      const safeItem = domainKey === "users" ? sanitizeUserRecord(item) : item;
      response.json(toCollectionEnvelope(state, domainKey, safeItem));
    }));
  }

  for (const domainKey of ["tickets", "users", "departments", "locations"]) {
    router.post(`/${domainKey}`, handleAsync(async (request, response) => {
      const auth = await requireAuthenticatedUser(request, response);
      if (!auth) return;
      if (!canManageDomain(auth.requestUser, domainKey)) {
        response.status(403).json({ error: "Voce nao possui permissao para alterar este dominio." });
        return;
      }
      const result = await collectionService.prepareUpsert(domainKey, request.body || {}, { stateOverride: auth.state, avoidCollision: true });
      const persistedState = await persistStateChange({
        request,
        response,
        auth,
        nextState: result.state,
      });
      if (!persistedState) return;
      const persistedItem =
        (persistedState?.[domainKey] || []).find((candidate) => String(candidate.id || "").trim() === String(result.item.id || "").trim()) ||
        result.item;
      response.status(result.created ? 201 : 200).json(
        toCollectionEnvelope(persistedState, domainKey, persistedItem, { created: result.created }),
      );
    }));

    router.put(`/${domainKey}/:itemId`, handleAsync(async (request, response) => {
      const auth = await requireAuthenticatedUser(request, response);
      if (!auth) return;
      if (!canManageDomain(auth.requestUser, domainKey)) {
        response.status(403).json({ error: "Voce nao possui permissao para alterar este dominio." });
        return;
      }
      const result = await collectionService.prepareUpsert(
        domainKey,
        { ...(request.body || {}), id: request.params.itemId },
        { stateOverride: auth.state },
      );
      const persistedState = await persistStateChange({
        request,
        response,
        auth,
        nextState: result.state,
      });
      if (!persistedState) return;
      const persistedItem =
        (persistedState?.[domainKey] || []).find((candidate) => String(candidate.id || "").trim() === String(result.item.id || "").trim()) ||
        result.item;
      response.json(toCollectionEnvelope(persistedState, domainKey, persistedItem, { created: result.created }));
    }));

    router.delete(`/${domainKey}/:itemId`, handleAsync(async (request, response) => {
      const auth = await requireAuthenticatedUser(request, response);
      if (!auth) return;
      if (!canManageDomain(auth.requestUser, domainKey)) {
        response.status(403).json({ error: "Voce nao possui permissao para alterar este dominio." });
        return;
      }
      const result = await collectionService.prepareRemove(domainKey, request.params.itemId, { stateOverride: auth.state });
      if (!result.removed) {
        response.status(404).json({ error: "Registro nao encontrado." });
        return;
      }
      const persistedState = await persistStateChange({
        request,
        response,
        auth,
        nextState: result.state,
      });
      if (!persistedState) return;
      response.status(204).end();
    }));
  }

  return router;
}
