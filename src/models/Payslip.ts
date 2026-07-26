import { createModel } from "../config/localdb";

export interface IPayslip {
  _id: string;
  payrollRun: string;
  employee: string;
  basicSalary: number;
  lopDays: number;
  grossPay: number;
  deductions: number;
  netPay: number;
  createdAt: Date;
  updatedAt: Date;
}

// Was: Mongoose model("Payslip"). Now backed by ./database/payslips.json
export default createModel("payslips", {
  dateFields: ["createdAt", "updatedAt"],
  defaults: { lopDays: 0, deductions: 0 },
  refs: { payrollRun: "payrollRuns", employee: "employees" },
});
