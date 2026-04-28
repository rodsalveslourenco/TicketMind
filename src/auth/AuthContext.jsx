import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { requestJson } from "../lib/api";

const AuthContext = createContext(null);
const SESSION_STORAGE_KEY = "ticketmind-session";

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      const rawSession = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (!rawSession) {
        if (!cancelled) setLoading(false);
        return;
      }

      try {
        const storedSession = JSON.parse(rawSession);
        if (!storedSession?.userId) {
          window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
          if (!cancelled) setLoading(false);
          return;
        }

        const user = await requestJson(`/api/auth/session/${storedSession.userId}`);
        if (cancelled) return;
        setSession({ ...storedSession, user });
      } catch {
        window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
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

    window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(nextSession));
    setSession(nextSession);
  };

  const logout = () => {
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
    setSession(null);
  };

  const setSessionUser = (nextUser) => {
    if (!nextUser?.id) return;
    setSession((current) => {
      if (!current?.userId || current.userId !== nextUser.id) return current;
      const nextSession = { ...current, user: nextUser };
      window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(nextSession));
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
