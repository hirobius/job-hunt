// An in-memory stand-in for the slice of supabase-js the app uses: from(table).select/eq/
// maybeSingle/upsert/delete + a minimal auth. Rows are keyed by `id` (or `user_id` for tracker).
// `failNext(table, op)` makes the next matching call resolve `{ error }` — supabase-js reports
// RLS / network failures that way rather than throwing. `createClient` calls are counted.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- rows are loosely typed test data
type Row = Record<string, any>;
type Op = 'select' | 'upsert' | 'delete';
type Result = { data: unknown; error: { message: string } | null };

export function createFakeSupabase() {
  const tables: Record<string, Row[]> = {};
  const failures: { table: string; op: Op }[] = [];
  const keyOf = (table: string, r: Row) => String(table === 'tracker' ? r.user_id : r.id);
  const rows = (t: string) => (tables[t] ??= []);
  const fail = (table: string, op: Op): Result | null => {
    const i = failures.findIndex((f) => f.table === table && f.op === op);
    if (i < 0) return null;
    failures.splice(i, 1);
    return { data: null, error: { message: `${op} ${table} failed` } };
  };

  let session: { user: { id: string; email: string } } | null = null;
  const listeners = new Set<(event: string, s: typeof session) => void>();

  const client = {
    from(table: string) {
      return {
        select() {
          const filters: [string, unknown][] = [];
          const run = (): Result =>
            fail(table, 'select') ?? {
              data: rows(table).filter((r) => filters.every(([k, v]) => r[k] === v)),
              error: null,
            };
          const q = {
            eq(k: string, v: unknown) {
              filters.push([k, v]);
              return q;
            },
            async maybeSingle(): Promise<Result> {
              const r = run();
              return r.error ? r : { data: (r.data as Row[])[0] ?? null, error: null };
            },
            then<T>(ok: (r: Result) => T, ko?: (e: unknown) => T) {
              return Promise.resolve(run()).then(ok, ko);
            },
          };
          return q;
        },
        async upsert(input: Row | Row[]): Promise<Result> {
          const f = fail(table, 'upsert');
          if (f) return f;
          for (const r of Array.isArray(input) ? input : [input]) {
            const t = rows(table);
            const i = t.findIndex((x) => keyOf(table, x) === keyOf(table, r));
            if (i > -1) t[i] = { ...r };
            else t.push({ ...r });
          }
          return { data: null, error: null };
        },
        delete() {
          return {
            async eq(k: string, v: unknown): Promise<Result> {
              const f = fail(table, 'delete');
              if (f) return f;
              tables[table] = rows(table).filter((r) => r[k] !== v);
              return { data: null, error: null };
            },
          };
        },
      };
    },
    auth: {
      async getSession() {
        return { data: { session } };
      },
      onAuthStateChange(cb: (event: string, s: typeof session) => void) {
        listeners.add(cb);
        return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } };
      },
      async signOut() {
        session = null;
        listeners.forEach((l) => l('SIGNED_OUT', null));
        return { error: null };
      },
      async signInWithOtp() {
        return { error: null };
      },
    },
  };

  return {
    client,
    tables,
    failNext: (table: string, op: Op) => failures.push({ table, op }),
    signIn(id: string, email = `${id}@example.test`) {
      session = { user: { id, email } };
      listeners.forEach((l) => l('SIGNED_IN', session));
    },
    reset() {
      for (const k of Object.keys(tables)) delete tables[k];
      failures.length = 0;
      session = null;
    },
  };
}

export type FakeSupabase = ReturnType<typeof createFakeSupabase>;
