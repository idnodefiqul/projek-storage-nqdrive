import type { Context, Next } from "hono";
import { AuthService } from "../services/auth.service";
import type { Env } from "../config/env";

/**
 * Guards the /api/auth/setup endpoint specifically.
 *
 * Agreed behavior: once the admin account has been created, /setup must return 403
 * Forbidden on every subsequent attempt — it should look like the endpoint simply
 * doesn't exist for further use, rather than redirecting anywhere.
 */
export async function requireSetupNotCompleted(c: Context<{ Bindings: Env }>, next: Next) {
  const authService = new AuthService(c.env);
  const alreadyCompleted = await authService.isSetupCompleted();

  if (alreadyCompleted) {
    return c.json(
      {
        success: false,
        error: { code: "SETUP_ALREADY_COMPLETED", message: "Setup sudah pernah dilakukan." },
      },
      403
    );
  }

  await next();
}
