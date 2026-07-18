import { generatePublicId, PUBLIC_ID_PREFIXES } from "@nqdrive/shared";

export interface AuditLogRow {
  id: number;
  public_id?: string | null;
  action: string;
  status: string;
  user: string;
  ip: string;
  country: string;
  timezone: string;
  user_agent: string;
  detail: string | null;
  created_at: string;
}

function genAuditPublicId(): string {
  return generatePublicId(PUBLIC_ID_PREFIXES.audit);
}

export interface AuditLogCreateParams {
  action: string;
  status: "success" | "warning" | "error" | "info";
  user?: string;
  ip?: string;
  country?: string;
  timezone?: string;
  userAgent?: string;
  detail?: string;
}

export interface AuditLogQuery {
  limit?: number;
  offset?: number;
  status?: string;
  action?: string;
  user?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export class AuditLogRepository {
  constructor(private readonly db: D1Database) {}

  async create(params: AuditLogCreateParams): Promise<void> {
    const publicId = genAuditPublicId();
    try {
      await this.db
        .prepare(
          `INSERT INTO audit_logs (public_id, action, status, user, ip, country, timezone, user_agent, detail)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          publicId,
          params.action,
          params.status,
          params.user ?? "admin",
          params.ip ?? "",
          params.country ?? "",
          params.timezone ?? "",
          params.userAgent ?? "",
          params.detail ?? null
        )
        .run();
    } catch (e) {
      // Fallback for old DB without timezone column (backward compat)
      // @ts-ignore
      if (String(e).includes("no column named timezone") || String(e).includes("has no column named timezone")) {
        try {
          await this.db
            .prepare(
              `INSERT INTO audit_logs (public_id, action, status, user, ip, country, user_agent, detail)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .bind(
              publicId,
              params.action,
              params.status,
              params.user ?? "admin",
              params.ip ?? "",
              params.country ?? "",
              params.userAgent ?? "",
              params.detail ?? null
            )
            .run();
        } catch {
          await this.db
            .prepare(
              `INSERT INTO audit_logs (action, status, user, ip, country, user_agent, detail)
               VALUES (?, ?, ?, ?, ?, ?, ?)`
            )
            .bind(
              params.action,
              params.status,
              params.user ?? "admin",
              params.ip ?? "",
              params.country ?? "",
              params.userAgent ?? "",
              params.detail ?? null
            )
            .run();
        }
      } else if (String(e).includes("no column named public_id") || String(e).includes("has no column named public_id")) {
        // Fallback for DB before public_id column added
        await this.db
          .prepare(
            `INSERT INTO audit_logs (action, status, user, ip, country, timezone, user_agent, detail)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            params.action,
            params.status,
            params.user ?? "admin",
            params.ip ?? "",
            params.country ?? "",
            params.timezone ?? "",
            params.userAgent ?? "",
            params.detail ?? null
          )
          .run();
      } else {
        throw e;
      }
    }
  }

  async query(q: AuditLogQuery): Promise<{ logs: AuditLogRow[]; total: number }> {
    const conditions: string[] = [];
    const binds: any[] = [];

    if (q.status) {
      conditions.push("status = ?");
      binds.push(q.status);
    }
    if (q.action) {
      conditions.push("action = ?");
      binds.push(q.action);
    }
    if (q.user) {
      conditions.push("user = ?");
      binds.push(q.user);
    }
    if (q.dateFrom) {
      conditions.push("created_at >= ?");
      binds.push(q.dateFrom);
    }
    if (q.dateTo) {
      conditions.push("created_at <= ?");
      binds.push(q.dateTo + "T23:59:59");
    }
    if (q.search) {
      conditions.push("(action LIKE ? OR user LIKE ? OR ip LIKE ? OR detail LIKE ?)");
      const s = `%${q.search}%`;
      binds.push(s, s, s, s);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countRow = await this.db
      .prepare(`SELECT COUNT(*) as cnt FROM audit_logs ${where}`)
      .bind(...binds)
      .first<{ cnt: number }>();
    const total = countRow?.cnt ?? 0;

    const limit = Math.min(q.limit ?? 50, 200);
    const offset = q.offset ?? 0;

    const { results } = await this.db
      .prepare(`SELECT * FROM audit_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .bind(...binds, limit, offset)
      .all<AuditLogRow>();

    return { logs: results, total };
  }

  async stats(): Promise<{
    total: number;
    success: number;
    warning: number;
    error: number;
    info: number;
    trend: { date: string; events: number }[];
  }> {
    const counts = await this.db
      .prepare(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
           SUM(CASE WHEN status = 'warning' THEN 1 ELSE 0 END) as warning,
           SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error,
           SUM(CASE WHEN status = 'info' THEN 1 ELSE 0 END) as info
         FROM audit_logs`
      )
      .first<{ total: number; success: number; warning: number; error: number; info: number }>();

    const { results: trendRows } = await this.db
      .prepare(
        `SELECT DATE(created_at) as date, COUNT(*) as events
         FROM audit_logs
         WHERE created_at >= DATE('now', '-13 days')
         GROUP BY DATE(created_at)
         ORDER BY date ASC`
      )
      .all<{ date: string; events: number }>();

    return {
      total: counts?.total ?? 0,
      success: counts?.success ?? 0,
      warning: counts?.warning ?? 0,
      error: counts?.error ?? 0,
      info: counts?.info ?? 0,
      trend: trendRows,
    };
  }

  async distinctActions(): Promise<string[]> {
    const { results } = await this.db
      .prepare("SELECT DISTINCT action FROM audit_logs ORDER BY action ASC")
      .all<{ action: string }>();
    return results.map((r) => r.action);
  }

  async distinctUsers(): Promise<string[]> {
    const { results } = await this.db
      .prepare("SELECT DISTINCT user FROM audit_logs ORDER BY user ASC")
      .all<{ user: string }>();
    return results.map((r) => r.user);
  }
}
