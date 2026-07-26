import { Schema, model, Document, Types } from "mongoose";

export interface ISalaryStructure extends Document {
  employee: Types.ObjectId;
  basic: number;
  hra: number;
  allowances: number;
  effectiveFrom: Date;
  createdAt: Date;
  updatedAt: Date;
}

const salaryStructureSchema = new Schema<ISalaryStructure>(
  {
    employee: { type: Schema.Types.ObjectId, ref: "Employee", required: true },
    basic: { type: Number, required: true, default: 0 },
    hra: { type: Number, required: true, default: 0 },
    allowances: { type: Number, required: true, default: 0 },
    effectiveFrom: { type: Date, required: true, default: () => new Date() },
  },
  { timestamps: true }
);

export default model<ISalaryStructure>("SalaryStructure", salaryStructureSchema);
