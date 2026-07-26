import { Schema, model, Document, Types } from "mongoose";

export interface IAttendance extends Document {
  employee: Types.ObjectId;
  date: string; // YYYY-MM-DD
  checkIn?: Date;
  checkOut?: Date;
  status: "present" | "half_day" | "absent" | "on_leave";
  hoursWorked?: number;
  createdAt: Date;
  updatedAt: Date;
}

const attendanceSchema = new Schema<IAttendance>(
  {
    employee: { type: Schema.Types.ObjectId, ref: "Employee", required: true },
    date: { type: String, required: true },
    checkIn: { type: Date },
    checkOut: { type: Date },
    status: { type: String, enum: ["present", "half_day", "absent", "on_leave"], default: "present" },
    hoursWorked: { type: Number },
  },
  { timestamps: true }
);

attendanceSchema.index({ employee: 1, date: 1 }, { unique: true });

export default model<IAttendance>("Attendance", attendanceSchema);
