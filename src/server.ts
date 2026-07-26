import dotenv from "dotenv";
dotenv.config();

import { createApp } from "./app";
import { connectDB } from "./config/db";

const PORT = Number(process.env.PORT) || 4000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/hrms";

async function main() {
  await connectDB(MONGO_URI);
  const app = createApp();
  app.listen(PORT, () => {
    console.log(`[server] HRMS API listening on port ${PORT}`);
  });
}

main().catch((err) => {
  console.error("[server] failed to start", err);
  process.exit(1);
});
