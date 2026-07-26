import { createModel } from "../config/localdb";

export interface IDepartment {
  _id: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Was: Mongoose model("Department"). Now backed by ./database/departments.json
export default createModel("departments", {
  dateFields: ["createdAt", "updatedAt"],
});
