import { Router } from "express";
import { z } from "zod";
import DailyTask from "../models/DailyTask";
import Employee from "../models/Employee";
import { authenticate, requireRole, AuthRequest } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";

const router = Router();

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

async function assertEmployeeExists(employeeId: string): Promise<void> {
  const employee = await Employee.findById(employeeId);
  if (!employee) throw new HttpError(404, "Employee not found");
}

const statusSchema = z.enum(["todo", "in_progress", "done"]);

router.get("/me", authenticate, async (req: AuthRequest, res) => {
  const employeeId = req.auth?.employeeId;
  if (!employeeId) throw new HttpError(400, "No employee record linked to this account");
  const date = String(req.query.date || todayStr());

  const tasks = await DailyTask.find({ employee: employeeId, date }).sort({ createdAt: 1 });
  res.json(tasks);
});

router.get("/", authenticate, requireRole("admin"), async (req, res) => {
  const date = String(req.query.date || todayStr());
  const filter: Record<string, unknown> = { date };
  if (req.query.employeeId) filter.employee = String(req.query.employeeId);

  const tasks = await DailyTask.find(filter).populate("employee", "name employeeCode designation").sort({ createdAt: 1 });
  res.json(tasks);
});

const createSchema = z.object({
  employeeId: z.string().min(1),
  date: z.string().min(1).default(todayStr),
  title: z.string().min(1),
  description: z.string().optional(),
  status: statusSchema.default("todo"),
});

router.post("/", authenticate, requireRole("admin"), async (req: AuthRequest, res) => {
  const body = createSchema.parse(req.body);
  await assertEmployeeExists(body.employeeId);

  const task = await DailyTask.create({
    employee: body.employeeId,
    date: body.date,
    title: body.title,
    description: body.description,
    status: body.status,
    createdBy: req.auth?.userId,
  });

  res.status(201).json(task);
});

const updateSchema = createSchema.partial().extend({
  status: statusSchema.optional(),
});

router.put("/:id", authenticate, requireRole("admin"), async (req, res) => {
  const body = updateSchema.parse(req.body);
  if (body.employeeId) await assertEmployeeExists(body.employeeId);

  const update = {
    employee: body.employeeId,
    date: body.date,
    title: body.title,
    description: body.description,
    status: body.status,
  };

  const task = await DailyTask.findByIdAndUpdate(req.params.id, update, { new: true }).populate(
    "employee",
    "name employeeCode designation"
  );
  if (!task) throw new HttpError(404, "Task not found");
  res.json(task);
});

const statusUpdateSchema = z.object({
  status: statusSchema,
});

router.patch("/:id/status", authenticate, async (req: AuthRequest, res) => {
  const body = statusUpdateSchema.parse(req.body);
  const task = await DailyTask.findById(req.params.id);
  if (!task) throw new HttpError(404, "Task not found");

  const isAdmin = req.auth?.role === "admin";
  const isOwnTask = req.auth?.employeeId && String(task.employee) === req.auth.employeeId;
  if (!isAdmin && !isOwnTask) throw new HttpError(403, "You do not have permission to update this task");

  task.status = body.status;
  await task.save();
  res.json(task);
});

router.delete("/:id", authenticate, requireRole("admin"), async (req, res) => {
  const task = await DailyTask.findByIdAndDelete(req.params.id);
  if (!task) throw new HttpError(404, "Task not found");
  res.status(204).send();
});

export default router;
