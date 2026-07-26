import { Schema, model, Document, Types } from "mongoose";

export interface IEmployee extends Document {
  employeeCode: string;
  name: string;
  email: string;
  phone?: string;
  department?: Types.ObjectId;
  designation?: string;
  manager?: Types.ObjectId;
  dateOfJoining: Date;
  status: "active" | "exited";
  basicSalary: number;
  createdAt: Date;
  updatedAt: Date;
}

const employeeSchema = new Schema<IEmployee>(
  {
    employeeCode: { type: String, required: true, unique: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    department: { type: Schema.Types.ObjectId, ref: "Department" },
    designation: { type: String, trim: true },
    manager: { type: Schema.Types.ObjectId, ref: "Employee" },
    dateOfJoining: { type: Date, required: true, default: () => new Date() },
    status: { type: String, enum: ["active", "exited"], default: "active" },
    basicSalary: { type: Number, required: true, default: 0 },
  },
  { timestamps: true }
);

export default model<IEmployee>("Employee", employeeSchema);
