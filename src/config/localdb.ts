import fs from "fs";
import path from "path";
import crypto from "crypto";

/**
 * Local file-based database.
 *
 * This is a small, dependency-free stand-in for MongoDB. Each "collection" is
 * persisted as a human-readable JSON file inside the ./database folder, and this
 * module exposes a Mongoose-compatible model API (find / findOne / create /
 * findOneAndUpdate / populate / sort / …) so the route and seed code that used to
 * talk to Mongoose keeps working unchanged.
 *
 * It intentionally supports only the query/update features this project actually
 * uses (equality, $in, $regex, $gte/$lte/$gt/$lt/$ne, $set, $inc, $unset,
 * $setOnInsert, populate, sort, limit, select, upsert). It is NOT a general
 * MongoDB replacement.
 */

// --- storage location -------------------------------------------------------
// ./database at the backend root (works for both ts-node `src/**` and compiled
// `dist/**`, since config sits two levels below the backend root in both).
const DB_DIR = process.env.LOCAL_DB_DIR
  ? path.resolve(process.env.LOCAL_DB_DIR)
  : path.resolve(__dirname, "..", "..", "database");

export function getDbDir(): string {
  return DB_DIR;
}

export function initLocalDb(): string {
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
  return DB_DIR;
}

// --- in-memory cache of each collection -------------------------------------
type AnyDoc = Record<string, any>;
const store = new Map<string, AnyDoc[]>();

function fileFor(collection: string): string {
  return path.join(DB_DIR, `${collection}.json`);
}

function getColl(collection: string): AnyDoc[] {
  if (!store.has(collection)) {
    const file = fileFor(collection);
    if (fs.existsSync(file)) {
      try {
        store.set(collection, JSON.parse(fs.readFileSync(file, "utf-8")) as AnyDoc[]);
      } catch {
        store.set(collection, []);
      }
    } else {
      store.set(collection, []);
    }
  }
  return store.get(collection)!;
}

function persist(collection: string): void {
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
  fs.writeFileSync(fileFor(collection), JSON.stringify(getColl(collection), null, 2));
}

// --- helpers -----------------------------------------------------------------
function genId(): string {
  return crypto.randomBytes(12).toString("hex"); // 24-char hex, ObjectId-like
}

/** Round-trip through JSON so Dates become ISO strings and `undefined` is dropped. */
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
  // plain equality (compare by string so ObjectId-like ids and numbers line up)
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

// --- model config ------------------------------------------------------------
export interface ModelConfig {
  dateFields?: string[];
  defaults?: Record<string, any>;
  refs?: Record<string, string>; // path -> target collection
}

const registry = new Map<string, LocalModel>();

function reviveDates(doc: AnyDoc, dateFields: string[]): AnyDoc {
  for (const f of dateFields) {
    if (doc[f] != null && typeof doc[f] === "string") doc[f] = new Date(doc[f]);
  }
  return doc;
}

/** Build a "live" document: a clone with revived Dates and a non-enumerable save(). */
function makeDoc(model: LocalModel, raw: AnyDoc): AnyDoc {
  const doc = reviveDates(JSON.parse(JSON.stringify(raw)), model.config.dateFields ?? []);
  Object.defineProperty(doc, "save", {
    enumerable: false,
    value: async function () {
      const coll = getColl(model.collection);
      const idx = coll.findIndex((d) => String(d._id) === String(doc._id));
      doc.updatedAt = new Date();
      const stored = toRaw(doc);
      if (idx >= 0) coll[idx] = stored;
      else coll.push(stored);
      persist(model.collection);
      return doc;
    },
  });
  return doc;
}

function applyUpdate(target: AnyDoc, update: AnyDoc, isInsert: boolean): void {
  const usesOperators = Object.keys(update).some((k) => k.startsWith("$"));
  if (!usesOperators) {
    for (const [k, v] of Object.entries(update)) {
      if (v !== undefined) target[k] = v;
    }
    return;
  }
  if (update.$set) for (const [k, v] of Object.entries(update.$set)) if (v !== undefined) target[k] = v;
  if (update.$inc) for (const [k, v] of Object.entries<any>(update.$inc)) target[k] = (target[k] ?? 0) + v;
  if (update.$unset) for (const k of Object.keys(update.$unset)) delete target[k];
  if (isInsert && update.$setOnInsert) for (const [k, v] of Object.entries(update.$setOnInsert)) target[k] = v;
}

// --- query -------------------------------------------------------------------
type QueryMode = "find" | "one" | "count";

class LocalQuery implements PromiseLike<any> {
  private populates: { path: string; select?: string }[] = [];
  private _sort: Record<string, 1 | -1> | null = null;
  private _limit: number | null = null;
  private _select: string | null = null;

  constructor(private model: LocalModel, private mode: QueryMode, private produce: () => AnyDoc[]) {}

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
  // sessions/transactions don't exist in the file DB — accept and ignore.
  session(_s?: unknown): this {
    return this;
  }

