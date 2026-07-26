import { createModel } from "../config/localdb";

export interface ILeaveBalance {
  _id: string;
  employee: string;
  leaveType: string;
  year: number;
  allocated: number;
  used: number;
  createdAt: Date;
  updatedAt: Date;
}

// Was: Mongoose model("LeaveBalance"). Now backed by ./database/leaveBalances.json
export default createModel("leaveBalances", {
  dateFields: ["createdAt", "updatedAt"],
  defaults: { allocated: 0, used: 0 },
  refs: { employee: "employees", leaveType: "leaveTypes" },
});
