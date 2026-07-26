import { Schema, model, Document, Types } from "mongoose";

export interface ILeaveRequest extends Document {
  employee: Types.ObjectId;
  leaveType: Types.ObjectId;
  startDate: string;
  endDate: string;
  days: number;
  reason?: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  approver?: Types.ObjectId;
  decisionNote?: string;
  createdAt: Date;
  updatedAt: Date;
}

const leaveRequestSchema = new Schema<ILeaveRequest>(
  {
    employee: { type: Schema.Types.ObjectId, ref: "Employee", required: true },
    leaveType: { type: Schema.Types.ObjectId, ref: "LeaveType", required: true },
    startDate: { type: String, required: true },
    endDate: { type: String, required: true },
    days: { type: Number, required: true },
    reason: { type: String },
    status: { type: String, enum: ["pending", "approved", "rejected", "cancelled"], default: "pending" },
    approver: { type: Schema.Types.ObjectId, ref: "Employee" },
    decisionNote: { type: String },
  },
  { timestamps: true }
);

export default model<ILeaveRequest>("LeaveRequest", leaveRequestSchema);
