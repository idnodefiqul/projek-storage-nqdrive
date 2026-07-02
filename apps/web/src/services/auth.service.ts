import { apiRequest } from "../lib/client";
import type { PublicUser } from "@nqdrive/types";

export const authService = {
  getSetupStatus: async () => {
    const WORKER_BASE = (import.meta.env.VITE_WORKER_URL as string | undefined) ?? "";
    const response = await fetch(`${WORKER_BASE}/system/state`, {
      credentials: "include",
      cache: "no-store",
      headers: { "X-App-Client": "nqdrive-web" }
    });
    const json = await response.json() as { success: boolean; data: { setupCompleted: boolean } };
    if (!json.success) throw new Error("Failed to fetch setup status");
    return json.data;
  },

  setupAdmin: (input: { username: string; email: string; password: string }) =>
    apiRequest<{ user: PublicUser }>("/auth/setup", { method: "POST", body: input }),

  login: (input: { username: string; password: string }) =>
    apiRequest<{ user: PublicUser }>("/auth/login", { method: "POST", body: input }),

  logout: () => apiRequest<{ message: string }>("/auth/logout", { method: "POST" }),

  me: () => apiRequest<{ id: number; username: string; email: string }>("/me"),

  changePassword: (input: { currentPassword: string; newPassword: string }) =>
    apiRequest<{ message: string }>("/auth/change-password", { method: "POST", body: input }),
};
