import { Router } from "express";
import { hasAnyPermission } from "../../../src/data/permissions.js";
import { buildEnvelope } from "../envelope.js";

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

  router.get("/meta", async (request, response) => {
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
  });

  router.get("/state", async (request, response) => {
    const auth = await requireAuthenticatedUser(request, response);
    if (!auth) return;
    const state = await stateService.getState();
    response.json(
      buildEnvelope(
        {
          apiVersion: "v1",
          payloadVersion: state.payloadVersion,
          schemaVersion: state.schemaVersion,
          schemaUpdatedAt: state.schemaUpdatedAt,
          domainVersions: state.domainVersions,
        },
        state,
      ),
    );
  });

  router.get("/tickets", async (request, response) => {
    const auth = await requireAuthenticatedUser(request, response);
    if (!auth) return;
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
    response.json(
      buildEnvelope(
        {
          apiVersion: "v1",
          payloadVersion: result.payloadVersion,
          schemaVersion: result.schemaVersion,
          domain: "tickets",
          domainVersion: result.domainVersion,
          total: result.total,
          limit: result.limit,
        },
        result.items,
      ),
    );
  });

  router.get("/tickets/:ticketId", async (request, response) => {
    const auth = await requireAuthenticatedUser(request, response);
    if (!auth) return;
    const state = await stateService.getState();
    const ticket = await ticketService.getTicketById(request.params.ticketId);
    if (!ticket) {
      response.status(404).json({ error: "Chamado nao encontrado." });
      return;
    }
    response.json(toCollectionEnvelope(state, "tickets", ticket));
  });

  for (const domainKey of readableCollectionDomains) {
    router.get(`/${domainKey}`, async (request, response) => {
      const auth = await requireAuthenticatedUser(request, response);
      if (!auth) return;
      const { items, state } = await collectionService.list(domainKey);
      response.json(toCollectionEnvelope(state, domainKey, items, { total: items.length }));
    });

    router.get(`/${domainKey}/:itemId`, async (request, response) => {
      const auth = await requireAuthenticatedUser(request, response);
      if (!auth) return;
      const { item, state } = await collectionService.getById(domainKey, request.params.itemId);
      if (!item) {
        response.status(404).json({ error: "Registro nao encontrado." });
        return;
      }
      response.json(toCollectionEnvelope(state, domainKey, item));
    });
  }

  for (const domainKey of ["tickets", "users", "departments", "locations"]) {
    router.post(`/${domainKey}`, async (request, response) => {
      const auth = await requireAuthenticatedUser(request, response);
      if (!auth) return;
      if (!canManageDomain(auth.requestUser, domainKey)) {
        response.status(403).json({ error: "Voce nao possui permissao para alterar este dominio." });
        return;
      }
      const result = await collectionService.prepareUpsert(domainKey, request.body || {}, { stateOverride: auth.state });
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
    });

    router.put(`/${domainKey}/:itemId`, async (request, response) => {
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
    });

    router.delete(`/${domainKey}/:itemId`, async (request, response) => {
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
    });
  }

  return router;
}
