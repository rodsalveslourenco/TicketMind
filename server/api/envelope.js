export function buildEnvelope(meta = {}, data = null) {
  return {
    meta: {
      generatedAt: new Date().toISOString(),
      ...meta,
    },
    data,
  };
}

