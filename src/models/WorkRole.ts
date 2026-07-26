import { Schema, model, Document, Types } from "mongoose";

export interface IWorkRole extends Document {
  area: string;
  areaHindi: string;
  responsibilities: string[];
  sortOrder: number;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const workRoleSchema = new Schema<IWorkRole>(
  {
    area: { type: String, required: true, trim: true },
    areaHindi: { type: String, required: true, trim: true },
    responsibilities: { type: [String], default: [] },
    sortOrder: { type: Number, required: true, default: 0 },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export default model<IWorkRole>("WorkRole", workRoleSchema);
