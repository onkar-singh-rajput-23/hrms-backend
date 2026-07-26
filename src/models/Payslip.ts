import { Schema, model, Document, Types } from "mongoose";

export interface IPayslip extends Document {
  payrollRun: Types.ObjectId;
  employee: Types.ObjectId;
  basicSalary: number;
  lopDays: number;
  grossPay: number;
  deductions: number;
  netPay: number;
  createdAt: Date;
  updatedAt: Date;
}

const payslipSchema = new Schema<IPayslip>(
  {
    payrollRun: { type: Schema.Types.ObjectId, ref: "PayrollRun", required: true },
    employee: { type: Schema.Types.ObjectId, ref: "Employee", required: true },
    basicSalary: { type: Number, required: true },
    lopDays: { type: Number, required: true, default: 0 },
    grossPay: { type: Number, required: true },
    deductions: { type: Number, required: true, default: 0 },
    netPay: { type: Number, required: true },
  },
  { timestamps: true }
);

payslipSchema.index({ payrollRun: 1, employee: 1 }, { unique: true });

export default model<IPayslip>("Payslip", payslipSchema);
