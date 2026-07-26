import { createModel } from "../config/localdb";

export interface ILeaveType {
  _id: string;
  name: string;
  code: string;
  defaultAnnualDays: number;
  createdAt: Date;
  updatedAt: Date;
}

// Was: Mongoose model("LeaveType"). Now backed by ./database/leaveTypes.json
export default createModel("leaveTypes", {
  dateFields: ["createdAt", "updatedAt"],
  defaults: { defaultAnnualDays: 12 },
});