  private runPopulate(doc: AnyDoc): void {
    const refs = this.model.config.refs ?? {};
    for (const { path: p, select } of this.populates) {
      const targetColl = refs[p];
      if (!targetColl) continue;
      const targetModel = registry.get(targetColl);
      const refId = doc[p];
      if (refId == null || !targetModel) continue;
      const rawRef = getColl(targetColl).find((d) => String(d._id) === String(refId));
      if (!rawRef) {
        doc[p] = null;
        continue;
      }
      let refDoc = makeDoc(targetModel, rawRef);
      if (select) refDoc = applySelect(refDoc, select);
      doc[p] = refDoc;
    }
  }

  async exec(): Promise<any> {
    let matches = this.produce();
    if (this.mode === "count") return matches.length;
    if (this._sort) matches = sortDocs(matches, this._sort);
    if (this.mode === "find" && this._limit != null) matches = matches.slice(0, this._limit);

    let docs = matches.map((raw) => makeDoc(this.model, raw));
    for (const doc of docs) this.runPopulate(doc);
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

// --- model -------------------------------------------------------------------
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

  async create(input: AnyDoc | AnyDoc[], _opts?: unknown): Promise<any> {
    const coll = getColl(this.collection);
    if (Array.isArray(input)) {
      const docs = input.map((i) => {
        const raw = this.newRaw(i);
        coll.push(raw);
        return raw;
      });
      persist(this.collection);
      return docs.map((r) => makeDoc(this, r));
    }
    const raw = this.newRaw(input);
    coll.push(raw);
    persist(this.collection);
    return makeDoc(this, raw);
  }

  async insertMany(inputs: AnyDoc[]): Promise<any[]> {
    return this.create(inputs);
  }

  find(filter: AnyDoc = {}): LocalQuery {
    return new LocalQuery(this, "find", () => getColl(this.collection).filter((d) => matchFilter(d, filter)));
  }

  findOne(filter: AnyDoc = {}): LocalQuery {
    return new LocalQuery(this, "one", () => getColl(this.collection).filter((d) => matchFilter(d, filter)));
  }

  findById(id: any): LocalQuery {
    return new LocalQuery(this, "one", () => getColl(this.collection).filter((d) => String(d._id) === String(id)));
  }

  countDocuments(filter: AnyDoc = {}): LocalQuery {
    return new LocalQuery(this, "count", () => getColl(this.collection).filter((d) => matchFilter(d, filter)));
  }

  async deleteMany(filter: AnyDoc = {}): Promise<{ deletedCount: number }> {
    const coll = getColl(this.collection);
    const before = coll.length;
    const kept = coll.filter((d) => !matchFilter(d, filter));
    store.set(this.collection, kept);
    persist(this.collection);
    return { deletedCount: before - kept.length };
  }

  private writeOneAndUpdate(filter: AnyDoc, update: AnyDoc, opts: { upsert?: boolean } = {}): AnyDoc | null {
    const coll = getColl(this.collection);
    const idx = coll.findIndex((d) => matchFilter(d, filter));
    if (idx >= 0) {
      applyUpdate(coll[idx], update, false);
      coll[idx].updatedAt = new Date().toISOString();
      coll[idx] = toRaw(coll[idx]);
      persist(this.collection);
      return coll[idx];
    }
    if (opts.upsert) {
      const now = new Date().toISOString();
      const base: AnyDoc = { ...(this.config.defaults ?? {}) };
      // seed equality fields from the filter
      for (const [k, v] of Object.entries(filter)) if (!hasOperator(v)) base[k] = v;
      applyUpdate(base, update, true);
      base._id = base._id ?? genId();
      base.createdAt = now;
      base.updatedAt = now;
      const raw = toRaw(base);
      coll.push(raw);
      persist(this.collection);
      return raw;
    }
    return null;
  }

  findOneAndUpdate(filter: AnyDoc, update: AnyDoc, opts: { upsert?: boolean; new?: boolean } = {}): LocalQuery {
    const result = this.writeOneAndUpdate(filter, update, opts);
    return new LocalQuery(this, "one", () => (result ? [result] : []));
  }

  findByIdAndUpdate(id: any, update: AnyDoc, opts: { new?: boolean } = {}): LocalQuery {
    return this.findOneAndUpdate({ _id: id }, update, opts);
  }

  findByIdAndDelete(id: any): LocalQuery {
    const coll = getColl(this.collection);
    const idx = coll.findIndex((d) => String(d._id) === String(id));
    const removed = idx >= 0 ? coll.splice(idx, 1)[0] : null;
    if (removed) persist(this.collection);
    return new LocalQuery(this, "one", () => (removed ? [removed] : []));
  }
}

export function createModel(collection: string, config: ModelConfig = {}): LocalModel {
  const model = new LocalModel(collection, config);
  registry.set(collection, model);
  return model;
}
