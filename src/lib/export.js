function escapeCsvValue(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeFileName(fileName, extension) {
  const trimmedName = String(fileName || "ticketmind-export").trim().replace(/\.[a-z0-9]+$/i, "");
  return `${trimmedName}.${extension}`;
}

function buildExportMatrix(columns = [], items = []) {
  const safeColumns = Array.isArray(columns) ? columns : [];
  const safeItems = Array.isArray(items) ? items : [];
  const header = safeColumns.map((column) => column.label || column.key || "");
  const rows = safeItems.map((item) =>
    safeColumns.map((column) => {
      const value = typeof column.render === "function" ? column.render(item) : item?.[column.key] ?? "";
      return value == null ? "" : value;
    }),
  );
  return [header, ...rows];
}

function downloadBlob(fileName, blob) {
  if (typeof window === "undefined") return false;
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 0);
  return true;
}

function buildTableMarkup(rows = []) {
  const [header = [], ...bodyRows] = rows;
  return `<table>
      <thead>
        <tr>${header.map((cell) => `<th>${escapeHtml(cell)}</th>`).join("")}</tr>
      </thead>
      <tbody>
        ${bodyRows
          .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
          .join("")}
      </tbody>
    </table>`;
}

function buildPrintableTable(title, rows = []) {
  const [header = [], ...bodyRows] = rows;
  const generatedAt = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date());
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      body { font-family: Arial, sans-serif; color: #0f172a; margin: 32px; }
      h1 { font-size: 20px; margin: 0 0 8px; }
      p { margin: 0 0 20px; color: #475569; font-size: 12px; }
      table { border-collapse: collapse; width: 100%; table-layout: fixed; }
      th, td { border: 1px solid #cbd5e1; padding: 8px; font-size: 11px; text-align: left; vertical-align: top; word-break: break-word; }
      th { background: #e2e8f0; font-weight: 700; }
      @media print { body { margin: 14mm; } }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(title)}</h1>
    <p>Gerado em ${escapeHtml(generatedAt)}</p>
    ${buildTableMarkup([header, ...bodyRows])}
  </body>
</html>`;
}

export function getExportFormatLabel(format = "csv") {
  const normalized = String(format || "").trim().toLowerCase();
  if (normalized === "excel") return "Excel";
  if (normalized === "pdf") return "PDF";
  return "CSV";
}

export function downloadCsv(fileName, rows = []) {
  if (!Array.isArray(rows) || !rows.length || typeof window === "undefined") return false;
  const csvContent = rows.map((row) => (Array.isArray(row) ? row : []).map(escapeCsvValue).join(",")).join("\n");
  return downloadBlob(sanitizeFileName(fileName, "csv"), new Blob([csvContent], { type: "text/csv;charset=utf-8;" }));
}

export function exportRowsAsCsv({ fileName, columns = [], items = [] }) {
  return downloadCsv(fileName, buildExportMatrix(columns, items));
}

export function exportRowsAsExcel({ fileName, sheetName = "TicketMind", columns = [], items = [] }) {
  const rows = buildExportMatrix(columns, items);
  if (!rows.length || typeof window === "undefined") return false;
  const html = `<!doctype html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
  <head>
    <meta charset="utf-8" />
    <meta name="ProgId" content="Excel.Sheet" />
    <meta name="Generator" content="TicketMind" />
    <title>${escapeHtml(sheetName)}</title>
  </head>
  <body>${buildTableMarkup(rows)}</body>
</html>`;
  return downloadBlob(
    sanitizeFileName(fileName, "xls"),
    new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8;" }),
  );
}

export function exportRowsAsPdf({ fileName, title = "Relatorio TicketMind", columns = [], items = [] }) {
  const rows = buildExportMatrix(columns, items);
  if (!rows.length || typeof window === "undefined") return false;
  const printWindow = window.open("", "_blank", "noopener,noreferrer,width=1200,height=900");
  if (!printWindow) return false;
  printWindow.document.open();
  printWindow.document.write(buildPrintableTable(title, rows));
  printWindow.document.close();
  printWindow.document.title = sanitizeFileName(fileName, "pdf");
  printWindow.focus();
  window.setTimeout(() => {
    printWindow.print();
  }, 200);
  return true;
}

export function exportRowsWithFormat({ format = "csv", fileName, title, sheetName, columns = [], items = [] }) {
  const normalized = String(format || "").trim().toLowerCase();
  if (normalized === "excel") {
    return exportRowsAsExcel({ fileName, sheetName: sheetName || title || fileName, columns, items });
  }
  if (normalized === "pdf") {
    return exportRowsAsPdf({ fileName, title: title || fileName, columns, items });
  }
  return exportRowsAsCsv({ fileName, columns, items });
}
