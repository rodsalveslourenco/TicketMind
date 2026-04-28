import { useMemo, useState } from "react";
import { useAppData } from "../data/AppDataContext";

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function buildInventoryRows(assets) {
  const buckets = new Map();

  assets.forEach((asset) => {
    const type = asset.type || "Nao informado";
    const manufacturer = asset.manufacturer || "Nao informado";
    const model = asset.model || "Nao informado";
    const key = `${type}::${manufacturer}::${model}`;

    if (!buckets.has(key)) {
      buckets.set(key, {
        id: key,
        type,
        manufacturer,
        model,
        quantity: 0,
        serials: [],
      });
    }

    const bucket = buckets.get(key);
    bucket.quantity += 1;
    bucket.serials.push(asset.serial || "Sem serie");
  });

  return Array.from(buckets.values()).sort((left, right) =>
    `${left.type} ${left.manufacturer} ${left.model}`.localeCompare(
      `${right.type} ${right.manufacturer} ${right.model}`,
    ),
  );
}

function InventoryPage() {
  const { assets } = useAppData();
  const [search, setSearch] = useState("");
  const [selectedItemId, setSelectedItemId] = useState(null);

  const inventoryRows = useMemo(() => {
    const normalizedSearch = normalizeText(search);
    const filteredAssets = assets.filter((asset) =>
      !normalizedSearch
        ? true
        : [asset.type, asset.manufacturer, asset.model, asset.serial].some((field) =>
            normalizeText(field).includes(normalizedSearch),
          ),
    );
    return buildInventoryRows(filteredAssets);
  }, [assets, search]);

  const selectedItem = inventoryRows.find((item) => item.id === selectedItemId) ?? null;

  return (
    <div className="users-page">
      <section className="module-hero board-card">
        <div>
          <span className="eyebrow">Inventario</span>
          <h2>Inventario</h2>
        </div>
        <div className="insight-strip">
          <div className="insight-chip">
            <strong>{assets.length}</strong>
            <span>ativos individuais lidos</span>
          </div>
          <div className="insight-chip">
            <strong>{inventoryRows.length}</strong>
            <span>grupos consolidados</span>
          </div>
          <div className="insight-chip">
            <strong>{new Set(inventoryRows.map((item) => item.type)).size}</strong>
            <span>tipos agrupados</span>
          </div>
        </div>
      </section>

      <section className="board-card glpi-panel">
        <div className="glpi-toolbar">
          <div>
            <h2>Consolidado de inventario</h2>
          </div>
          <div className="toolbar">
            <input
              className="toolbar-search"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por tipo, fabricante, modelo ou numero de serie"
              value={search}
            />
          </div>
        </div>

        <div className="sheet-list">
          <div className="sheet-row sheet-row-header">
            <strong>Tipo</strong>
            <strong>Marca</strong>
            <strong>Modelo</strong>
            <strong>Quantidade</strong>
            <strong>Series</strong>
          </div>
          {inventoryRows.length ? (
            inventoryRows.map((item) => (
              <button
                className="sheet-row interactive-button"
                key={item.id}
                onClick={() => setSelectedItemId(item.id)}
                type="button"
              >
                <span>{item.type}</span>
                <span>{item.manufacturer}</span>
                <span>{item.model}</span>
                <span>{item.quantity}</span>
                <div className="row-stats row-stats-wrap">
                  {item.serials.slice(0, 4).map((serial) => (
                    <span className="badge badge-neutral" key={serial}>
                      {serial}
                    </span>
                  ))}
                  {item.serials.length > 4 ? <span className="badge badge-neutral">+{item.serials.length - 4}</span> : null}
                </div>
              </button>
            ))
          ) : (
            <div className="empty-state">
              <strong>Nenhum item encontrado.</strong>
              <span>Ajuste o filtro para localizar registros do inventario.</span>
            </div>
          )}
        </div>
      </section>

      {selectedItem ? (
        <div className="ticket-modal-backdrop" onClick={() => setSelectedItemId(null)} role="presentation">
          <div className="ticket-modal board-card compact-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
            <div className="ticket-modal-header">
              <div>
                <h2>{selectedItem.type}</h2>
                <span className="modal-subtitle">
                  {selectedItem.manufacturer} | {selectedItem.model}
                </span>
              </div>
              <div className="ticket-detail-actions">
                <button className="ghost-button compact-button interactive-button" onClick={() => setSelectedItemId(null)} type="button">
                  Fechar
                </button>
              </div>
            </div>

            <div className="glpi-ticket-form compact-form">
              <div className="glpi-info-strip">
                <div>
                  <span>Tipo</span>
                  <strong>{selectedItem.type}</strong>
                </div>
                <div>
                  <span>Marca</span>
                  <strong>{selectedItem.manufacturer}</strong>
                </div>
                <div>
                  <span>Quantidade</span>
                  <strong>{selectedItem.quantity}</strong>
                </div>
              </div>

              <div className="detail-grid compact-form-grid">
                <div className="field-block">
                  <span>Modelo</span>
                  <strong>{selectedItem.model}</strong>
                </div>
                <div className="field-block field-full">
                  <span>Numeros de serie</span>
                  <div className="row-stats row-stats-wrap">
                    {selectedItem.serials.map((serial) => (
                      <span className="badge badge-neutral" key={serial}>
                        {serial}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default InventoryPage;
