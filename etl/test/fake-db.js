// Minimal stand-in for the supabase-js query builder: enough of the surface the
// ETL tasks use (from().select().eq().in(), upsert, insert().select().single(),
// update().eq()) to run the real task code and inspect what it wrote.
class Builder {
  constructor(store, table) {
    this.store = store;
    this.table = table;
    this.filters = [];
    this.result = { data: null, error: null };
  }
  #rows() {
    return (this.store[this.table] ?? []).filter(row =>
      this.filters.every(f => f.op === 'eq' ? row[f.col] === f.val : f.val.includes(row[f.col])));
  }
  select() { this.mode = 'select'; return this; }
  eq(col, val) { this.filters.push({ op: 'eq', col, val }); return this; }
  in(col, val) { this.filters.push({ op: 'in', col, val }); return this; }
  single() { this.wantSingle = true; return this; }
  limit(n) { this.limitN = n; return this; }
  order() { return this; }

  // races.id and sessions.id are `generated always as identity`; Postgres
  // rejects any INSERT that supplies one, and a PostgREST upsert is an INSERT.
  #identityViolation(rows) {
    const guarded = this.store._identityAlways ?? ['races', 'sessions'];
    if (!guarded.includes(this.table)) return null;
    return rows.some(r => r.id !== undefined)
      ? { message: `cannot insert a non-DEFAULT value into column "id"`, code: '428C9' }
      : null;
  }
  #denied() {
    const denied = this.store._deny ?? [];
    return denied.includes(this.table)
      ? { message: `permission denied for table ${this.table}`, code: '42501' } : null;
  }
  upsert(rows, opts = {}) {
    const bad = this.#identityViolation(rows);
    if (bad) { this.result = { data: null, error: bad }; return this; }
    const keys = (opts.onConflict ?? 'id').split(',').map(s => s.trim());
    const table = (this.store[this.table] ??= []);
    for (const row of rows) {
      const match = table.find(existing => keys.every(k => existing[k] === row[k]));
      if (match) Object.assign(match, row);
      else table.push({ id: row.id ?? ++this.store._seq, ...row });
    }
    this.result = { data: rows, error: null };
    return this;
  }
  insert(row) {
    const denied = this.#denied();
    if (denied) { this.result = { data: null, error: denied }; return this; }
    const table = (this.store[this.table] ??= []);
    const stored = { id: ++this.store._seq, ...row };
    table.push(stored);
    this.result = { data: stored, error: null };
    return this;
  }
  update(patch) {
    this.pendingUpdate = patch;
    return this;
  }
  delete() { this.pendingDelete = true; return this; }
  then(resolve) {
    if (this.pendingDelete) {
      const doomed = new Set(this.#rows());
      this.store[this.table] = (this.store[this.table] ?? []).filter(r => !doomed.has(r));
      return resolve({ data: null, error: null });
    }
    if (this.pendingUpdate) {
      for (const row of this.#rows()) Object.assign(row, this.pendingUpdate);
      return resolve({ data: null, error: null });
    }
    if (this.result.error) return resolve(this.result);
    if (this.mode === 'select' && this.result.data === null) {
      const all = this.#rows();
      const rows = this.limitN ? all.slice(0, this.limitN) : all;
      return resolve({ data: this.wantSingle ? rows[0] ?? null : rows, error: null });
    }
    if (this.wantSingle) return resolve({ data: this.result.data, error: null });
    return resolve(this.result);
  }
}

export function fakeDb(seed = {}) {
  const store = { _seq: 1000, ...seed };
  return {
    store,
    from(table) { return new Builder(store, table); },
  };
}
