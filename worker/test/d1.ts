import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

type Row = Record<string, unknown>;

/**
 * Just enough of D1's API on top of Node's built-in SQLite to run the
 * Worker's real SQL in tests: window functions, RETURNING, and batches as
 * all-or-nothing transactions (like D1).
 */
export function createD1(): D1Database {
  const db = new DatabaseSync(':memory:');

  const statement = (sql: string, params: SQLInputValue[] = []) => {
    const rows = () => db.prepare(sql).all(...params) as Row[];
    const result = () => ({ results: rows(), success: true, meta: {} });
    return {
      bind: (...values: unknown[]) => statement(sql, values as SQLInputValue[]),
      first: async (column?: string) => {
        const row = rows()[0] ?? null;
        return column ? (row?.[column] ?? null) : row;
      },
      all: async () => result(),
      run: async () => result(),
      result,
    };
  };

  const d1 = {
    prepare: (sql: string) => statement(sql),
    batch: async (statements: ReturnType<typeof statement>[]) => {
      db.exec('BEGIN');
      try {
        const out = statements.map((s) => s.result());
        db.exec('COMMIT');
        return out;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
  };
  return d1 as unknown as D1Database;
}
