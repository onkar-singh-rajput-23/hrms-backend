import { Schema, model, Document } from "mongoose";

export interface ILeaveType extends Document {
  name: string;
  code: string;
  defaultAnnualDays: number;
  createdAt: Date;
  updatedAt: Date;
}

const leaveTypeSchema = new Schema<ILeaveType>(
  {
    name: { type: String, required: true },
    code: { type: String, required: true, unique: true, uppercase: true },
    defaultAnnualDays: { type: Number, required: true, default: 12 },
  },
  { timestamps: true }
);

export default model<ILeaveType>("LeaveType", leaveTypeSchema);
