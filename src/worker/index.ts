/// <reference types="@cloudflare/workers-types" />
import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import {
  dbCtx,
  User,
  Employee,
  Department,
  Attendance,
  DailyTask,
  LeaveBalance,
  LeaveRequest,
  LeaveType,
  PayrollRun,
  Payslip,
  SalaryStructure,
} from "./db";
import { runSeed } from "./seed";

export interface Env {
  DB: D1Database;
  JWT_SECRET: string;
  JWT_EXPIRES_IN?: string;
  CORS_ORIGIN?: string;
  SEED_SECRET: string;
}

type Role = "admin" | "manager";
interface TokenPayload {
  userId: string;
  role: Role;
  employeeId?: string;
}
type Vars = { auth?: TokenPayload };

// --- error helper (mirrors Express HttpError + errorHandler) ---------------
class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// --- JWT via jose ----------------------------------------------------------
const enc = new TextEncoder();
async function signToken(payload: TokenPayload, env: Env): Promise<string> {
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(env.JWT_EXPIRES_IN || "7d")
    .sign(enc.encode(env.JWT_SECRET || "dev_secret"));
}
async function verifyToken(token: string, env: Env): Promise<TokenPayload> {
  const { payload } = await jwtVerify(token, enc.encode(env.JWT_SECRET || "dev_secret"));
  return payload as unknown as TokenPayload;
}

// --- misc helpers ----------------------------------------------------------
const todayStr = () => new Date().toISOString().slice(0, 10);
const daysInMonth = (month: number, year: number) => new Date(year, month, 0).getDate();
function daysBetweenInclusive(start: string, end: string): number {
  const diff = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1;
  return Math.max(diff, 0);
}
const body = async (c: any) => (await c.req.json().catch(() => ({}))) as any;

const app = new Hono<{ Bindings: Env; Variables: Vars }>();

// CORS (supports comma-separated CORS_ORIGIN, "*" allows any)
app.use("*", cors({
  origin: (origin, c) => {
    const conf = (c.env as Env).CORS_ORIGIN;
    if (!conf || conf === "*") return origin || "*";
    const list = conf.split(",").map((s) => s.trim());
    return list.includes(origin) ? origin : list[0];
  },
  credentials: true,
}));

// Carry the D1 binding through AsyncLocalStorage so the models can reach it.
app.use("*", (c, next) => dbCtx.run(c.env.DB, next));

// --- auth middleware -------------------------------------------------------
const authenticate = async (c: any, next: any) => {
  const header = c.req.header("authorization");
  if (!header || !header.startsWith("Bearer ")) return c.json({ message: "Missing or invalid Authorization header" }, 401);
  try {
    c.set("auth", await verifyToken(header.slice("Bearer ".length), c.env));
    await next();
  } catch {
    return c.json({ message: "Invalid or expired token" }, 401);
  }
};
const requireRole = (...roles: Role[]) => async (c: any, next: any) => {
  const auth = c.get("auth") as TokenPayload | undefined;
  if (!auth) return c.json({ message: "Not authenticated" }, 401);
  if (auth.role === "admin" || roles.includes(auth.role)) return next();
  return c.json({ message: "You do not have permission to perform this action" }, 403);
};

// --- health + seed ---------------------------------------------------------
app.get("/api/health", (c) => c.json({ status: "ok" }));

app.post("/api/admin/seed", async (c) => {
  const secret = c.req.header("x-seed-secret");
  if (!secret || secret !== c.env.SEED_SECRET) return c.json({ message: "Unauthorized" }, 401);
  return c.json(await runSeed());
});

// ============================ AUTH ========================================
const registerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["manager", "admin"]).default("manager"),
  employeeId: z.string().optional(),
});
app.post("/api/auth/register", authenticate, requireRole("admin"), async (c) => {
  const b = registerSchema.parse(await body(c));
  if (await User.findOne({ email: b.email })) throw new HttpError(409, "A user with this email already exists");
  const passwordHash = await bcrypt.hash(b.password, 10);
  const user = await User.create({ name: b.name, email: b.email, passwordHash, role: b.role, employee: b.employeeId });
  return c.json({ id: user._id, name: user.name, email: user.email, role: user.role }, 201);
});

const signupSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name"),
  fathersName: z.string().trim().min(2, "Enter your father's name"),
  temporaryAddress: z.string().trim().min(5, "Enter your temporary address"),
  permanentAddress: z.string().trim().min(5, "Enter your permanent address"),
  aadhaarLinkedMobileNumber: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Aadhaar-linked mobile number"),
  aadhaarNumber: z.string().regex(/^\d{12}$/, "Enter a valid 12-digit Aadhaar number"),
  aadhaarDocument: z
    .object({ fileName: z.string().min(1), mimeType: z.enum(["application/pdf", "image/jpeg", "image/png"]), data: z.string().max(7_000_000, "Aadhaar document must be 5 MB or smaller") })
    .optional(),
  panNumber: z.string().regex(/^[A-Z]{5}\d{4}[A-Z]$/, "Enter a valid PAN number, for example ABCDE1234F"),
  panDocument: z
    .object({ fileName: z.string().min(1), mimeType: z.enum(["application/pdf", "image/jpeg", "image/png"]), data: z.string().max(7_000_000, "PAN document must be 5 MB or smaller") })
    .optional(),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["manager"]).default("manager"),
});
app.post("/api/auth/signup", async (c) => {
  const b = signupSchema.parse(await body(c));
  if (await User.findOne({ email: b.email })) throw new HttpError(409, "A user with this email already exists");
  const passwordHash = await bcrypt.hash(b.password, 10);
  const user = await User.create({
    name: b.name,
    fathersName: b.fathersName,
    temporaryAddress: b.temporaryAddress,
    permanentAddress: b.permanentAddress,
    aadhaarLinkedMobileNumber: b.aadhaarLinkedMobileNumber,
    aadhaarNumber: b.aadhaarNumber,
    aadhaarDocumentName: b.aadhaarDocument?.fileName,
    aadhaarDocumentMimeType: b.aadhaarDocument?.mimeType,
    aadhaarDocumentData: b.aadhaarDocument?.data,
    panNumber: b.panNumber,
    panDocumentName: b.panDocument?.fileName,
    panDocumentMimeType: b.panDocument?.mimeType,
    panDocumentData: b.panDocument?.data,
    email: b.email,
    passwordHash,
    role: b.role,
  });
  const token = await signToken({ userId: String(user._id), role: user.role }, c.env);
  return c.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role, employeeId: user.employee } }, 201);
});

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
app.post("/api/auth/login", async (c) => {
  const b = loginSchema.parse(await body(c));
  const user = await User.findOne({ email: b.email });
  if (!user || !user.isActive) throw new HttpError(401, "Invalid email or password");
  if (!(await bcrypt.compare(b.password, user.passwordHash))) throw new HttpError(401, "Invalid email or password");
  const token = await signToken(
    { userId: String(user._id), role: user.role, employeeId: user.employee ? String(user.employee) : undefined },
    c.env
  );
  return c.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role, employeeId: user.employee } });
});

app.get("/api/auth/me", authenticate, async (c) => {
  const user = await User.findById(c.get("auth")!.userId).populate("employee");
  if (!user) throw new HttpError(404, "User not found");
  return c.json({ id: user._id, name: user.name, email: user.email, role: user.role, employee: user.employee });
});

// ============================ USERS =======================================
app.get("/api/users", authenticate, requireRole("admin"), async (c) => {
  const users = await User.find().select("-passwordHash -aadhaarDocumentData -panDocumentData").populate("employee", "name employeeCode").sort({ name: 1 });
  return c.json(users);
});
app.put("/api/users/:id/role", authenticate, requireRole("admin"), async (c) => {
  const b = z.object({ role: z.enum(["manager", "admin"]) }).parse(await body(c));
  const user = await User.findByIdAndUpdate(c.req.param("id"), { role: b.role }, { new: true }).select("-passwordHash");
  if (!user) throw new HttpError(404, "User not found");
  return c.json(user);
});

