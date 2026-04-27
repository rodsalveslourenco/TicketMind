import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { seedData } from "../data/seedData";

const AuthContext = createContext(null);
const SESSION_STORAGE_KEY = "ticketmind-session";
const DATA_STORAGE_KEY = "ticketmind-data";

function normalizeAdminPassword(users) {
  return (users || []).map((candidate) =>
    candidate.email === "admin@ticketmind.local" ? { ...candidate, password: "admin0123" } : candidate,
  );
}

function readUsers() {
  const rawData = window.localStorage.getItem(DATA_STORAGE_KEY);
  if (!rawData) return normalizeAdminPassword(seedData.users);

  try {
    const parsed = JSON.parse(rawData);
    return parsed.users?.length ? normalizeAdminPassword(parsed.users) : normalizeAdminPassword(seedData.users);
  } catch {
    return normalizeAdminPassword(seedData.users);
  }
}

function readDefaultUser() {
  return readUsers().find((candidate) => candidate.email === seedData.currentUser.email) ?? seedData.currentUser;
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const rawSession = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (rawSession) {
      const storedSession = JSON.parse(rawSession);
      const currentUser = readUsers().find((candidate) => candidate.id === storedSession.user?.id);
      setSession(currentUser ? { ...storedSession, user: currentUser } : storedSession);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const syncSessionUser = () => {
      setSession((current) => {
        if (!current?.user?.id) return current;
        const currentUser = readUsers().find((candidate) => candidate.id === current.user.id);
        if (!currentUser) return current;
        const nextSession = { ...current, user: currentUser };
        window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(nextSession));
        return nextSession;
      });
    };

    window.addEventListener("storage", syncSessionUser);
    syncSessionUser();

    return () => window.removeEventListener("storage", syncSessionUser);
  }, []);

  const login = async ({ email, password }) => {
    if (!email || !password) {
      throw new Error("Preencha email e senha para continuar.");
    }

    const currentUser = readUsers().find(
      (candidate) =>
        candidate.email.toLowerCase() === email.trim().toLowerCase() && candidate.password === password,
    );

    if (!currentUser) {
      throw new Error("Credenciais invalidas.");
    }

    const nextSession = {
      token: "demo-secure-token",
      user: currentUser,
      issuedAt: new Date().toISOString(),
    };

    window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(nextSession));
    setSession(nextSession);
  };

  const logout = () => {
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
    setSession(null);
  };

  const value = useMemo(
    () => ({
      loading,
      session,
      user: session?.user ?? null,
      isAuthenticated: Boolean(session),
      login,
      logout,
      demoCredentials: {
        email: readDefaultUser().email,
        password: "",
      },
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
