# Local file database (optional / not used by default)

`localdb.ts` is a small, dependency-free document store that persists each
collection as a human-readable JSON file under a `./database` folder. It exposes
a Mongoose-compatible model API (`find`, `findOne`, `create`, `findOneAndUpdate`,
`populate`, `sort`, …).

**The app does NOT use this by default** — production and normal development run
on **MongoDB** via Mongoose (see `src/config/db.ts` and `src/models/*`). This
module is kept here as a lightweight option for running the backend with no
MongoDB instance (e.g. quick offline experiments).

It is intentionally standalone and not imported anywhere. To use it you would
point the models at it instead of Mongoose — that wiring is not included.