// ========================= DEPARTMENTS ====================================
app.get("/api/departments", authenticate, async (c) => c.json(await Department.find().sort({ name: 1 })));
const deptSchema = z.object({ name: z.string().min(1), description: z.string().optional() });
app.post("/api/departments", authenticate, requireRole("admin"), async (c) => {
  const dept = await Department.create(deptSchema.parse(await body(c)));
  return c.json(dept, 201);
});
app.put("/api/departments/:id", authenticate, requireRole("admin"), async (c) => {
  const dept = await Department.findByIdAndUpdate(c.req.param("id"), deptSchema.partial().parse(await body(c)), { new: true });
  return c.json(dept);
});
app.delete("/api/departments/:id", authenticate, requireRole("admin"), async (c) => {
  await Department.findByIdAndDelete(c.req.param("id"));
  return c.body(null, 204);
});

// ========================== EMPLOYEES =====================================
const empCreateSchema = z.object({
  employeeCode: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  department: z.string().optional(),
  designation: z.string().optional(),
  manager: z.string().optional(),
  dateOfJoining: z.string().optional(),
  basicSalary: z.number().nonnegative().default(0),
});
app.get("/api/employees", authenticate, requireRole("manager"), async (c) => {
  const employees = await Employee.find().populate("department").populate("manager", "name employeeCode").sort({ name: 1 });
  return c.json(employees);
});
app.get("/api/employees/me", authenticate, async (c) => {
  const auth = c.get("auth")!;
  if (!auth.employeeId) throw new HttpError(404, "No employee record linked to this account");
  const employee = await Employee.findById(auth.employeeId).populate("department").populate("manager", "name employeeCode");
  if (!employee) throw new HttpError(404, "Employee not found");
  return c.json(employee);
});
app.get("/api/employees/:id", authenticate, async (c) => {
  const employee = await Employee.findById(c.req.param("id")).populate("department").populate("manager", "name employeeCode");
  if (!employee) throw new HttpError(404, "Employee not found");
  return c.json(employee);
});
app.post("/api/employees", authenticate, requireRole("admin"), async (c) => {
  const b = empCreateSchema.parse(await body(c));
  const employee = await Employee.create({ ...b, dateOfJoining: b.dateOfJoining ? new Date(b.dateOfJoining) : new Date() });
  return c.json(employee, 201);
});
app.put("/api/employees/:id", authenticate, requireRole("admin"), async (c) => {
  const b = empCreateSchema.partial().extend({ status: z.enum(["active", "exited"]).optional() }).parse(await body(c));
  const employee = await Employee.findByIdAndUpdate(
    c.req.param("id"),
    { ...b, dateOfJoining: b.dateOfJoining ? new Date(b.dateOfJoining) : undefined },
    { new: true }
  );
  if (!employee) throw new HttpError(404, "Employee not found");
  return c.json(employee);
});
app.delete("/api/employees/:id", authenticate, requireRole("admin"), async (c) => {
  await Employee.findByIdAndUpdate(c.req.param("id"), { status: "exited" });
  return c.body(null, 204);
});

