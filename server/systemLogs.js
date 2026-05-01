function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function nextLogId() {
  return `syslog-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function cleanObject(value) {
  if (Array.isArray(value)) {
    return value.map(cleanObject);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.entries(value).reduce((accumulator, [key, entryValue]) => {
    const normalizedKey = normalizeText(key);
    if (
      normalizedKey.includes("password") ||
      normalizedKey.includes("senha") ||
      normalizedKey.includes("token") ||
      normalizedKey.includes("secret") ||
      normalizedKey.includes("apikey") ||
      normalizedKey.includes("authorization")
    ) {
      return accumulator;
    }

    return {
      ...accumulator,
      [key]: cleanObject(entryValue),
    };
  }, {});
}

function summarizeChanges(previousRecord = {}, nextRecord = {}, allowedKeys = []) {
  return allowedKeys.reduce((accumulator, key) => {
    const previousValue = previousRecord?.[key];
    const nextValue = nextRecord?.[key];
    if (JSON.stringify(previousValue) === JSON.stringify(nextValue)) return accumulator;
    return [...accumulator, { field: key, from: previousValue, to: nextValue }];
  }, []);
}

function buildLogEntry(payload = {}) {
  return {
    id: payload.id || nextLogId(),
    occurredAt: payload.occurredAt || new Date().toISOString(),
    userId: String(payload.userId || "").trim(),
    userName: String(payload.userName || "Sistema").trim() || "Sistema",
    userDepartment: String(payload.userDepartment || "").trim(),
    module: String(payload.module || "sistema").trim() || "sistema",
    eventType: String(payload.eventType || "alteracao").trim() || "alteracao",
    description: String(payload.description || "").trim() || "Evento registrado.",
    origin: String(payload.origin || "").trim(),
    status: String(payload.status || "sucesso").trim() || "sucesso",
    metadata: cleanObject(payload.metadata || {}),
  };
}

export function getRequestOrigin(request) {
  const forwardedFor = String(request.headers["x-forwarded-for"] || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)[0];
  return (
    forwardedFor ||
    String(request.ip || "").trim() ||
    String(request.socket?.remoteAddress || "").trim() ||
    "desconhecido"
  );
}

export function isTiDepartmentUser(user) {
  return normalizeText(user?.department) === "ti";
}

export function buildActorFromUser(user, fallback = {}) {
  return {
    userId: String(user?.id || fallback.userId || "").trim(),
    userName: String(user?.name || fallback.userName || "Sistema").trim() || "Sistema",
    userDepartment: String(user?.department || fallback.userDepartment || "").trim(),
  };
}

export function createSystemLog(payload = {}) {
  return buildLogEntry(payload);
}

export function collectStateAuditLogs(previousState = {}, nextState = {}, actor = {}, origin = "") {
  const logs = [];
  const base = {
    ...actor,
    origin,
    occurredAt: new Date().toISOString(),
  };

  const register = (payload) => {
    logs.push(buildLogEntry({ ...base, ...payload }));
  };

  const diffCollection = (module, previousItems = [], nextItems = [], handlers = {}) => {
    const previousMap = new Map((Array.isArray(previousItems) ? previousItems : []).map((item) => [item.id, item]));
    const nextMap = new Map((Array.isArray(nextItems) ? nextItems : []).map((item) => [item.id, item]));

    for (const [id, nextItem] of nextMap.entries()) {
      const previousItem = previousMap.get(id);
      if (!previousItem) {
        handlers.onCreate?.(nextItem, register);
        continue;
      }
      handlers.onUpdate?.(previousItem, nextItem, register);
    }

    for (const [id, previousItem] of previousMap.entries()) {
      if (!nextMap.has(id)) {
        handlers.onDelete?.(previousItem, register);
      }
    }
  };

  diffCollection("tickets", previousState.tickets, nextState.tickets, {
    onCreate: (ticket, push) =>
      push({
        module: "chamados",
        eventType: "chamado",
        description: `Chamado ${ticket.id} criado: ${ticket.title}`,
        metadata: { ticketId: ticket.id, action: "create" },
      }),
    onUpdate: (previousTicket, nextTicket, push) => {
      const changes = summarizeChanges(previousTicket, nextTicket, [
        "title",
        "status",
        "priority",
        "assignee",
        "queue",
        "departmentId",
        "department",
        "category",
        "location",
        "resolutionNotes",
      ]);
      if (!changes.length) return;

      push({
        module: "chamados",
        eventType: "chamado",
        description: `Chamado ${nextTicket.id} atualizado: ${changes.map((change) => change.field).join(", ")}`,
        metadata: { ticketId: nextTicket.id, action: "update", changes },
      });
    },
    onDelete: (ticket, push) =>
      push({
        module: "chamados",
        eventType: "chamado",
        description: `Chamado ${ticket.id} excluido: ${ticket.title}`,
        metadata: { ticketId: ticket.id, action: "delete" },
        status: "alerta",
      }),
  });

  diffCollection("users", previousState.users, nextState.users, {
    onCreate: (record, push) =>
      push({
        module: "usuarios",
        eventType: "inclusao",
        description: `Usuario criado: ${record.name} (${record.email})`,
        metadata: { userId: record.id, action: "create" },
      }),
    onUpdate: (previousRecord, nextRecord, push) => {
      const profileChanges = summarizeChanges(previousRecord, nextRecord, ["name", "email", "role", "team", "department", "status", "permissionProfileId"]);
      if (profileChanges.length) {
        push({
          module: "usuarios",
          eventType: "alteracao",
          description: `Usuario atualizado: ${nextRecord.name}`,
          metadata: { userId: nextRecord.id, action: "update", changes: profileChanges },
        });
      }

      const permissionChanges = summarizeChanges(previousRecord, nextRecord, ["permissions", "additionalPermissions", "restrictedPermissions"]);
      if (permissionChanges.length) {
        push({
          module: "usuarios",
          eventType: "permissao",
          description: `Permissoes alteradas para ${nextRecord.name}`,
          metadata: { userId: nextRecord.id, action: "permissions", changes: permissionChanges },
          status: "alerta",
        });
      }
    },
    onDelete: (record, push) =>
      push({
        module: "usuarios",
        eventType: "exclusao",
        description: `Usuario excluido: ${record.name} (${record.email})`,
        metadata: { userId: record.id, action: "delete" },
        status: "alerta",
      }),
  });

  diffCollection("locations", previousState.locations, nextState.locations, {
    onCreate: (record, push) =>
      push({
        module: "localizacoes",
        eventType: "inclusao",
        description: `Localizacao criada: ${record.name}`,
        metadata: { locationId: record.id, action: "create" },
      }),
    onUpdate: (previousRecord, nextRecord, push) => {
      const changes = summarizeChanges(previousRecord, nextRecord, ["name", "code", "departmentId", "department", "status"]);
      if (!changes.length) return;
      push({
        module: "localizacoes",
        eventType: "alteracao",
        description: `Localizacao atualizada: ${nextRecord.name}`,
        metadata: { locationId: nextRecord.id, action: "update", changes },
      });
    },
    onDelete: (record, push) =>
      push({
        module: "localizacoes",
        eventType: "exclusao",
        description: `Localizacao excluida: ${record.name}`,
        metadata: { locationId: record.id, action: "delete" },
        status: "alerta",
      }),
  });

  diffCollection("permissionProfiles", previousState.permissionProfiles, nextState.permissionProfiles, {
    onCreate: (record, push) =>
      push({
        module: "perfis",
        eventType: "inclusao",
        description: `Perfil criado: ${record.name}`,
        metadata: { profileId: record.id, action: "create" },
      }),
    onUpdate: (previousRecord, nextRecord, push) => {
      const changes = summarizeChanges(previousRecord, nextRecord, ["name", "description", "status", "permissions"]);
      if (!changes.length) return;
      push({
        module: "perfis",
        eventType: changes.some((change) => change.field === "permissions") ? "permissao" : "alteracao",
        description: `Perfil atualizado: ${nextRecord.name}`,
        metadata: { profileId: nextRecord.id, action: "update", changes },
        status: changes.some((change) => change.field === "permissions") ? "alerta" : "sucesso",
      });
    },
    onDelete: (record, push) =>
      push({
        module: "perfis",
        eventType: "exclusao",
        description: `Perfil excluido: ${record.name}`,
        metadata: { profileId: record.id, action: "delete" },
        status: "alerta",
      }),
  });

  diffCollection("notificationRules", previousState.notificationRules, nextState.notificationRules, {
    onCreate: (record, push) =>
      push({
        module: "notificacoes",
        eventType: "notificacao",
        description: `Regra de notificacao criada para ${record.eventKey}`,
        metadata: { ruleId: record.id, action: "create" },
      }),
    onUpdate: (previousRecord, nextRecord, push) => {
      const changes = summarizeChanges(previousRecord, nextRecord, ["active", "recipientUserIds", "externalEmails", "layoutId"]);
      if (!changes.length) return;
      push({
        module: "notificacoes",
        eventType: "notificacao",
        description: `Regra de notificacao alterada para ${nextRecord.eventKey}`,
        metadata: { ruleId: nextRecord.id, action: "update", changes },
      });
    },
    onDelete: (record, push) =>
      push({
        module: "notificacoes",
        eventType: "notificacao",
        description: `Regra de notificacao removida de ${record.eventKey}`,
        metadata: { ruleId: record.id, action: "delete" },
        status: "alerta",
      }),
  });

  const configChanges = summarizeChanges(previousState, nextState, [
    "smtpSettings",
    "emailServiceSettings",
    "apiConfigs",
    "emailLayouts",
    "departments",
    "serviceCenter",
    "navigationSections",
  ]);

  configChanges.forEach((change) => {
    const isServiceCenter = change.field === "serviceCenter";
    register({
      module: isServiceCenter ? "central_servicos" : "configuracoes",
      eventType:
        isServiceCenter ||
        change.field === "emailLayouts" ||
        change.field === "smtpSettings" ||
        change.field === "emailServiceSettings"
          ? "configuracao"
          : "alteracao",
      description: isServiceCenter
        ? "Configuracao da Central de Servicos alterada"
        : `Configuracao alterada em ${change.field}`,
      metadata: { field: change.field, changes: cleanObject([change]) },
    });
  });

  return logs;
}
