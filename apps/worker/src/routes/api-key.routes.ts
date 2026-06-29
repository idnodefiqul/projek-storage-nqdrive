import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { requireAuth } from "../middleware/require-auth.middleware";
import { ApiKeyRepository } from "../database/api-key.repository";
import { generateApiKey } from "../utils/api-key";
import type { Env } from "../config/env";
import type { ApiKey } from "@nqdrive/types";

const apiKeyRoutes = new Hono<{ Bindings: Env }>();

apiKeyRoutes.use("*", requireAuth);

const createApiKeySchema = z.object({ name: z.string().min(1).max(100) });

/** Strips keyHash before sending to the client — only the prefix is ever shown after creation. */
function toPublic(key: ApiKey) {
  const { keyHash, ...rest } = key;
  return rest;
}

apiKeyRoutes.get("/", async (c) => {
  const repository = new ApiKeyRepository(c.env.DB);
  const keys = await repository.findAll();
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

  return c.json({ success: true, data: { apiKey: toPublic(apiKey), fullKey } }, 201);
});

apiKeyRoutes.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const repository = new ApiKeyRepository(c.env.DB);
  await repository.revoke(id);
  return c.json({ success: true, data: { message: "API key berhasil dicabut." } });
});

export { apiKeyRoutes };
