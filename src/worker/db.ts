/// <reference types="@cloudflare/workers-types" />
import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Cloudflare D1 document store.
 *
 * Each "collection" is one D1 (SQLite) table shaped `(_id TEXT PRIMARY KEY, doc TEXT)`
 * where `doc` is the JSON-serialized document. This mirrors the local JSON file DB
 * (src/config/localdb.ts) but persists to D1, so the same Mongoose-compatible model
 * API (find / findOne / create / findOneAndUpdate / populate / sort / …) works on
 * Cloudflare Workers, where there is no filesystem.
 *
 * The D1 handle is carried per-request via AsyncLocalStorage so model methods keep
 * the exact same signatures as the Express version (no threading `db` through calls).
 */

type AnyDoc = Record<string, any>;

// --- per-request D1 handle -------------------------------------------------
export const dbCtx = new AsyncLocalStorage<D1Database>();
function d1(): D1Database {
  const db = dbCtx.getStore();
  if (!db) throw new Error("No D1 binding in async context (did the ALS middleware run?)");
  return db;
}

const COLLECTIONS = [
  "users",
  "employees",
  "departments",
  "attendance",
  "dailyTasks",
  "leaveBalances",
  "leaveRequests",
  "leaveTypes",
  "payrollRuns",
  "payslips",
  "salaryStructures",
] as const;
export type Collection = (typeof COLLECTIONS)[number];

function assertCollection(name: string): asserts name is Collection {
  if (!COLLECTIONS.includes(name as Collection)) throw new Error(`Unknown collection: ${name}`);
}

async function loadColl(name: string): Promise<AnyDoc[]> {
  assertCollection(name);
  const { results } = await d1().prepare(`SELECT doc FROM "${name}"`).all<{ doc: string }>();
  return (results ?? []).map((r) => JSON.parse(r.doc));
}

async function upsertDoc(name: string, doc: AnyDoc): Promise<void> {
  assertCollection(name);
  await d1()
    .prepare(`INSERT OR REPLACE INTO "${name}" (_id, doc) VALUES (?1, ?2)`)
    .bind(String(doc._id), JSON.stringify(doc))
    .run();
}

async function deleteByIds(name: string, ids: string[]): Promise<void> {
  assertCollection(name);
  if (ids.length === 0) return;
  const placeholders = ids.map((_, i) => `?${i + 1}`).join(", ");
  await d1()
    .prepare(`DELETE FROM "${name}" WHERE _id IN (${placeholders})`)
    .bind(...ids.map(String))
    .run();
}

