import { Router } from "express";
import { z } from "zod";
import Employee from "../models/Employee";
import Attendance from "../models/Attendance";
import SalaryStructure from "../models/SalaryStructure";
import PayrollRun from "../models/PayrollRun";
import Payslip from "../models/Payslip";
import { authenticate, requireRole, AuthRequest } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { assertCanManageEmployee, employeeScopeFilter } from "../utils/team";

const router = Router();

function daysInMonth(month: number, year: number): number {
  return new Date(year, month, 0).getDate();
}

const runSchema = z.object({
  month: z.number().min(1).max(12),
  year: z.number().min(2000),
});

// Stage-1..6 simplified: pull attendance -> compute LOP -> compute pay -> finalize.
// (Ran inside a MongoDB transaction originally; the local file DB has no
// transactions, so this now runs as a plain sequence of writes.)
router.post("/run", authenticate, requireRole("admin"), async (req: AuthRequest, res) => {
  const body = runSchema.parse(req.body);

  const existing = await PayrollRun.findOne({ month: body.month, year: body.year });
  if (existing) throw new HttpError(409, "A payroll run already exists for this month");

  const payrollRun = await PayrollRun.create({
    month: body.month,
    year: body.year,
    status: "draft",
    runBy: req.auth?.userId,
  });

  const employees = await Employee.find({ status: "active" });
  const totalDays = daysInMonth(body.month, body.year);
  const monthPrefix = `${body.year}-${String(body.month).padStart(2, "0")}`;

  for (const employee of employees) {
    const structure = await SalaryStructure.findOne({ employee: employee._id }).sort({ effectiveFrom: -1 });

    const basic = structure?.basic ?? employee.basicSalary ?? 0;
    const hra = structure?.hra ?? 0;
    const allowances = structure?.allowances ?? 0;
    const gross = basic + hra + allowances;

    const absentCount = await Attendance.countDocuments({
      employee: employee._id,
      date: { $regex: `^${monthPrefix}` },
      status: "absent",
    });

    const perDayRate = gross / totalDays;
    const deductions = Math.round(perDayRate * absentCount * 100) / 100;
    const netPay = Math.round((gross - deductions) * 100) / 100;

    await Payslip.create({
      payrollRun: payrollRun._id,
      employee: employee._id,
      basicSalary: basic,
      lopDays: absentCount,
      grossPay: gross,
      deductions,
      netPay,
    });
  }

  payrollRun.status = "finalized";
  payrollRun.finalizedAt = new Date();
  await payrollRun.save();

  res.status(201).json(payrollRun);
});

router.get("/runs", authenticate, requireRole("admin"), async (_req, res) => {
  const runs = await PayrollRun.find().sort({ year: -1, month: -1 });
  res.json(runs);
});

router.get("/runs/:id/payslips", authenticate, requireRole("admin"), async (req, res) => {
  const payslips = await Payslip.find({ payrollRun: req.params.id }).populate("employee", "name employeeCode");
  res.json(payslips);
});

router.get("/payslips/me", authenticate, async (req: AuthRequest, res) => {
  const employeeId = req.auth?.employeeId;
  if (!employeeId) throw new HttpError(400, "No employee record linked to this account");
  const payslips = await Payslip.find({ employee: employeeId }).populate("payrollRun").sort({ createdAt: -1 });
  res.json(payslips);
});

router.get("/payslips/team", authenticate, requireRole("manager"), async (req: AuthRequest, res) => {
  const scope = await employeeScopeFilter(req.auth);
  const filter = scope ? { ...scope } : {};
  const payslips = await Payslip.find(filter)
    .populate("employee", "name employeeCode designation")
    .populate("payrollRun")
    .sort({ createdAt: -1 });
  res.json(payslips);
});

router.get("/payslips/employee/:employeeId", authenticate, requireRole("manager"), async (req: AuthRequest, res) => {
  await assertCanManageEmployee(req.auth, req.params.employeeId);
  const payslips = await Payslip.find({ employee: req.params.employeeId }).populate("payrollRun").sort({ createdAt: -1 });
  res.json(payslips);
});

export default router;
