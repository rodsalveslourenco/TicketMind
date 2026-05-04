import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { requestJson } from "../lib/api";

const AuthContext = createContext(null);
const SESSION_STORAGE_KEY = "ticketmind-session";
const PERSISTENT_STORAGE_KEY = "ticketmind-session-persistent";

function parseStoredSession(rawSession) {
  if (!rawSession) return null;
  try {
    return JSON.parse(rawSession);
  } catch {
    return null;
  }
}

function readStoredSession() {
  if (typeof window === "undefined") return null;
  const persistentSession = parseStoredSession(window.localStorage.getItem(PERSISTENT_STORAGE_KEY));
  if (persistentSession?.userId) return persistentSession;
  const transientSession = parseStoredSession(window.sessionStorage.getItem(SESSION_STORAGE_KEY));
  if (!transientSession?.userId) return null;
  window.localStorage.setItem(PERSISTENT_STORAGE_KEY, JSON.stringify(transientSession));
  window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
  return transientSession;
}

function clearStoredSession() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
  window.localStorage.removeItem(PERSISTENT_STORAGE_KEY);
}

function persistSession(nextSession) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PERSISTENT_STORAGE_KEY, JSON.stringify(nextSession));
  window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      const storedSession = readStoredSession();
      if (!storedSession) {
        if (!cancelled) setLoading(false);
        return;
      }

      try {
        const user = await requestJson(`/api/auth/session/${storedSession.userId}`);
        if (cancelled) return;
        const nextSession = { ...storedSession, user };
        persistSession(nextSession);
        setSession(nextSession);
      } catch {
        clearStoredSession();
        if (!cancelled) setSession(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = async ({ email, password }) => {
    if (!email || !password) {
      throw new Error("Preencha email e senha para continuar.");
    }

    const user = await requestJson("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });

    const nextSession = {
      token: "ticketmind-session",
      userId: user.id,
      user,
      issuedAt: new Date().toISOString(),
    };

    persistSession(nextSession);
    setSession(nextSession);
  };

  const logout = () => {
    clearStoredSession();
    setSession(null);
  };

  const setSessionUser = (nextUser) => {
    if (!nextUser?.id) return;
    setSession((current) => {
      if (!current?.userId || current.userId !== nextUser.id) return current;
      const nextSession = { ...current, user: nextUser };
      persistSession(nextSession);
      return nextSession;
    });
  };

  const value = useMemo(
    () => ({
      loading,
      session,
      user: session?.user ?? null,
      isAuthenticated: Boolean(session),
      login,
      logout,
      setSessionUser,
    }),
    [loading, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
