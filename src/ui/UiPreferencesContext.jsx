import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";

const UI_PREFERENCES_STORAGE_KEY = "ticketmind.ui.preferences";
const UiPreferencesContext = createContext(null);

function readStoredPreferences() {
  if (typeof window === "undefined") {
    return { density: "media", modulePreferences: {} };
  }

  try {
    const rawValue = window.localStorage.getItem(UI_PREFERENCES_STORAGE_KEY);
    const parsedValue = rawValue ? JSON.parse(rawValue) : {};
    return {
      density: ["compacta", "media", "confortavel"].includes(parsedValue?.density) ? parsedValue.density : "media",
      modulePreferences: parsedValue?.modulePreferences && typeof parsedValue.modulePreferences === "object" ? parsedValue.modulePreferences : {},
    };
  } catch {
    return { density: "media", modulePreferences: {} };
  }
}

export function UiPreferencesProvider({ children }) {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState(readStoredPreferences);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(UI_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  }, [preferences]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.uiDensity = preferences.density || "media";
  }, [preferences.density]);

  const setDensity = useCallback((density) => {
    setPreferences((current) => ({
      ...current,
      density: ["compacta", "media", "confortavel"].includes(density) ? density : "media",
    }));
  }, []);

  const getModulePreference = useCallback(
    (moduleKey, preferenceKey, fallbackValue) => {
      const userKey = String(user?.id || "anon");
      return preferences.modulePreferences?.[userKey]?.[moduleKey]?.[preferenceKey] ?? fallbackValue;
    },
    [preferences.modulePreferences, user?.id],
  );

  const setModulePreference = useCallback(
    (moduleKey, preferenceKey, value) => {
      const userKey = String(user?.id || "anon");
      setPreferences((current) => ({
        ...current,
        modulePreferences: {
          ...(current.modulePreferences || {}),
          [userKey]: {
            ...(current.modulePreferences?.[userKey] || {}),
            [moduleKey]: {
              ...(current.modulePreferences?.[userKey]?.[moduleKey] || {}),
              [preferenceKey]: value,
            },
          },
        },
      }));
    },
    [user?.id],
  );

  const contextValue = useMemo(
    () => ({
      density: preferences.density || "media",
      setDensity,
      getModulePreference,
      setModulePreference,
    }),
    [getModulePreference, preferences.density, setDensity, setModulePreference],
  );

  return <UiPreferencesContext.Provider value={contextValue}>{children}</UiPreferencesContext.Provider>;
}

export function useUiPreferences() {
  const context = useContext(UiPreferencesContext);
  if (!context) {
    throw new Error("useUiPreferences must be used within UiPreferencesProvider");
  }
  return context;
}
