import { createContext, useContext, useEffect, useMemo, useState } from "react";

const AuthContext = createContext(null);
const STORAGE_KEY = "ticketmind-session";

const demoUser = {
  id: "u-001",
  name: "Rodrigo Alves",
  email: "admin@ticketmind.local",
  role: "Administrador",
  team: "Suporte e operações",
};

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const rawSession = window.sessionStorage.getItem(STORAGE_KEY);
    if (rawSession) {
      setSession(JSON.parse(rawSession));
    }
    setLoading(false);
  }, []);

  const login = async ({ email, password }) => {
    if (!email || !password) {
      throw new Error("Preencha email e senha para continuar.");
    }

    if (email !== demoUser.email || password !== "TicketMind@2026") {
      throw new Error("Credenciais inválidas. Use o acesso de demonstração.");
    }

    const nextSession = {
      token: "demo-secure-token",
      user: demoUser,
      issuedAt: new Date().toISOString(),
    };

    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(nextSession));
    setSession(nextSession);
  };

  const logout = () => {
    window.sessionStorage.removeItem(STORAGE_KEY);
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
        email: demoUser.email,
        password: "TicketMind@2026",
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
