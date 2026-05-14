import { buildStateMeta, ensureStateSchema } from "../state/schema.js";

export function createStateService({ stateRepository }) {
  async function getState() {
    const state = await stateRepository.readAppState();
    return ensureStateSchema(state);
  }

  async function saveState(nextState) {
    const persisted = await stateRepository.writeAppState(ensureStateSchema(nextState));
    return ensureStateSchema(persisted);
  }

  async function getStateEnvelope({ data, filters = null } = {}) {
    const state = await getState();
    return {
      meta: {
        ...buildStateMeta(state),
        generatedAt: new Date().toISOString(),
        filters,
      },
      data: data || state,
    };
  }

  return {
    getState,
    saveState,
    getStateEnvelope,
  };
}

