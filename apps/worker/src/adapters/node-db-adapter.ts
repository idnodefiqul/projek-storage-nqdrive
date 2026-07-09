/**
 * Adapter better-sqlite3 -> bentuk API D1Database.
 *
 * Tujuan: 130+ pemanggilan `await c.env.DB.prepare(...).bind(...).all()/first()/run()`
 * yang sudah ada di repositories TIDAK perlu diubah satu pun saat berjalan di Node
 * (VPS standalone). Semua method mengembalikan Promise (Promise.resolve atas hasil
 * sinkron better-sqlite3) supaya `await` tetap bekerja persis seperti di D1.
 *
 * Kontrak yang ditiru (subset D1 yang benar-benar dipakai kode ini):
 *   - prepare(sql) -> statement
 *   - statement.bind(...args) -> statement baru (immutable, seperti D1)
 *   - all()   -> { success, results: [...], meta }
 *   - first() -> row tunggal | null
 *   - run()   -> { success, meta: { changes, last_row_id, duration } }
 *   - db.batch(stmts) -> semua statement dalam SATU transaction, array hasil per statement
 */

import type BetterSqlite3 from "better-sqlite3";

export interface NodeD1Meta {
  changes: number;
  last_row_id: number;
  duration: number;
}

export interface NodeD1Result<T = unknown> {
  success: true;
  results: T[];
  meta: NodeD1Meta;
}

export class NodeD1PreparedStatement {
  constructor(
    private readonly stmt: BetterSqlite3.Statement,
    private readonly params: unknown[] = []
  ) {}

  bind(...args: unknown[]): NodeD1PreparedStatement {
    // D1 menerima undefined/boolean; better-sqlite3 menolak keduanya.
    const normalized = args.map((v) =>
      v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : v
    );
    return new NodeD1PreparedStatement(this.stmt, normalized);
  }

  async all<T = unknown>(): Promise<NodeD1Result<T>> {
    return Promise.resolve({
      success: true,
      results: this.stmt.all(...this.params) as T[],
      meta: { changes: 0, last_row_id: 0, duration: 0 },
    });
  }

  async first<T = unknown>(): Promise<T | null> {
    const row = this.stmt.get(...this.params) as T | undefined;
    return Promise.resolve(row ?? null);
  }

  async run<T = unknown>(): Promise<NodeD1Result<T>> {
    return Promise.resolve(this.runSync<T>());
  }

  /**
   * Eksekusi sinkron — dipakai run() dan batch() (batch harus sinkron karena
   * berjalan di dalam better-sqlite3 transaction, yang tidak boleh async).
   */
  runSync<T = unknown>(): NodeD1Result<T> {
    // Statement.reader === true bila statement mengembalikan baris
    // (SELECT, termasuk INSERT/UPDATE ... RETURNING) — .run() better-sqlite3
    // akan melempar error untuk statement seperti itu, jadi pakai .all().
    if (this.stmt.reader) {
      return {
        success: true,
        results: this.stmt.all(...this.params) as T[],
        meta: { changes: 0, last_row_id: 0, duration: 0 },
      };
    }

    const info = this.stmt.run(...this.params);
    return {
      success: true,
      results: [],
      meta: {
        // WAJIB dari property NATIVE better-sqlite3 RunResult.changes —
        // dipakai untuk row-locking pesimistis di migration.repository.ts
        // (`if (result.meta.changes > 0) claimed.push(...)`).
        changes: info.changes,
        last_row_id: Number(info.lastInsertRowid),
        duration: 0,
      },
    };
  }
}

export class NodeD1Database {
  constructor(private readonly db: BetterSqlite3.Database) {}

  prepare(sql: string): NodeD1PreparedStatement {
    return new NodeD1PreparedStatement(this.db.prepare(sql));
  }

  /**
   * Seperti D1Database.batch(): semua statement dijalankan dalam SATU
   * transaction — kalau satu gagal, semuanya di-rollback.
   */
  async batch<T = unknown>(statements: NodeD1PreparedStatement[]): Promise<NodeD1Result<T>[]> {
    const tx = this.db.transaction((stmts: NodeD1PreparedStatement[]) =>
      stmts.map((s) => s.runSync<T>())
    );
    return Promise.resolve(tx(statements));
  }
}
