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

        <div className="record-grid inventory-grid">
          {inventoryRows.map((item) => (
            <article className="record-card inventory-card" key={item.id}>
              <div>
                <strong>{item.type}</strong>
                <span>{item.manufacturer}</span>
              </div>
              <div>
                <strong>{item.model}</strong>
                <span>{item.quantity} unidade(s)</span>
              </div>
              <div className="row-stats row-stats-wrap">
                {item.serials.slice(0, 4).map((serial) => (
                  <span className="badge badge-neutral" key={serial}>
                    {serial}
                  </span>
                ))}
                {item.serials.length > 4 ? <span className="badge badge-neutral">+{item.serials.length - 4}</span> : null}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

export default InventoryPage;
