import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL || "";

const TOKEN_KEY = "paul_session_token";

export async function saveToken(token: string) {
  if (Platform.OS === "web") {
    try { window.localStorage.setItem(TOKEN_KEY, token); } catch {}
  } else {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  }
}

export async function getToken(): Promise<string | null> {
  if (Platform.OS === "web") {
    try { return window.localStorage.getItem(TOKEN_KEY); } catch { return null; }
  }
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function clearToken() {
  if (Platform.OS === "web") {
    try { window.localStorage.removeItem(TOKEN_KEY); } catch {}
  } else {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  }
}

export async function api<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers as Record<string, string> | undefined),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE}/api${path}`, { ...opts, headers });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    // 401s after logout (or stale session) shouldn't bubble up as crashes.
    if (res.status === 401) {
      await clearToken();
      const err: any = new Error((data && data.detail) || "Unauthorized");
      err.status = 401;
      err.silent = true;
      throw err;
    }
    const msg = (data && data.detail) || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data as T;
}