// ========================== ATTENDANCE ====================================
app.post("/api/attendance/punch-in", authenticate, async (c) => {
  const employeeId = c.get("auth")!.employeeId;
  if (!employeeId) throw new HttpError(400, "No employee record linked to this account");
  const date = todayStr();
  const existing = await Attendance.findOne({ employee: employeeId, date });
  if (existing?.checkIn) throw new HttpError(409, "Already punched in today");
  const record = existing
    ? await Attendance.findOneAndUpdate({ employee: employeeId, date }, { checkIn: new Date() }, { new: true })
    : await Attendance.create({ employee: employeeId, date, checkIn: new Date(), status: "present" });
  return c.json(record, 201);
});
app.post("/api/attendance/punch-out", authenticate, async (c) => {
  const employeeId = c.get("auth")!.employeeId;
  if (!employeeId) throw new HttpError(400, "No employee record linked to this account");
  const record = await Attendance.findOne({ employee: employeeId, date: todayStr() });
  if (!record || !record.checkIn) throw new HttpError(400, "You must punch in before punching out");
  if (record.checkOut) throw new HttpError(409, "Already punched out today");
  record.checkOut = new Date();
  record.hoursWorked = Number(((record.checkOut.getTime() - record.checkIn.getTime()) / 36e5).toFixed(2));
  await record.save();
  return c.json(record);
});
app.get("/api/attendance/me", authenticate, async (c) => {
  const employeeId = c.get("auth")!.employeeId;
  if (!employeeId) throw new HttpError(400, "No employee record linked to this account");
  return c.json(await Attendance.find({ employee: employeeId }).sort({ date: -1 }).limit(60));
});
app.get("/api/attendance/team", authenticate, requireRole("manager"), async (c) => {
  const date = c.req.query("date");
  const filter: Record<string, unknown> = {};
  if (date) filter.date = String(date);
  return c.json(await Attendance.find(filter).populate("employee", "name employeeCode department").sort({ date: -1 }).limit(200));
});
app.get("/api/attendance/employee/:employeeId", authenticate, requireRole("manager"), async (c) => {
  const employee = await Employee.findById(c.req.param("employeeId"));
  if (!employee) throw new HttpError(404, "Employee not found");
  return c.json(await Attendance.find({ employee: c.req.param("employeeId") }).sort({ date: -1 }).limit(90));
});

// ============================ LEAVE =======================================
app.get("/api/leave/types", authenticate, async (c) => c.json(await LeaveType.find().sort({ name: 1 })));
app.post("/api/leave/types", authenticate, requireRole("admin"), async (c) => {
  const b = z.object({ name: z.string().min(1), code: z.string().min(1), defaultAnnualDays: z.number().nonnegative().default(12) }).parse(await body(c));
  return c.json(await LeaveType.create(b), 201);
});
app.get("/api/leave/balances/me", authenticate, async (c) => {
  const employeeId = c.get("auth")!.employeeId;
  if (!employeeId) throw new HttpError(400, "No employee record linked to this account");
  const year = Number(c.req.query("year")) || new Date().getFullYear();
  return c.json(await LeaveBalance.find({ employee: employeeId, year }).populate("leaveType"));
});
app.post("/api/leave/balances/allocate", authenticate, requireRole("admin"), async (c) => {
  const b = z.object({ employeeId: z.string(), leaveTypeId: z.string(), year: z.number(), allocated: z.number().nonnegative() }).parse(await body(c));
  const balance = await LeaveBalance.findOneAndUpdate(
    { employee: b.employeeId, leaveType: b.leaveTypeId, year: b.year },
    { $set: { allocated: b.allocated } },
    { upsert: true, new: true }
  );
  return c.json(balance);
});
app.get("/api/leave/requests/me", authenticate, async (c) => {
  const employeeId = c.get("auth")!.employeeId;
  if (!employeeId) throw new HttpError(400, "No employee record linked to this account");
  return c.json(await LeaveRequest.find({ employee: employeeId }).populate("leaveType").sort({ createdAt: -1 }));
});
app.get("/api/leave/requests", authenticate, requireRole("manager"), async (c) => {
  const status = c.req.query("status");
  const filter: Record<string, unknown> = {};
  if (status) filter.status = String(status);
  return c.json(await LeaveRequest.find(filter).populate("leaveType").populate("employee", "name employeeCode department manager").sort({ createdAt: -1 }));
});
app.post("/api/leave/requests", authenticate, async (c) => {
  const employeeId = c.get("auth")!.employeeId;
  if (!employeeId) throw new HttpError(400, "No employee record linked to this account");
  const b = z.object({ leaveTypeId: z.string(), startDate: z.string(), endDate: z.string(), reason: z.string().optional() }).parse(await body(c));
  const days = daysBetweenInclusive(b.startDate, b.endDate);
  if (days <= 0) throw new HttpError(400, "End date must be on or after start date");
  const request = await LeaveRequest.create({ employee: employeeId, leaveType: b.leaveTypeId, startDate: b.startDate, endDate: b.endDate, days, reason: b.reason, status: "pending" });
  return c.json(request, 201);
});
app.put("/api/leave/requests/:id/approve", authenticate, requireRole("manager"), async (c) => {
  const request = await LeaveRequest.findById(c.req.param("id"));
  if (!request) throw new HttpError(404, "Leave request not found");
  if (request.status !== "pending") throw new HttpError(409, "Only pending requests can be approved");
  request.status = "approved";
  request.approver = c.get("auth")!.employeeId;
  await request.save();
  const year = new Date(request.startDate).getFullYear();
  await LeaveBalance.findOneAndUpdate(
    { employee: request.employee, leaveType: request.leaveType, year },
    { $inc: { used: request.days }, $setOnInsert: { allocated: 0 } },
    { upsert: true }
  );
  const start = new Date(request.startDate);
  const end = new Date(request.endDate);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().slice(0, 10);
    await Attendance.findOneAndUpdate({ employee: request.employee, date: dateStr }, { $set: { status: "on_leave" } }, { upsert: true });
  }
  return c.json(request);
});
app.put("/api/leave/requests/:id/reject", authenticate, requireRole("manager"), async (c) => {
  const b = z.object({ note: z.string().optional() }).parse(await body(c));
  const request = await LeaveRequest.findById(c.req.param("id"));
  if (!request) throw new HttpError(404, "Leave request not found");
  if (request.status !== "pending") throw new HttpError(409, "Only pending requests can be rejected");
  request.status = "rejected";
  request.decisionNote = b.note;
  request.approver = c.get("auth")!.employeeId;
  await request.save();
  return c.json(request);
});

