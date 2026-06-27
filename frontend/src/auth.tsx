import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { router as expoRouter } from "expo-router";
import { api, clearToken, getToken, saveToken } from "./api";

export type User = {
  user_id: string;
  email: string;
  name: string;
  picture?: string | null;
  phone?: string | null;
  role: "user" | "manager";
};

export type Membership = {
  membership_id: string;
  plan_name: string;
  duration_months: number;
  amount: number;
  started_at: string;
  expires_at: string;
  payment_method: string;
  status: string;
} | null;

type Ctx = {
  user: User | null;
  membership: Membership;
  loading: boolean;
  refresh: () => Promise<void>;
  setSession: (token: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthCtx = createContext<Ctx>({} as any);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [membership, setMembership] = useState<Membership>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const token = await getToken();
    if (!token) {
      setUser(null);
      setMembership(null);
      setLoading(false);
      return;
    }
    try {
      const data = await api<{ user: User; membership: Membership }>("/auth/me");
      setUser(data.user);
      setMembership(data.membership);
    } catch {
      await clearToken();
      setUser(null);
      setMembership(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setSession = async (token: string) => {
    await saveToken(token);
    await refresh();
  };

  const logout = async () => {
    try { await api("/auth/logout", { method: "POST" }); } catch {}
    await clearToken();
    setUser(null);
    setMembership(null);
    expoRouter.replace("/");
  };

  return (
    <AuthCtx.Provider value={{ user, membership, loading, refresh, setSession, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
