import { apiRequest } from "../lib/api-client";
import type { PublicUser } from "@nqdrive/types";

export const authService = {
  getSetupStatus: () => apiRequest<{ setupCompleted: boolean }>("/auth/setup-status"),

  setupAdmin: (input: { username: string; email: string; password: string }) =>
    apiRequest<{ user: PublicUser }>("/auth/setup", { method: "POST", body: input }),

  login: (input: { username: string; password: string }) =>
    apiRequest<{ user: PublicUser }>("/auth/login", { method: "POST", body: input }),

  logout: () => apiRequest<{ message: string }>("/auth/logout", { method: "POST" }),

  me: () => apiRequest<{ id: number; username: string; email: string }>("/auth/me"),

  changePassword: (input: { currentPassword: string; newPassword: string }) =>
    apiRequest<{ message: string }>("/auth/change-password", { method: "POST", body: input }),
};
