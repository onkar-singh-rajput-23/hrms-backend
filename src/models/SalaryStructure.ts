import { createModel } from "../config/localdb";

export interface ISalaryStructure {
  _id: string;
  employee: string;
  basic: number;
  hra: number;
  allowances: number;
  effectiveFrom: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Was: Mongoose model("SalaryStructure"). Now backed by ./database/salaryStructures.json
export default createModel("salaryStructures", {
  dateFields: ["effectiveFrom", "createdAt", "updatedAt"],
  defaults: { basic: 0, hra: 0, allowances: 0 },
  refs: { employee: "employees" },
});
