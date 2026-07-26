import { Router } from "express";
import Attendance from "../models/Attendance";
import Employee from "../models/Employee";
import { authenticate, requireRole, AuthRequest } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";

const router = Router();

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

router.post("/punch-in", authenticate, async (req: AuthRequest, res) => {
  const employeeId = req.auth?.employeeId;
  if (!employeeId) throw new HttpError(400, "No employee record linked to this account");

  const date = todayStr();
  const existing = await Attendance.findOne({ employee: employeeId, date });
  if (existing?.checkIn) throw new HttpError(409, "Already punched in today");

  const record = existing
    ? await Attendance.findOneAndUpdate({ employee: employeeId, date }, { checkIn: new Date() }, { new: true })
    : await Attendance.create({ employee: employeeId, date, checkIn: new Date(), status: "present" });

  res.status(201).json(record);
});

router.post("/punch-out", authenticate, async (req: AuthRequest, res) => {
  const employeeId = req.auth?.employeeId;
  if (!employeeId) throw new HttpError(400, "No employee record linked to this account");

  const date = todayStr();
  const record = await Attendance.findOne({ employee: employeeId, date });
  if (!record || !record.checkIn) throw new HttpError(400, "You must punch in before punching out");
  if (record.checkOut) throw new HttpError(409, "Already punched out today");

  record.checkOut = new Date();
  record.hoursWorked = Number(((record.checkOut.getTime() - record.checkIn.getTime()) / 36e5).toFixed(2));
  await record.save();

  res.json(record);
});

router.get("/me", authenticate, async (req: AuthRequest, res) => {
  const employeeId = req.auth?.employeeId;
  if (!employeeId) throw new HttpError(400, "No employee record linked to this account");
  const records = await Attendance.find({ employee: employeeId }).sort({ date: -1 }).limit(60);
  res.json(records);
});

router.get("/team", authenticate, requireRole("manager"), async (req, res) => {
  const { date } = req.query;
  const filter: Record<string, unknown> = {};
  if (date) filter.date = String(date);
  const records = await Attendance.find(filter).populate("employee", "name employeeCode department").sort({ date: -1 }).limit(200);
  res.json(records);
});

router.get("/employee/:employeeId", authenticate, requireRole("manager"), async (req, res) => {
  const employee = await Employee.findById(req.params.employeeId);
  if (!employee) throw new HttpError(404, "Employee not found");
  const records = await Attendance.find({ employee: req.params.employeeId }).sort({ date: -1 }).limit(90);
  res.json(records);
});

export default router;
