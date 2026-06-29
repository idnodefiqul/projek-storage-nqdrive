import { z } from "zod";

/**
 * Validates the first-run admin setup form.
 * Password rules are intentionally strict since this account has full control over the storage pool.
 */
export const setupAdminSchema = z.object({
  username: z
    .string()
    .min(3, "Username minimal 3 karakter")
    .max(32, "Username maksimal 32 karakter")
    .regex(/^[a-zA-Z0-9_]+$/, "Username hanya boleh huruf, angka, dan underscore"),
  password: z
    .string()
    .min(8, "Password minimal 8 karakter")
    .max(128, "Password maksimal 128 karakter"),
});

export const loginSchema = z.object({
  username: z.string().min(1, "Username wajib diisi"),
  password: z.string().min(1, "Password wajib diisi"),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Password saat ini wajib diisi"),
  newPassword: z.string().min(8, "Password baru minimal 8 karakter").max(128),
});

export type SetupAdminInput = z.infer<typeof setupAdminSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
