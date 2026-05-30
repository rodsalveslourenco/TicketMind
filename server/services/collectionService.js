function normalizeCollectionItems(items = []) {
  return Array.isArray(items) ? items.filter(Boolean) : [];
}

function getCollection(state = {}, domainKey) {
  return normalizeCollectionItems(state?.[domainKey]);
}

const TICKET_TYPE_PREFIX = { incidente: "INC", requisicao: "REQ", problema: "PRB" };

function normalizePrefix(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z]/g, "");
}

function deriveTicketPrefix(payload = {}) {
  const fromId = normalizePrefix(String(payload?.id || "").split("-")[0]);
  if (fromId) return fromId;
  const type = String(payload?.type || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  return TICKET_TYPE_PREFIX[type] || "TCK";
}

function randomSuffix() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// Gera um ID que NAO colide com nenhum item existente. Para chamados mantem o
// formato legivel PREFIXO-NNNN baseado no maior numero ja existente do prefixo.
function generateUniqueId(domainKey, payload, items) {
  const existing = new Set(items.map((item) => String(item?.id || "").trim()).filter(Boolean));
  if (domainKey === "tickets") {
    const prefix = deriveTicketPrefix(payload);
    let max = 2048;
    for (const id of existing) {
      const match = /^([A-Z]+)-(\d+)$/.exec(id);
      if (match && match[1] === prefix) max = Math.max(max, Number(match[2]));
    }
    let next = max + 1;
    let candidate = `${prefix}-${String(next).padStart(4, "0")}`;
    while (existing.has(candidate)) {
      next += 1;
      candidate = `${prefix}-${String(next).padStart(4, "0")}`;
    }
    return candidate;
  }
  let candidate = `${domainKey}-${randomSuffix()}`;
  while (existing.has(candidate)) candidate = `${domainKey}-${randomSuffix()}`;
  return candidate;
}

function buildCollectionId(domainKey, payload = {}, items = [], { avoidCollision = false } = {}) {
  const preferredId = String(payload?.id || "").trim();
  if (preferredId) {
    const collides = items.some((item) => String(item?.id || "").trim() === preferredId);
    // Em criacao (avoidCollision), nunca reutiliza um ID existente: isso
    // sobrescreveria silenciosamente um registro real (ex.: outro chamado).
    if (!collides || !avoidCollision) return preferredId;
    return generateUniqueId(domainKey, payload, items);
  }
  return generateUniqueId(domainKey, payload, items);
}

function buildUpsertResult(state = {}, domainKey, payload, { replace = false, avoidCollision = false } = {}) {
  const currentItems = getCollection(state, domainKey);
  const nextId = buildCollectionId(domainKey, payload, currentItems, { avoidCollision });
  const existingIndex = currentItems.findIndex((candidate) => String(candidate.id || "").trim() === nextId);
  const nowIso = new Date().toISOString();
  const currentItem = existingIndex >= 0 ? currentItems[existingIndex] : null;
  const nextItem = {
    ...(replace ? {} : currentItem || {}),
    ...(payload && typeof payload === "object" ? payload : {}),
    id: nextId,
    createdAt: currentItem?.createdAt || payload?.createdAt || nowIso,
    updatedAt: payload?.updatedAt || nowIso,
  };
  const nextItems =
    existingIndex >= 0
      ? currentItems.map((candidate, index) => (index === existingIndex ? nextItem : candidate))
      : [nextItem, ...currentItems];

  return {
    item: nextItem,
    state: {
      ...state,
      [domainKey]: nextItems,
    },
    created: existingIndex === -1,
  };
}

function buildRemoveResult(state = {}, domainKey, itemId) {
  const currentItems = getCollection(state, domainKey);
  const nextItems = currentItems.filter((candidate) => String(candidate.id || "").trim() !== String(itemId || "").trim());
  const removed = nextItems.length !== currentItems.length;

  return {
    removed,
    state: removed
      ? {
          ...state,
          [domainKey]: nextItems,
        }
      : state,
  };
}

export function createCollectionService({ stateService }) {
  async function list(domainKey) {
    const state = await stateService.getState();
    return {
      items: getCollection(state, domainKey),
      state,
    };
  }

  async function getById(domainKey, itemId) {
    const state = await stateService.getState();
    const item = getCollection(state, domainKey).find((candidate) => String(candidate.id || "").trim() === String(itemId || "").trim()) || null;
    return { item, state };
  }

  async function prepareUpsert(domainKey, payload, { replace = false, stateOverride = null, avoidCollision = false } = {}) {
    const state = stateOverride || (await stateService.getState());
    return buildUpsertResult(state, domainKey, payload, { replace, avoidCollision });
  }

  async function upsert(domainKey, payload, { replace = false, avoidCollision = false } = {}) {
    const prepared = await prepareUpsert(domainKey, payload, { replace, avoidCollision });
    const persistedState = await stateService.saveState(prepared.state);

    return {
      item:
        (persistedState?.[domainKey] || []).find((candidate) => String(candidate.id || "").trim() === String(prepared.item.id || "").trim()) ||
        prepared.item,
      state: persistedState,
      created: prepared.created,
    };
  }

  async function prepareRemove(domainKey, itemId, { stateOverride = null } = {}) {
    const state = stateOverride || (await stateService.getState());
    return buildRemoveResult(state, domainKey, itemId);
  }

  async function remove(domainKey, itemId) {
    const prepared = await prepareRemove(domainKey, itemId);
    const persistedState = prepared.removed ? await stateService.saveState(prepared.state) : prepared.state;

    return {
      removed: prepared.removed,
      state: persistedState,
    };
  }

  return {
    list,
    getById,
    prepareUpsert,
    upsert,
    prepareRemove,
    remove,
  };
}
