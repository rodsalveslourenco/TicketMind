function normalizeCollectionItems(items = []) {
  return Array.isArray(items) ? items.filter(Boolean) : [];
}

function getCollection(state = {}, domainKey) {
  return normalizeCollectionItems(state?.[domainKey]);
}

function buildCollectionId(domainKey, payload = {}, items = []) {
  const preferredId = String(payload?.id || "").trim();
  if (preferredId) return preferredId;
  return `${domainKey}-${items.length + 1}-${Date.now().toString(36)}`;
}

function buildUpsertResult(state = {}, domainKey, payload, { replace = false } = {}) {
  const currentItems = getCollection(state, domainKey);
  const nextId = buildCollectionId(domainKey, payload, currentItems);
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

  async function prepareUpsert(domainKey, payload, { replace = false, stateOverride = null } = {}) {
    const state = stateOverride || (await stateService.getState());
    return buildUpsertResult(state, domainKey, payload, { replace });
  }

  async function upsert(domainKey, payload, { replace = false } = {}) {
    const prepared = await prepareUpsert(domainKey, payload, { replace });
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