// ====================== SALARY STRUCTURES =================================
app.get("/api/salary-structures/:employeeId", authenticate, requireRole("admin"), async (c) => {
  return c.json(await SalaryStructure.findOne({ employee: c.req.param("employeeId") }).sort({ effectiveFrom: -1 }));
});
app.post("/api/salary-structures", authenticate, requireRole("admin"), async (c) => {
  const b = z.object({ employeeId: z.string(), basic: z.number().nonnegative(), hra: z.number().nonnegative().default(0), allowances: z.number().nonnegative().default(0), effectiveFrom: z.string().optional() }).parse(await body(c));
  const structure = await SalaryStructure.create({ employee: b.employeeId, basic: b.basic, hra: b.hra, allowances: b.allowances, effectiveFrom: b.effectiveFrom ? new Date(b.effectiveFrom) : new Date() });
  return c.json(structure, 201);
});

// =========================== PAYROLL ======================================
app.post("/api/payroll/run", authenticate, requireRole("admin"), async (c) => {
  const b = z.object({ month: z.number().min(1).max(12), year: z.number().min(2000) }).parse(await body(c));
  if (await PayrollRun.findOne({ month: b.month, year: b.year })) throw new HttpError(409, "A payroll run already exists for this month");
  const payrollRun = await PayrollRun.create({ month: b.month, year: b.year, status: "draft", runBy: c.get("auth")!.userId });
  const employees = await Employee.find({ status: "active" });
  const totalDays = daysInMonth(b.month, b.year);
  const monthPrefix = `${b.year}-${String(b.month).padStart(2, "0")}`;
  for (const employee of employees) {
    const structure = await SalaryStructure.findOne({ employee: employee._id }).sort({ effectiveFrom: -1 });
    const basic = structure?.basic ?? employee.basicSalary ?? 0;
    const hra = structure?.hra ?? 0;
    const allowances = structure?.allowances ?? 0;
    const gross = basic + hra + allowances;
    const absentCount = await Attendance.countDocuments({ employee: employee._id, date: { $regex: `^${monthPrefix}` }, status: "absent" });
    const deductions = Math.round((gross / totalDays) * absentCount * 100) / 100;
    const netPay = Math.round((gross - deductions) * 100) / 100;
    await Payslip.create({ payrollRun: payrollRun._id, employee: employee._id, basicSalary: basic, lopDays: absentCount, grossPay: gross, deductions, netPay });
  }
  payrollRun.status = "finalized";
  payrollRun.finalizedAt = new Date();
  await payrollRun.save();
  return c.json(payrollRun, 201);
});
app.get("/api/payroll/runs", authenticate, requireRole("admin"), async (c) => c.json(await PayrollRun.find().sort({ year: -1, month: -1 })));
app.get("/api/payroll/runs/:id/payslips", authenticate, requireRole("admin"), async (c) => {
  return c.json(await Payslip.find({ payrollRun: c.req.param("id") }).populate("employee", "name employeeCode"));
});
app.get("/api/payroll/payslips/me", authenticate, async (c) => {
  const employeeId = c.get("auth")!.employeeId;
  if (!employeeId) throw new HttpError(400, "No employee record linked to this account");
  return c.json(await Payslip.find({ employee: employeeId }).populate("payrollRun").sort({ createdAt: -1 }));
});
app.get("/api/payroll/payslips/employee/:employeeId", authenticate, requireRole("admin"), async (c) => {
  return c.json(await Payslip.find({ employee: c.req.param("employeeId") }).populate("payrollRun").sort({ createdAt: -1 }));
});

