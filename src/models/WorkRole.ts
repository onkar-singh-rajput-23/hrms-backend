import { createModel } from "../config/localdb";

export interface IWorkRole {
  _id: string;
  area: string;
  areaHindi: string;
  responsibilities: string[];
  sortOrder: number;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export default createModel("workRoles", {
  dateFields: ["createdAt", "updatedAt"],
  refs: { updatedBy: "users" },
});
