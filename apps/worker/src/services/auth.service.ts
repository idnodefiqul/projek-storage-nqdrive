import { UserRepository } from "../database/user.repository";
import { SettingsRepository } from "../database/settings.repository";
import { hashPassword, verifyPassword } from "../utils/password";
import { signJwt } from "../utils/jwt";
import { SETTINGS_KEYS } from "@nqdrive/types";
import { JWT_EXPIRY_SECONDS } from "@nqdrive/shared";
import type { Env } from "../config/env";
import type { PublicUser } from "@nqdrive/types";

/**
 * Thrown when an operation is blocked by the auth state machine
 * (e.g. trying to access /setup after setup already completed, or wrong credentials).
 * Routes catch this and map it to the appropriate HTTP status (403, 401, etc.).
 */
export class AuthError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = "AuthError";
  }
}

export class AuthService {
  private readonly userRepository: UserRepository;
  private readonly settingsRepository: SettingsRepository;

  constructor(private readonly env: Env) {
    this.userRepository = new UserRepository(env.DB);
    this.settingsRepository = new SettingsRepository(env.DB);
  }

  /** Whether the first-run admin setup has already been completed. */
  async isSetupCompleted(): Promise<boolean> {
    // Source of truth is the actual row count, not just the settings flag — this way the
    // system stays consistent even if the settings row was ever manually altered.
    const userCount = await this.userRepository.count();
    return userCount > 0;
  }

  /**
   * Creates the one and only admin user. Throws 403 if setup was already completed —
   * this is the "aman" (safe) behavior agreed on: /setup must never be re-enterable once
   * an admin exists.
   */
  async setupAdmin(params: { username: string; email: string; password: string }): Promise<PublicUser> {
    const alreadyCompleted = await this.isSetupCompleted();
    if (alreadyCompleted) {
      throw new AuthError("Setup sudah pernah dilakukan. Halaman ini tidak dapat diakses lagi.", 403);
    }

    const passwordHash = await hashPassword(params.password);
    const user = await this.userRepository.create({ username: params.username, email: params.email, passwordHash });

    await this.settingsRepository.set(SETTINGS_KEYS.SETUP_COMPLETED, "true");

    return toPublicUser(user);
  }

  /** Validates credentials and returns a signed session JWT on success. */
  async login(params: { username: string; password: string }): Promise<{ token: string; user: PublicUser }> {
    const user = await this.userRepository.findByUsername(params.username) as any;

    // Deliberately generic error message + same code path whether the username doesn't
    // exist or the password is wrong, to avoid leaking which one was incorrect.
    if (!user) {
      throw new AuthError("Username atau password salah.", 401);
    }

    const isValid = await verifyPassword(params.password, user.passwordHash);
    if (!isValid) {
      throw new AuthError("Username atau password salah.", 401);
    }

    const publicId = user.publicId ?? user.adminId ?? null;
    const token = await signJwt(
      { sub: publicId ?? user.id, username: user.username, email: user.email } as any,
      this.env.JWT_SECRET,
      JWT_EXPIRY_SECONDS
    );

    return { token, user: toPublicUser(user) };
  }

  async changePassword(userId: number | string, params: { currentPassword: string; newPassword: string }): Promise<void> {
    // Support both numeric and public_id for dual-mode
    let user: any = null;
    if (typeof userId === "string" && (userId.startsWith("sadm_") || userId.startsWith("usr_"))) {
      user = await this.userRepository.findByPublicId(userId);
    } else {
      const num = Number(userId);
      if (!isNaN(num)) user = await this.userRepository.findById(num);
      else user = await this.userRepository.findByPublicId(String(userId));
    }
    if (!user) {
      throw new AuthError("User tidak ditemukan.", 404);
    }

    const isValid = await verifyPassword(params.currentPassword, user.passwordHash);
    if (!isValid) {
      throw new AuthError("Password saat ini salah.", 401);
    }

    const newPasswordHash = await hashPassword(params.newPassword);
    await this.userRepository.updatePasswordHash(user.id, newPasswordHash);
  }

  /** For 2FA login flow that already has user */
  async loginWithUser(user: any): Promise<{ token: string; user: PublicUser }> {
    const publicId = (user as any).publicId ?? (user as any).adminId ?? null;
    const token = await signJwt(
      { sub: publicId ?? user.id, username: user.username, email: user.email } as any,
      this.env.JWT_SECRET,
      JWT_EXPIRY_SECONDS
    );
    return { token, user: toPublicUser(user) };
  }
}

function toPublicUser(user: {
  id: number;
  publicId?: string | null;
  adminId?: string | null;
  userId?: string | null;
  username: string;
  email: string;
  createdAt: string;
  updatedAt: string;
}): PublicUser {
  const pub = (user as any).publicId ?? (user as any).adminId ?? null;
  return {
    id: user.id,
    adminId: pub ?? undefined,
    userId: pub ?? undefined,
    publicId: pub ?? undefined,
    username: user.username,
    email: user.email,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  } as any;
}
