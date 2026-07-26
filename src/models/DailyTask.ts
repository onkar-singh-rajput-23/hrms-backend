import { createModel } from "../config/localdb";

export interface IDailyTask {
  _id: string;
  employee: string;
  date: string; // YYYY-MM-DD
  title: string;
  description?: string;
  status: "todo" | "in_progress" | "done";
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Was: Mongoose model("DailyTask"). Now backed by ./database/dailyTasks.json
export default createModel("dailyTasks", {
  dateFields: ["createdAt", "updatedAt"],
  defaults: { status: "todo" },
  refs: { employee: "employees", createdBy: "users" },
});
