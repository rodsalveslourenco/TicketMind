export function normalizeDepartmentColor(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (!normalized) return "";
  const withHash = normalized.startsWith("#") ? normalized : `#${normalized}`;
  return /^#([0-9A-F]{6}|[0-9A-F]{3})$/.test(withHash) ? withHash : "";
}

export function getDepartmentColorStyle(color, options = {}) {
  const normalizedColor = normalizeDepartmentColor(color);
  if (!normalizedColor) return {};
  const alpha = Number.isFinite(options.alpha) ? options.alpha : 0.14;
  return {
    "--department-color": normalizedColor,
    background: `color-mix(in srgb, ${normalizedColor} ${Math.round(alpha * 100)}%, white)`,
    borderColor: `color-mix(in srgb, ${normalizedColor} 55%, white)`,
    color: "inherit",
  };
}
