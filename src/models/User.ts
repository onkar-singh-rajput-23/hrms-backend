import { Schema, model, Document, Types } from "mongoose";
import { Role, ROLES } from "../types/roles";

export interface IUser extends Document {
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  fathersName?: string;
  temporaryAddress?: string;
  permanentAddress?: string;
  aadhaarLinkedMobileNumber?: string;
  aadhaarNumber?: string;
  aadhaarDocumentName?: string;
  aadhaarDocumentMimeType?: string;
  aadhaarDocumentData?: string;
  panNumber?: string;
  panDocumentName?: string;
  panDocumentMimeType?: string;
  panDocumentData?: string;
  employee?: Types.ObjectId;
  /**
   * Manager chosen at sign-up, held as an Employee id. A new account has no Employee record
   * yet, so this parks the choice until HR links/creates one and copies it to `Employee.manager`
   * (the field team scoping actually reads).
   */
  reportingManager?: Types.ObjectId;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ROLES, default: "employee" },
    fathersName: { type: String, trim: true },
    temporaryAddress: { type: String, trim: true },
    permanentAddress: { type: String, trim: true },
    aadhaarLinkedMobileNumber: { type: String, trim: true },
    aadhaarNumber: { type: String, trim: true },
    aadhaarDocumentName: { type: String, trim: true },
    aadhaarDocumentMimeType: { type: String, trim: true },
    aadhaarDocumentData: { type: String },
    panNumber: { type: String, trim: true },
    panDocumentName: { type: String, trim: true },
    panDocumentMimeType: { type: String, trim: true },
    panDocumentData: { type: String },
    employee: { type: Schema.Types.ObjectId, ref: "Employee" },
    reportingManager: { type: Schema.Types.ObjectId, ref: "Employee" },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default model<IUser>("User", userSchema);
