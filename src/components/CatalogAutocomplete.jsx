import { useEffect, useMemo, useRef, useState } from "react";

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function CatalogAutocomplete({
  items,
  value,
  onChange,
  onSelect,
  placeholder = "Comece a digitar",
  disabled = false,
  getLabel = (item) => item?.name || "",
  getDescription = () => "",
}) {
  const [query, setQuery] = useState(value || "");
  const [isOpen, setIsOpen] = useState(false);
  const shellRef = useRef(null);

  useEffect(() => {
    setQuery(value || "");
  }, [value]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (shellRef.current && !shellRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const suggestions = useMemo(() => {
    const normalizedQuery = normalizeText(query);
    if (!normalizedQuery) return items.slice(0, 8);

    return items
      .filter((item) =>
        [getLabel(item), getDescription(item)].some((field) => normalizeText(field).includes(normalizedQuery)),
      )
      .slice(0, 8);
  }, [getDescription, getLabel, items, query]);

  return (
    <div className="autocomplete-shell" ref={shellRef}>
      <input
        disabled={disabled}
        onChange={(event) => {
          const nextValue = event.target.value;
          setQuery(nextValue);
          onChange(nextValue);
          setIsOpen(true);
        }}
        onFocus={() => {
          if (!disabled) setIsOpen(true);
        }}
        placeholder={placeholder}
        value={query}
      />
      {isOpen && suggestions.length ? (
        <div className="autocomplete-list">
          {suggestions.map((item) => (
            <button
              className="autocomplete-item interactive-button"
              key={item.id}
              onClick={() => {
                const label = getLabel(item);
                setQuery(label);
                onChange(label);
                onSelect(item);
                setIsOpen(false);
              }}
              type="button"
            >
              <strong>{getLabel(item)}</strong>
              {getDescription(item) ? <span>{getDescription(item)}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default CatalogAutocomplete;
