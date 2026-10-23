// An in-memory stand-in for the slice of supabase-js the app uses: from(table).select/eq/
// maybeSingle/upsert/insert/update/delete + a minimal auth. Rows are keyed by `id` (or `user_id`
// for tracker). `failNext(table, op)` makes the next matching call resolve `{ error }` —
// supabase-js reports RLS / network failures that way rather than throwing; 'upsert' stands for
// any row write (upsert, insert or update). `createClient` calls are counted.
import { tokenEmail } from '../account/authLink';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- rows are loosely typed test data
type Row = Record<string, any>;
type Op = 'select' | 'upsert' | 'delete';
const WRITES = ['upsert', 'insert', 'update'];
type Result = { data: unknown; error: { message: string } | null };

/**
 * `linkEvent`: the event setSession fires (an expired link's token is refreshed: TOKEN_REFRESHED).
 * `linkUser`: the account the server answers for a link's email (a token can name another email).
 * `tables`: rows the cloud already holds.
 */
export function createFakeSupabase(
  opts: {
    linkEvent?: string;
    linkUser?: (email: string) => string;
    tables?: Record<string, Row[]>;
  } = {},
) {
  const tables: Record<string, Row[]> = structuredClone(opts.tables ?? {});
  const failures: { table: string; op: Op }[] = [];
  // `holdNext` parks the next matching write until its release() is called (an in-flight write).
  const holds: { table: string; op: Op; gate: Promise<void> }[] = [];
  const held = async (table: string, op: Op | 'insert' | 'update') => {
    const i = holds.findIndex(
      (h) => h.table === table && (h.op === op || (h.op === 'upsert' && WRITES.includes(op))),
    );
    if (i < 0) return;
    const [h] = holds.splice(i, 1);
    await h.gate;
  };
  const keyOf = (table: string, r: Row) => String(table === 'tracker' ? r.user_id : r.id);
  const rows = (t: string) => (tables[t] ??= []);
  const fail = (table: string, op: Op | 'insert' | 'update'): Result | null => {
    const i = failures.findIndex(
      (f) => f.table === table && (f.op === op || (f.op === 'upsert' && WRITES.includes(op))),
    );
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
              await held(table, 'select');
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
          await held(table, 'upsert');
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
        /** Resolves `{ error: { code: '23505' } }` when the key is taken, as Postgres does. */
        insert(input: Row) {
          const go = async (): Promise<
            Result & { error: { message: string; code?: string } | null }
          > => {
            await held(table, 'insert');
            const f = fail(table, 'insert');
            if (f) return f;
            if (rows(table).some((x) => keyOf(table, x) === keyOf(table, input)))
              return { data: null, error: { message: 'duplicate key', code: '23505' } };
            rows(table).push({ ...input });
            return { data: [{ ...input }], error: null };
          };
          return { select: () => go(), then: <T>(ok: (r: Result) => T) => go().then(ok) };
        },
        /** update(patch).eq(k, v).is(k, null)….select(): the rows it changed. */
        update(patch: Row) {
          const filters: [string, unknown][] = [];
          const go = async (): Promise<Result> => {
            await held(table, 'update');
            const f = fail(table, 'update');
            if (f) return f;
            const hit = rows(table).filter((r) =>
              filters.every(([k, v]) => (v === null ? r[k] == null : r[k] === v)),
            );
            hit.forEach((r) => Object.assign(r, structuredClone(patch)));
            return { data: hit.map((r) => ({ ...r })), error: null };
          };
          const q = {
            eq(k: string, v: unknown) {
              filters.push([k, v]);
              return q;
            },
            is(k: string, v: null) {
              filters.push([k, v]);
              return q;
            },
            select: () => go(),
            then: <T>(ok: (r: Result) => T) => go().then(ok),
          };
          return q;
        },
        delete() {
          return {
            async eq(k: string, v: unknown): Promise<Result> {
              await held(table, 'delete');
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
      /** A magic link's tokens: the "server" knows a token by the email in its payload. */
      async setSession(t: { access_token: string; refresh_token: string }) {
        const email = tokenEmail(t.access_token);
        if (!email || !t.refresh_token)
          return { data: { user: null, session: null }, error: { message: 'Invalid token' } };
        const real = opts.linkUser?.(email) ?? email;
        session = { user: { id: `id-${real}`, email: real } };
        listeners.forEach((l) => l(opts.linkEvent ?? 'SIGNED_IN', session));
        return { data: { user: session.user, session }, error: null };
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
    /** Park the next matching write; returns the function that lets it finish. */
    holdNext(table: string, op: Op): () => void {
      let release = () => {};
      const gate = new Promise<void>((r) => (release = r));
      holds.push({ table, op, gate });
      return release;
    },
    signIn(id: string, email = `${id}@example.test`, event = 'SIGNED_IN') {
      session = { user: { id, email } };
      listeners.forEach((l) => l(event, session));
    },
    /** Another tab changed the shared session (#288): what this tab's client now reads. `relay`
     *  passes the event on as supabase-js's cross-tab broadcast does; off, only storage knows. */
    otherTab(id: string | null, event = id ? 'SIGNED_IN' : 'SIGNED_OUT', relay = true) {
      session = id ? { user: { id, email: `${id}@example.test` } } : null;
      if (relay) listeners.forEach((l) => l(event, session));
    },
    reset() {
      for (const k of Object.keys(tables)) delete tables[k];
      failures.length = 0;
      holds.length = 0;
      session = null;
    },
  };
}

/** An access token as a magic link carries it: a JWT whose payload names the account's email. */
export function fakeAccessToken(email: string): string {
  const b64 = (o: object) =>
    btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: `id-${email}`, email })}.sig`;
}
