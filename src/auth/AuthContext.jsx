import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { requestJson } from "../lib/api";

const AuthContext = createContext(null);
const SESSION_STORAGE_KEY = "ticketmind-session";
const PERSISTENT_STORAGE_KEY = "ticketmind-session-persistent";
const AUTH_EXPIRED_EVENT = "ticketmind:auth-expired";

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
        const payload = await requestJson("/api/auth/session");
        if (cancelled) return;
        const nextSession = {
          userId: payload?.user?.id,
          user: payload?.user ?? null,
          expiresAt: payload?.expiresAt || storedSession.expiresAt || "",
          issuedAt: storedSession.issuedAt || new Date().toISOString(),
        };
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

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleExpiredSession = () => {
      clearStoredSession();
      setSession(null);
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, handleExpiredSession);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleExpiredSession);
  }, []);

  const login = async ({ email, password }) => {
    if (!email || !password) {
      throw new Error("Preencha email e senha para continuar.");
    }

    const payload = await requestJson("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });

    const nextSession = {
      userId: payload?.user?.id,
      user: payload?.user ?? null,
      expiresAt: payload?.expiresAt || "",
      issuedAt: new Date().toISOString(),
    };

    persistSession(nextSession);
    setSession(nextSession);
  };

  const logout = async () => {
    try {
      await requestJson("/api/auth/logout", { method: "POST" });
    } catch {
      // Keep local cleanup even when server-side logout cannot be completed.
    }
    clearStoredSession();
    setSession(null);
  };

  const changePassword = async ({ currentPassword, newPassword }) => {
    const payload = await requestJson("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    });

    const nextSession = {
      userId: payload?.user?.id,
      user: payload?.user ?? null,
      expiresAt: payload?.expiresAt || session?.expiresAt || "",
      issuedAt: new Date().toISOString(),
    };

    persistSession(nextSession);
    setSession(nextSession);
    return payload;
  };

  const requestPasswordRecovery = async (email) =>
    requestJson("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    });

  const resetPassword = async ({ token, newPassword }) => {
    const payload = await requestJson("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, newPassword }),
    });

    const nextSession = {
      userId: payload?.user?.id,
      user: payload?.user ?? null,
      expiresAt: payload?.expiresAt || "",
      issuedAt: new Date().toISOString(),
    };

    persistSession(nextSession);
    setSession(nextSession);
    return payload;
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
      changePassword,
      requestPasswordRecovery,
      resetPassword,
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
