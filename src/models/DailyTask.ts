import { Schema, model, Document, Types } from "mongoose";

export interface IDailyTask extends Document {
  employee: Types.ObjectId;
  date: string; // YYYY-MM-DD
  title: string;
  description?: string;
  status: "todo" | "in_progress" | "done";
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const dailyTaskSchema = new Schema<IDailyTask>(
  {
    employee: { type: Schema.Types.ObjectId, ref: "Employee", required: true },
    date: { type: String, required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    status: { type: String, enum: ["todo", "in_progress", "done"], default: "todo" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

dailyTaskSchema.index({ employee: 1, date: 1, status: 1 });

export default model<IDailyTask>("DailyTask", dailyTaskSchema);
