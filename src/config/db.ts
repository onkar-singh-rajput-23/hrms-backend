import mongoose from "mongoose";

// MongoDB connection (via Mongoose). Reads MONGO_URI (e.g. a MongoDB Atlas SRV
// string in production, or a local mongod in development).
export async function connectDB(uri?: string): Promise<void> {
  const mongoUri = uri || process.env.MONGO_URI || "mongodb://localhost:27017/hrms";
  mongoose.set("strictQuery", true);
  await mongoose.connect(mongoUri);
  console.log("[db] connected to MongoDB");
}