// --- helpers (identical semantics to src/config/localdb.ts) ----------------
function genId(): string {
  const b = new Uint8Array(12);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function toRaw(obj: AnyDoc): AnyDoc {
  return JSON.parse(JSON.stringify(obj));
}

function hasOperator(v: any): boolean {
  return v !== null && typeof v === "object" && !Array.isArray(v) && Object.keys(v).some((k) => k.startsWith("$"));
}

function matchOne(doc: AnyDoc, field: string, cond: any): boolean {
  if (hasOperator(cond)) {
    for (const [op, val] of Object.entries<any>(cond)) {
      const actual = doc[field];
      switch (op) {
        case "$in":
          if (!Array.isArray(val) || !val.map(String).includes(String(actual))) return false;
          break;
        case "$nin":
          if (Array.isArray(val) && val.map(String).includes(String(actual))) return false;
          break;
        case "$regex":
          if (!new RegExp(val).test(String(actual ?? ""))) return false;
          break;
        case "$ne":
          if (String(actual) === String(val)) return false;
          break;
        case "$gte":
          if (!(actual >= val)) return false;
          break;
        case "$lte":
          if (!(actual <= val)) return false;
          break;
        case "$gt":
          if (!(actual > val)) return false;
          break;
        case "$lt":
          if (!(actual < val)) return false;
          break;
        default:
          return false;
      }
    }
    return true;
  }
  return String(doc[field]) === String(cond);
}

function matchFilter(doc: AnyDoc, filter: AnyDoc = {}): boolean {
  for (const [field, cond] of Object.entries(filter)) {
    if (!matchOne(doc, field, cond)) return false;
  }
  return true;
}

function compareValues(a: any, b: any): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  const sa = a == null ? "" : String(a);
  const sb = b == null ? "" : String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

function sortDocs(docs: AnyDoc[], sort: Record<string, 1 | -1>): AnyDoc[] {
  const keys = Object.entries(sort);
  return [...docs].sort((x, y) => {
    for (const [k, dir] of keys) {
      const c = compareValues(x[k], y[k]);
      if (c !== 0) return dir === -1 ? -c : c;
    }
    return 0;
  });
}

function applySelect(doc: AnyDoc, select: string): AnyDoc {
  const tokens = select.split(/\s+/).filter(Boolean);
  const excludes = tokens.filter((t) => t.startsWith("-")).map((t) => t.slice(1));
  const includes = tokens.filter((t) => !t.startsWith("-"));
  if (excludes.length > 0) {
    const out = { ...doc };
    for (const f of excludes) delete out[f];
    return out;
  }
  if (includes.length > 0) {
    const out: AnyDoc = { _id: doc._id };
    for (const f of includes) out[f] = doc[f];
    return out;
  }
  return doc;
}

function applyUpdate(target: AnyDoc, update: AnyDoc, isInsert: boolean): void {
  const usesOperators = Object.keys(update).some((k) => k.startsWith("$"));
  if (!usesOperators) {
    for (const [k, v] of Object.entries(update)) if (v !== undefined) target[k] = v;
    return;
  }
  if (update.$set) for (const [k, v] of Object.entries(update.$set)) if (v !== undefined) target[k] = v;
  if (update.$inc) for (const [k, v] of Object.entries<any>(update.$inc)) target[k] = (target[k] ?? 0) + v;
  if (update.$unset) for (const k of Object.keys(update.$unset)) delete target[k];
  if (isInsert && update.$setOnInsert) for (const [k, v] of Object.entries(update.$setOnInsert)) target[k] = v;
}

function reviveDates(doc: AnyDoc, dateFields: string[]): AnyDoc {
  for (const f of dateFields) {
    if (doc[f] != null && typeof doc[f] === "string") doc[f] = new Date(doc[f]);
  }
  return doc;
}

// --- model -----------------------------------------------------------------
interface ModelConfig {
  dateFields?: string[];
  defaults?: Record<string, any>;
  refs?: Record<string, string>;
}

const registry = new Map<string, LocalModel>();

function makeDoc(model: LocalModel, raw: AnyDoc): AnyDoc {
  const doc = reviveDates(JSON.parse(JSON.stringify(raw)), model.config.dateFields ?? []);
  Object.defineProperty(doc, "save", {
    enumerable: false,
    value: async function () {
      doc.updatedAt = new Date();
      await upsertDoc(model.collection, toRaw(doc));
      return doc;
    },
  });
  return doc;
}

type QueryMode = "find" | "one" | "count";

class LocalQuery implements PromiseLike<any> {
  private populates: { path: string; select?: string }[] = [];
  private _sort: Record<string, 1 | -1> | null = null;
  private _limit: number | null = null;
  private _select: string | null = null;

  constructor(private model: LocalModel, private mode: QueryMode, private produce: () => Promise<AnyDoc[]>) {}

  populate(path: string, select?: string): this {
    this.populates.push({ path, select });
    return this;
  }
  sort(spec: Record<string, 1 | -1>): this {
    this._sort = spec;
    return this;
  }
  limit(n: number): this {
    this._limit = n;
    return this;
  }
  select(spec: string): this {
    this._select = spec;
    return this;
  }
  session(): this {
    return this;
  }

  private async runPopulate(docs: AnyDoc[]): Promise<void> {
    const refs = this.model.config.refs ?? {};
    for (const { path: p, select } of this.populates) {
      const targetColl = refs[p];
      if (!targetColl) continue;
      const targetModel = registry.get(targetColl);
      if (!targetModel) continue;
      const rows = await loadColl(targetColl);
      const byId = new Map(rows.map((r) => [String(r._id), r]));
      for (const doc of docs) {
        const refId = doc[p];
        if (refId == null) continue;
        const rawRef = byId.get(String(refId));
        if (!rawRef) {
          doc[p] = null;
          continue;
        }
        let refDoc = makeDoc(targetModel, rawRef);
        if (select) refDoc = applySelect(refDoc, select);
        doc[p] = refDoc;
      }
    }
  }

  async exec(): Promise<any> {
    let matches = await this.produce();
    if (this.mode === "count") return matches.length;
    if (this._sort) matches = sortDocs(matches, this._sort);
    if (this.mode === "find" && this._limit != null) matches = matches.slice(0, this._limit);

    let docs = matches.map((raw) => makeDoc(this.model, raw));
    await this.runPopulate(docs);
    if (this._select) docs = docs.map((d) => applySelect(d, this._select!));

    if (this.mode === "one") return docs.length ? docs[0] : null;
    return docs;
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.exec().then(onfulfilled, onrejected);
  }
}

export class LocalModel {
  constructor(public collection: string, public config: ModelConfig) {}

  private newRaw(input: AnyDoc): AnyDoc {
    const now = new Date().toISOString();
    const raw = toRaw({ ...(this.config.defaults ?? {}), ...input });
    if (!raw._id) raw._id = genId();
    raw.createdAt = raw.createdAt ?? now;
    raw.updatedAt = now;
    return raw;
  }

  async create(input: AnyDoc | AnyDoc[]): Promise<any> {
    if (Array.isArray(input)) {
      const raws = input.map((i) => this.newRaw(i));
      for (const raw of raws) await upsertDoc(this.collection, raw);
      return raws.map((r) => makeDoc(this, r));
    }
    const raw = this.newRaw(input);
    await upsertDoc(this.collection, raw);
    return makeDoc(this, raw);
  }

  async insertMany(inputs: AnyDoc[]): Promise<any[]> {
    return this.create(inputs);
  }

  find(filter: AnyDoc = {}): LocalQuery {
    return new LocalQuery(this, "find", async () => (await loadColl(this.collection)).filter((d) => matchFilter(d, filter)));
  }

  findOne(filter: AnyDoc = {}): LocalQuery {
    return new LocalQuery(this, "one", async () => (await loadColl(this.collection)).filter((d) => matchFilter(d, filter)));
  }

  findById(id: any): LocalQuery {
    return new LocalQuery(this, "one", async () =>
      (await loadColl(this.collection)).filter((d) => String(d._id) === String(id))
    );
  }

  countDocuments(filter: AnyDoc = {}): LocalQuery {
    return new LocalQuery(this, "count", async () =>
      (await loadColl(this.collection)).filter((d) => matchFilter(d, filter))
    );
  }

  async deleteMany(filter: AnyDoc = {}): Promise<{ deletedCount: number }> {
    const rows = await loadColl(this.collection);
    const toDelete = rows.filter((d) => matchFilter(d, filter)).map((d) => String(d._id));
    await deleteByIds(this.collection, toDelete);
    return { deletedCount: toDelete.length };
  }

  findOneAndUpdate(filter: AnyDoc, update: AnyDoc, opts: { upsert?: boolean; new?: boolean } = {}): LocalQuery {
    return new LocalQuery(this, "one", async () => {
      const rows = await loadColl(this.collection);
      const existing = rows.find((d) => matchFilter(d, filter));
      if (existing) {
        applyUpdate(existing, update, false);
        existing.updatedAt = new Date().toISOString();
        const raw = toRaw(existing);
        await upsertDoc(this.collection, raw);
        return [raw];
      }
      if (opts.upsert) {
        const now = new Date().toISOString();
        const base: AnyDoc = { ...(this.config.defaults ?? {}) };
        for (const [k, v] of Object.entries(filter)) if (!hasOperator(v)) base[k] = v;
        applyUpdate(base, update, true);
        base._id = base._id ?? genId();
        base.createdAt = now;
        base.updatedAt = now;
        const raw = toRaw(base);
        await upsertDoc(this.collection, raw);
        return [raw];
      }
      return [];
    });
  }

  findByIdAndUpdate(id: any, update: AnyDoc, opts: { new?: boolean } = {}): LocalQuery {
    return this.findOneAndUpdate({ _id: id }, update, opts);
  }

  findByIdAndDelete(id: any): LocalQuery {
    return new LocalQuery(this, "one", async () => {
      const rows = await loadColl(this.collection);
      const removed = rows.find((d) => String(d._id) === String(id));
      if (removed) await deleteByIds(this.collection, [String(id)]);
      return removed ? [removed] : [];
    });
  }
}

function createModel(collection: string, config: ModelConfig = {}): LocalModel {
  const model = new LocalModel(collection, config);
  registry.set(collection, model);
  return model;
}

// --- models (configs identical to backend/src/models/*) --------------------
export const User = createModel("users", {
  dateFields: ["createdAt", "updatedAt"],
  defaults: { role: "manager", isActive: true },
  refs: { employee: "employees" },
});
export const Employee = createModel("employees", {
  dateFields: ["dateOfJoining", "createdAt", "updatedAt"],
  defaults: { status: "active", basicSalary: 0 },
  refs: { department: "departments", manager: "employees" },
});
export const Department = createModel("departments", { dateFields: ["createdAt", "updatedAt"] });
export const Attendance = createModel("attendance", {
  dateFields: ["checkIn", "checkOut", "createdAt", "updatedAt"],
  defaults: { status: "present" },
  refs: { employee: "employees" },
});
export const DailyTask = createModel("dailyTasks", {
  dateFields: ["createdAt", "updatedAt"],
  defaults: { status: "todo" },
  refs: { employee: "employees", createdBy: "users" },
});
export const LeaveBalance = createModel("leaveBalances", {
  dateFields: ["createdAt", "updatedAt"],
  defaults: { allocated: 0, used: 0 },
  refs: { employee: "employees", leaveType: "leaveTypes" },
});
export const LeaveRequest = createModel("leaveRequests", {
  dateFields: ["createdAt", "updatedAt"],
  defaults: { status: "pending" },
  refs: { employee: "employees", leaveType: "leaveTypes", approver: "employees" },
});
export const LeaveType = createModel("leaveTypes", {
  dateFields: ["createdAt", "updatedAt"],
  defaults: { defaultAnnualDays: 12 },
});
export const PayrollRun = createModel("payrollRuns", {
  dateFields: ["finalizedAt", "createdAt", "updatedAt"],
  defaults: { status: "draft" },
  refs: { runBy: "users" },
});
export const Payslip = createModel("payslips", {
  dateFields: ["createdAt", "updatedAt"],
  defaults: { lopDays: 0, deductions: 0 },
  refs: { payrollRun: "payrollRuns", employee: "employees" },
});
export const SalaryStructure = createModel("salaryStructures", {
  dateFields: ["effectiveFrom", "createdAt", "updatedAt"],
  defaults: { basic: 0, hra: 0, allowances: 0 },
  refs: { employee: "employees" },
});
