import express from "express";
import cors from "cors";
import morgan from "morgan";
import "express-async-errors";

import authRoutes from "./routes/auth.routes";
import userRoutes from "./routes/users.routes";
import departmentRoutes from "./routes/department.routes";
import employeeRoutes from "./routes/employee.routes";
import attendanceRoutes from "./routes/attendance.routes";
import leaveRoutes from "./routes/leave.routes";
import salaryRoutes from "./routes/salary.routes";
import payrollRoutes from "./routes/payroll.routes";
import taskRoutes from "./routes/task.routes";
import workRoleRoutes from "./routes/workRole.routes";
import { errorHandler } from "./middleware/errorHandler";

export function createApp() {
  const app = express();

  // CORS_ORIGIN may be "*" (allow any) or a comma-separated list of origins,
  // e.g. the local web app and the Android emulator origin (http://10.0.2.2:3001).
  // Note: "*" must be passed as the STRING "*", not ["*"] — the cors package
  // treats an array as an exact-match allowlist, so ["*"] would never match a
  // real origin and would silently block every browser request.
  const corsEnv = process.env.CORS_ORIGIN?.trim();
  const corsOrigin =
    !corsEnv || corsEnv === "*" ? "*" : corsEnv.split(",").map((origin) => origin.trim());
  app.use(cors({ origin: corsOrigin, credentials: true }));
  // Registration can include two optional identity documents encoded as data URLs.
  // Keep the limit bounded while allowing two 5 MB uploads plus base64 overhead.
  app.use(express.json({ limit: "15mb" }));
  app.use(morgan("dev"));

  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

  app.use("/api/auth", authRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/departments", departmentRoutes);
  app.use("/api/employees", employeeRoutes);
  app.use("/api/attendance", attendanceRoutes);
  app.use("/api/leave", leaveRoutes);
  app.use("/api/salary-structures", salaryRoutes);
  app.use("/api/payroll", payrollRoutes);
  app.use("/api/tasks", taskRoutes);
  app.use("/api/work-roles", workRoleRoutes);

  app.use((req, res) => {
    res.status(404).json({ message: `No route for ${req.method} ${req.path}` });
  });

  app.use(errorHandler);

  return app;
}
