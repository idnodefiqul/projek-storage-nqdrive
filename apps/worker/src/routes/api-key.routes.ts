import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { requireAuth } from "../middleware/require-auth.middleware";
import { ApiKeyRepository } from "../database/api-key.repository";
import { generateApiKey } from "../utils/api-key";
import { writeAuditLog } from "../utils/audit";
import type { Env } from "../config/env";
import type { ApiKey } from "@nqdrive/types";

const apiKeyRoutes = new Hono<{ Bindings: Env }>();

apiKeyRoutes.use("*", requireAuth);

const createApiKeySchema = z.object({ name: z.string().min(1).max(100) });

/** Strips keyHash — 100% clean professional, only apiKeyId */
function toPublic(key: any) {
  const { keyHash, id: _id, public_id: _pid, publicId: _pub, apiKeyId: _apiOld, ...rest } = key;
  const pub = key.publicId ?? key.apiKeyId ?? key.public_id ?? null;
  return {
    apiKeyId: pub,
    name: rest.name,
    keyPrefix: rest.keyPrefix,
    lastUsedAt: rest.lastUsedAt,
    createdAt: rest.createdAt,
    revokedAt: rest.revokedAt,
  };
}

apiKeyRoutes.get("/", async (c) => {
  const repository = new ApiKeyRepository(c.env.DB);
  const keys = await repository.findAll() as any[];
  return c.json({ success: true, data: { apiKeys: keys.map(toPublic) } });
});

/**
 * POST /api/api-keys
 * The full key is returned ONLY in this response — it is never retrievable again afterward,
 * since only its hash is persisted. The dashboard must show it once and tell the admin to
 * copy it immediately.
 */
apiKeyRoutes.post("/", zValidator("json", createApiKeySchema), async (c) => {
  const { name } = c.req.valid("json");
  const repository = new ApiKeyRepository(c.env.DB);

  const { fullKey, prefix, hash } = await generateApiKey();
  const apiKey = await repository.create({ name, keyHash: hash, keyPrefix: prefix });

  writeAuditLog(c, { action: "api-key.create", status: "success", detail: name });
  return c.json({ success: true, data: { apiKey: toPublic(apiKey), fullKey } }, 201);
});

apiKeyRoutes.delete("/:id", async (c) => {
  const rawId = c.req.param("id");
  const repository = new ApiKeyRepository(c.env.DB);
  await (repository as any).revokeByPublicIdOrId(rawId);
  writeAuditLog(c, { action: "api-key.revoke", status: "warning", detail: `ID: ${rawId}` });
  return c.json({ success: true, data: { message: "API key berhasil dicabut." } });
});

export { apiKeyRoutes };
