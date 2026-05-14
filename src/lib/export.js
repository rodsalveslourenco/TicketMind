function escapeCsvValue(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export function downloadCsv(fileName, rows = []) {
  if (!Array.isArray(rows) || !rows.length || typeof window === "undefined") return false;

  const csvContent = rows.map((row) => (Array.isArray(row) ? row : []).map(escapeCsvValue).join(",")).join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.URL.revokeObjectURL(url);
  return true;
}

export function exportRowsAsCsv({ fileName, columns = [], items = [] }) {
  const header = columns.map((column) => column.label || column.key || "");
  const rows = (Array.isArray(items) ? items : []).map((item) =>
    columns.map((column) => {
      if (typeof column.render === "function") return column.render(item);
      return item?.[column.key] ?? "";
    }),
  );

  return downloadCsv(fileName, [header, ...rows]);
}
