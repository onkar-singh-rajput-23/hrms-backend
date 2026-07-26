import { createModel } from "../config/localdb";

export interface IAttendance {
  _id: string;
  employee: string;
  date: string; // YYYY-MM-DD
  checkIn?: Date;
  checkOut?: Date;
  status: "present" | "half_day" | "absent" | "on_leave";
  hoursWorked?: number;
  createdAt: Date;
  updatedAt: Date;
}

// Was: Mongoose model("Attendance"). Now backed by ./database/attendance.json
export default createModel("attendance", {
  dateFields: ["checkIn", "checkOut", "createdAt", "updatedAt"],
  defaults: { status: "present" },
  refs: { employee: "employees" },
});
