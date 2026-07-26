import { createModel } from "../config/localdb";
import type { Role } from "../types/roles";

export interface IUser {
  _id: string;
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
  employee?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Was: Mongoose model("User"). Now backed by ./database/users.json
export default createModel("users", {
  dateFields: ["createdAt", "updatedAt"],
  defaults: { role: "manager", isActive: true },
  refs: { employee: "employees" },
});
