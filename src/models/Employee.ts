import { createModel } from "../config/localdb";

export interface IEmployee {
  _id: string;
  employeeCode: string;
  name: string;
  email: string;
  phone?: string;
  department?: string;
  designation?: string;
  manager?: string;
  dateOfJoining: Date;
  status: "active" | "exited";
  basicSalary: number;
  createdAt: Date;
  updatedAt: Date;
}

// Was: Mongoose model("Employee"). Now backed by ./database/employees.json
export default createModel("employees", {
  dateFields: ["dateOfJoining", "createdAt", "updatedAt"],
  defaults: { status: "active", basicSalary: 0 },
  refs: { department: "departments", manager: "employees" },
});
