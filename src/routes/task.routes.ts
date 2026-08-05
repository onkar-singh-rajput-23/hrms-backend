import { Router } from "express";
import { z } from "zod";
import DailyTask from "../models/DailyTask";
import Employee from "../models/Employee";
import { authenticate, requireRole, AuthRequest } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { assertCanManageEmployee, employeeScopeFilter } from "../utils/team";

const router = Router();

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

async function assertEmployeeExists(employeeId: string): Promise<void> {
  const employee = await Employee.findById(employeeId);
  if (!employee) throw new HttpError(404, "Employee not found");
}

router.get("/me", authenticate, async (req: AuthRequest, res) => {
  const employeeId = req.auth?.employeeId;
  if (!employeeId) throw new HttpError(400, "No employee record linked to this account");
  const date = String(req.query.date || todayStr());

  const tasks = await DailyTask.find({ employee: employeeId, date }).sort({ createdAt: 1 });
  res.json(tasks);
});

router.get("/", authenticate, requireRole("manager"), async (req: AuthRequest, res) => {
  const date = String(req.query.date || todayStr());
  const scope = await employeeScopeFilter(req.auth);
  const filter: Record<string, unknown> = { date, ...(scope || {}) };
  if (req.query.employeeId) {
    await assertCanManageEmployee(req.auth, String(req.query.employeeId));
    filter.employee = String(req.query.employeeId);
  }

  const tasks = await DailyTask.find(filter).populate("employee", "name employeeCode designation").sort({ createdAt: 1 });
  res.json(tasks);
});

const createSchema = z.object({
  employeeId: z.string().min(1),
  date: z.string().min(1).default(todayStr),
  title: z.string().min(1),
  description: z.string().optional(),
});

router.post("/", authenticate, requireRole("manager"), async (req: AuthRequest, res) => {
  const body = createSchema.parse(req.body);
  await assertEmployeeExists(body.employeeId);
  await assertCanManageEmployee(req.auth, body.employeeId);

  const task = await DailyTask.create({
    employee: body.employeeId,
    date: body.date,
    title: body.title,
    description: body.description,
    status: "todo",
    createdBy: req.auth?.userId,
  });

  res.status(201).json(task);
});

const updateSchema = createSchema.partial();

router.put("/:id", authenticate, requireRole("manager"), async (req: AuthRequest, res) => {
  const body = updateSchema.parse(req.body);
  if (body.employeeId) await assertEmployeeExists(body.employeeId);

  const existing = await DailyTask.findById(req.params.id);
  if (!existing) throw new HttpError(404, "Task not found");
  await assertCanManageEmployee(req.auth, String(existing.employee));
  if (body.employeeId) await assertCanManageEmployee(req.auth, body.employeeId);

  const update = {
    employee: body.employeeId,
    date: body.date,
    title: body.title,
    description: body.description,
  };

  const task = await DailyTask.findByIdAndUpdate(req.params.id, update, { new: true }).populate(
    "employee",
    "name employeeCode designation"
  );
  if (!task) throw new HttpError(404, "Task not found");
  res.json(task);
});

const statusUpdateSchema = z.object({
  status: z.enum(["todo", "in_progress", "pending_approval"]),
});

router.patch("/:id/status", authenticate, async (req: AuthRequest, res) => {
  const body = statusUpdateSchema.parse(req.body);
  const task = await DailyTask.findById(req.params.id);
  if (!task) throw new HttpError(404, "Task not found");

  const isOwnTask = req.auth?.employeeId && String(task.employee) === req.auth.employeeId;
  if (!isOwnTask) throw new HttpError(403, "You can only update your own task");
  if (task.status === "approved" || task.status === "done") {
    throw new HttpError(409, "A completed task must be reviewed by your manager");
  }

  task.status = body.status;
  await task.save();
  res.json(task);
});

const reviewSchema = z.object({ action: z.enum(["approve", "reopen"]) });

router.patch("/:id/review", authenticate, requireRole("manager"), async (req: AuthRequest, res) => {
  const { action } = reviewSchema.parse(req.body);
  const task = await DailyTask.findById(req.params.id);
  if (!task) throw new HttpError(404, "Task not found");
  await assertCanManageEmployee(req.auth, String(task.employee));

  if (action === "approve") {
    if (task.status !== "pending_approval" && task.status !== "done") {
      throw new HttpError(409, "Only submitted tasks can be approved");
    }
    task.status = "approved";
  } else {
    if (task.status !== "pending_approval" && task.status !== "approved" && task.status !== "done") {
      throw new HttpError(409, "Only submitted or approved tasks can be reopened");
    }
    task.status = "in_progress";
  }
  await task.save();
  res.json(task);
});

router.delete("/:id", authenticate, requireRole("manager"), async (req: AuthRequest, res) => {
  const existing = await DailyTask.findById(req.params.id);
  if (!existing) throw new HttpError(404, "Task not found");
  await assertCanManageEmployee(req.auth, String(existing.employee));
  const task = await DailyTask.findByIdAndDelete(req.params.id);
  if (!task) throw new HttpError(404, "Task not found");
  res.status(204).send();
});

export default router;
