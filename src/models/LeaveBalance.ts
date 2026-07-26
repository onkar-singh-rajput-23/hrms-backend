import { Schema, model, Document, Types } from "mongoose";

export interface ILeaveBalance extends Document {
  employee: Types.ObjectId;
  leaveType: Types.ObjectId;
  year: number;
  allocated: number;
  used: number;
  createdAt: Date;
  updatedAt: Date;
}

const leaveBalanceSchema = new Schema<ILeaveBalance>(
  {
    employee: { type: Schema.Types.ObjectId, ref: "Employee", required: true },
    leaveType: { type: Schema.Types.ObjectId, ref: "LeaveType", required: true },
    year: { type: Number, required: true },
    allocated: { type: Number, required: true, default: 0 },
    used: { type: Number, required: true, default: 0 },
  },
  { timestamps: true }
);

leaveBalanceSchema.index({ employee: 1, leaveType: 1, year: 1 }, { unique: true });

export default model<ILeaveBalance>("LeaveBalance", leaveBalanceSchema);
