import { initLocalDb, getDbDir } from "./localdb";
import User from "../models/User";

// ---------------------------------------------------------------------------
// MongoDB connection (DISABLED).
//
// The app now uses a local, human-readable JSON file database stored in the
// ./database folder (see src/config/localdb.ts). The original MongoDB
// connection is kept below, commented out, so it can be restored later by
// re-enabling this block and pointing MONGO_URI at a real MongoDB instance.
// ---------------------------------------------------------------------------
//
// import mongoose from "mongoose";
//
// export async function connectDB(uri: string): Promise<void> {
//   mongoose.set("strictQuery", true);
//   await mongoose.connect(uri);
//   console.log("[db] connected to MongoDB");
// }

// Local file database. The `uri` argument is accepted (so server.ts / seeds
// don't change) but ignored — data lives in the ./database folder instead.
export async function connectDB(_uri?: string): Promise<void> {
  const dir = initLocalDb();
  const users = await User.find();
  for (const user of users) {
    if (user.role === "admin" || user.role === "manager") continue;
    user.role = user.role === "hr_admin" || user.role === "payroll_admin" ? "admin" : "manager";
    await user.save();
  }
  console.log(`[db] using local file database at ${dir}`);
  void getDbDir;
}