// ============================ TASKS =======================================
const taskStatus = z.enum(["todo", "in_progress", "done"]);
app.get("/api/tasks/me", authenticate, async (c) => {
  const employeeId = c.get("auth")!.employeeId;
  if (!employeeId) throw new HttpError(400, "No employee record linked to this account");
  const date = String(c.req.query("date") || todayStr());
  return c.json(await DailyTask.find({ employee: employeeId, date }).sort({ createdAt: 1 }));
});
app.get("/api/tasks", authenticate, requireRole("admin"), async (c) => {
  const date = String(c.req.query("date") || todayStr());
  const filter: Record<string, unknown> = { date };
  const employeeId = c.req.query("employeeId");
  if (employeeId) filter.employee = String(employeeId);
  return c.json(await DailyTask.find(filter).populate("employee", "name employeeCode designation").sort({ createdAt: 1 }));
});
app.post("/api/tasks", authenticate, requireRole("admin"), async (c) => {
  const b = z.object({ employeeId: z.string().min(1), date: z.string().min(1).default(todayStr()), title: z.string().min(1), description: z.string().optional(), status: taskStatus.default("todo") }).parse(await body(c));
  if (!(await Employee.findById(b.employeeId))) throw new HttpError(404, "Employee not found");
  const task = await DailyTask.create({ employee: b.employeeId, date: b.date, title: b.title, description: b.description, status: b.status, createdBy: c.get("auth")!.userId });
  return c.json(task, 201);
});
app.put("/api/tasks/:id", authenticate, requireRole("admin"), async (c) => {
  const b = z.object({ employeeId: z.string().optional(), date: z.string().optional(), title: z.string().optional(), description: z.string().optional(), status: taskStatus.optional() }).parse(await body(c));
  if (b.employeeId && !(await Employee.findById(b.employeeId))) throw new HttpError(404, "Employee not found");
  const task = await DailyTask.findByIdAndUpdate(
    c.req.param("id"),
    { employee: b.employeeId, date: b.date, title: b.title, description: b.description, status: b.status },
    { new: true }
  ).populate("employee", "name employeeCode designation");
  if (!task) throw new HttpError(404, "Task not found");
  return c.json(task);
});
app.patch("/api/tasks/:id/status", authenticate, async (c) => {
  const b = z.object({ status: taskStatus }).parse(await body(c));
  const task = await DailyTask.findById(c.req.param("id"));
  if (!task) throw new HttpError(404, "Task not found");
  const auth = c.get("auth")!;
  const isOwnTask = auth.employeeId && String(task.employee) === auth.employeeId;
  if (auth.role !== "admin" && !isOwnTask) throw new HttpError(403, "You do not have permission to update this task");
  task.status = b.status;
  await task.save();
  return c.json(task);
});
app.delete("/api/tasks/:id", authenticate, requireRole("admin"), async (c) => {
  const task = await DailyTask.findByIdAndDelete(c.req.param("id"));
  if (!task) throw new HttpError(404, "Task not found");
  return c.body(null, 204);
});

// --- 404 + error handling --------------------------------------------------
app.notFound((c) => c.json({ message: `No route for ${c.req.method} ${c.req.path}` }, 404));
app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ message: err.message }, err.status as any);
  return c.json({ message: err.message || "Internal server error" }, 500);
});

export default app;
