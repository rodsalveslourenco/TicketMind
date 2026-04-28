import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { normalizeUserPermissions } from "../data/permissions";
import { seedData } from "../data/seedData";

const AuthContext = createContext(null);
const SESSION_STORAGE_KEY = "ticketmind-session";
const DATA_STORAGE_KEY = "ticketmind-data";

function buildDefaultUsers() {
  return seedData.users.map((candidate) => ({ ...candidate, password: "admin0123" }));
}

function readUsers() {
  const rawData = window.localStorage.getItem(DATA_STORAGE_KEY);
  if (!rawData) return buildDefaultUsers();

  try {
    const parsed = JSON.parse(rawData);
    const parsedUsers = Array.isArray(parsed?.users) && parsed.users.length ? parsed.users : buildDefaultUsers();
    return parsedUsers.map((candidate) => ({
      ...candidate,
      password: candidate.password || "admin0123",
      permissions: normalizeUserPermissions(candidate.permissions || {}, candidate),
    }));
  } catch {
    return buildDefaultUsers();
  }
}

function readDefaultUser() {
  return readUsers().find((candidate) => candidate.email === seedData.currentUser.email) ?? seedData.currentUser;
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const rawData = window.localStorage.getItem(DATA_STORAGE_KEY);
    if (!rawData) {
      window.localStorage.setItem(
        DATA_STORAGE_KEY,
        JSON.stringify({
          ...seedData,
          currentUser: { ...seedData.currentUser, password: "admin0123" },
          users: buildDefaultUsers(),
        }),
      );
    }

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
        password: "admin0123",
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
