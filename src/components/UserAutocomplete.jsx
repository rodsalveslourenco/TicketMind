import { useEffect, useMemo, useRef, useState } from "react";

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function UserAutocomplete({
  users,
  value,
  onChange,
  placeholder = "Comece a digitar um usuario",
  filterFn,
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
    const baseUsers = filterFn ? users.filter(filterFn) : users;
    if (!normalizedQuery) return baseUsers.slice(0, 6);

    return baseUsers
      .filter((candidate) =>
        [candidate.name, candidate.email, candidate.team, candidate.department].some((field) =>
          normalizeText(field).includes(normalizedQuery),
        ),
      )
      .slice(0, 6);
  }, [filterFn, query, users]);

  return (
    <div className="autocomplete-shell" ref={shellRef}>
      <input
        onChange={(event) => {
          const nextValue = event.target.value;
          setQuery(nextValue);
          onChange(nextValue);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        placeholder={placeholder}
        value={query}
      />
      {isOpen && suggestions.length ? (
        <div className="autocomplete-list">
          {suggestions.map((candidate) => (
            <button
              className="autocomplete-item interactive-button"
              key={candidate.id}
              onClick={() => {
                setQuery(candidate.name);
                onChange(candidate.name);
                setIsOpen(false);
              }}
              type="button"
            >
              <strong>{candidate.name}</strong>
              <span>
                {candidate.email} | {candidate.team}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default UserAutocomplete;
