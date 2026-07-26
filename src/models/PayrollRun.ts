import { createModel } from "../config/localdb";

export interface IPayrollRun {
  _id: string;
  month: number; // 1-12
  year: number;
  status: "draft" | "finalized";
  runBy?: string;
  finalizedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Was: Mongoose model("PayrollRun"). Now backed by ./database/payrollRuns.json
export default createModel("payrollRuns", {
  dateFields: ["finalizedAt", "createdAt", "updatedAt"],
  defaults: { status: "draft" },
  refs: { runBy: "users" },
});
