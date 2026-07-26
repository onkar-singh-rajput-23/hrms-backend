import { createModel } from "../config/localdb";

export interface ILeaveRequest {
  _id: string;
  employee: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  days: number;
  reason?: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  approver?: string;
  decisionNote?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Was: Mongoose model("LeaveRequest"). Now backed by ./database/leaveRequests.json
export default createModel("leaveRequests", {
  dateFields: ["createdAt", "updatedAt"],
  defaults: { status: "pending" },
  refs: { employee: "employees", leaveType: "leaveTypes", approver: "employees" },
});
