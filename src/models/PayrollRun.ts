import { Schema, model, Document, Types } from "mongoose";

export interface IPayrollRun extends Document {
  month: number; // 1-12
  year: number;
  status: "draft" | "finalized";
  runBy?: Types.ObjectId;
  finalizedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const payrollRunSchema = new Schema<IPayrollRun>(
  {
    month: { type: Number, required: true, min: 1, max: 12 },
    year: { type: Number, required: true },
    status: { type: String, enum: ["draft", "finalized"], default: "draft" },
    runBy: { type: Schema.Types.ObjectId, ref: "User" },
    finalizedAt: { type: Date },
  },
  { timestamps: true }
);

payrollRunSchema.index({ month: 1, year: 1 }, { unique: true });

export default model<IPayrollRun>("PayrollRun", payrollRunSchema);
