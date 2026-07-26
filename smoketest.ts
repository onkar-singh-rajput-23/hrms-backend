// Removed: in-sandbox smoke test relied on mongodb-memory-server, which could not download a
// MongoDB binary for this environment's architecture. The backend was instead verified with
// `tsc --noEmit` (clean compile) and manual code review. To test locally with a real MongoDB
// instance, run `npm run seed` followed by `npm run dev` and exercise the API with the demo
// accounts listed in README.md.
