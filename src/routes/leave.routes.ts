import { Router } from "express";
import { z } from "zod";
import LeaveType from "../models/LeaveType";
import LeaveBalance from "../models/LeaveBalance";
import LeaveRequest from "../models/LeaveRequest";
import Employee from "../models/Employee";
import Attendance from "../models/Attendance";
import { authenticate, requireRole, AuthRequest } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";

const router = Router();

function daysBetweenInclusive(start: string, end: string): number {
  const s = new Date(start);
  const e = new Date(end);
  const diff = Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
  return Math.max(diff, 0);
}

// --- Leave types (HR admin configures) ---
router.get("/types", authenticate, async (_req, res) => {
  const types = await LeaveType.find().sort({ name: 1 });
  res.json(types);
});

const leaveTypeSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  defaultAnnualDays: z.number().nonnegative().default(12),
});

router.post("/types", authenticate, requireRole("admin"), async (req, res) => {
  const body = leaveTypeSchema.parse(req.body);
  const type = await LeaveType.create(body);
  res.status(201).json(type);
});

// --- Balances ---
router.get("/balances/me", authenticate, async (req: AuthRequest, res) => {
  const employeeId = req.auth?.employeeId;
  if (!employeeId) throw new HttpError(400, "No employee record linked to this account");
  const year = Number(req.query.year) || new Date().getFullYear();
  const balances = await LeaveBalance.find({ employee: employeeId, year }).populate("leaveType");
  res.json(balances);
});

router.post("/balances/allocate", authenticate, requireRole("admin"), async (req, res) => {
  const schema = z.object({
    employeeId: z.string(),
    leaveTypeId: z.string(),
    year: z.number(),
    allocated: z.number().nonnegative(),
  });
  const body = schema.parse(req.body);
  const balance = await LeaveBalance.findOneAndUpdate(
    { employee: body.employeeId, leaveType: body.leaveTypeId, year: body.year },
    { $set: { allocated: body.allocated } },
    { upsert: true, new: true }
  );
  res.json(balance);
});

// --- Requests ---
router.get("/requests/me", authenticate, async (req: AuthRequest, res) => {
  const employeeId = req.auth?.employeeId;
  if (!employeeId) throw new HttpError(400, "No employee record linked to this account");
  const requests = await LeaveRequest.find({ employee: employeeId }).populate("leaveType").sort({ createdAt: -1 });
  res.json(requests);
});

router.get("/requests", authenticate, requireRole("manager"), async (req, res) => {
  const { status } = req.query;
  const filter: Record<string, unknown> = {};
  if (status) filter.status = String(status);
  const requests = await LeaveRequest.find(filter)
    .populate("leaveType")
    .populate("employee", "name employeeCode department manager")
    .sort({ createdAt: -1 });
  res.json(requests);
});

const requestSchema = z.object({
  leaveTypeId: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  reason: z.string().optional(),
});

router.post("/requests", authenticate, async (req: AuthRequest, res) => {
  const employeeId = req.auth?.employeeId;
  if (!employeeId) throw new HttpError(400, "No employee record linked to this account");
  const body = requestSchema.parse(req.body);
  const days = daysBetweenInclusive(body.startDate, body.endDate);
  if (days <= 0) throw new HttpError(400, "End date must be on or after start date");

  const request = await LeaveRequest.create({
    employee: employeeId,
    leaveType: body.leaveTypeId,
    startDate: body.startDate,
    endDate: body.endDate,
    days,
    reason: body.reason,
    status: "pending",
  });
  res.status(201).json(request);
});

// (Originally wrapped in a MongoDB transaction; the local file DB has no
// transactions, so this now runs as a plain sequence of writes.)
router.put("/requests/:id/approve", authenticate, requireRole("manager"), async (req: AuthRequest, res) => {
  const request = await LeaveRequest.findById(req.params.id);
  if (!request) throw new HttpError(404, "Leave request not found");
  if (request.status !== "pending") throw new HttpError(409, "Only pending requests can be approved");

  request.status = "approved";
  request.approver = req.auth?.employeeId;
  await request.save();

  const year = new Date(request.startDate).getFullYear();
  await LeaveBalance.findOneAndUpdate(
    { employee: request.employee, leaveType: request.leaveType, year },
    { $inc: { used: request.days }, $setOnInsert: { allocated: 0 } },
    { upsert: true }
  );

  // Mark attendance as on_leave for each day in range
  const start = new Date(request.startDate);
  const end = new Date(request.endDate);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().slice(0, 10);
    await Attendance.findOneAndUpdate(
      { employee: request.employee, date: dateStr },
      { $set: { status: "on_leave" } },
      { upsert: true }
    );
  }

  res.json(request);
});

router.put("/requests/:id/reject", authenticate, requireRole("manager"), async (req: AuthRequest, res) => {
  const schema = z.object({ note: z.string().optional() });
  const body = schema.parse(req.body);
  const request = await LeaveRequest.findById(req.params.id);
  if (!request) throw new HttpError(404, "Leave request not found");
  if (request.status !== "pending") throw new HttpError(409, "Only pending requests can be rejected");

  request.status = "rejected";
  request.decisionNote = body.note;
  request.approver = req.auth?.employeeId;
  await request.save();
  res.json(request);
});

export default router;
