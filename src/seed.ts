import dotenv from "dotenv";
dotenv.config();

import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { connectDB } from "./config/db";
import User from "./models/User";
import Employee from "./models/Employee";
import Department from "./models/Department";
import LeaveType from "./models/LeaveType";
import LeaveBalance from "./models/LeaveBalance";
import LeaveRequest from "./models/LeaveRequest";
import Attendance from "./models/Attendance";
import SalaryStructure from "./models/SalaryStructure";
import PayrollRun from "./models/PayrollRun";
import Payslip from "./models/Payslip";
import DailyTask from "./models/DailyTask";

// This script rebuilds a realistic-looking demo dataset every time it runs. It is destructive
// on the collections it owns (Department, Employee, LeaveType, LeaveBalance, LeaveRequest,
// Attendance, SalaryStructure, PayrollRun, Payslip, DailyTask) — that's intentional for a seed script, but
// it means re-running this against a database with real data would wipe it. Login accounts
// (User) are upserted by email, not wiped, so any accounts created via self-registration survive
// a re-seed (they just won't have an Employee link unless they match one of the seeded emails).

// ---------------------------------------------------------------------------
// small deterministic helpers
// ---------------------------------------------------------------------------

function fmt(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function daysInMonth(month: number, year: number): number {
  return new Date(year, month, 0).getDate();
}

// Cheap, deterministic pseudo-randomness so re-running the script produces the same dataset
// (nice for demos/screenshots) instead of a different one every time.
function hash(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h << 5) - h + seed.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function timeOn(dateStr: string, hour: number, minute: number, jitterMinutes: number, seed: string): Date {
  const jitter = hash(seed) % jitterMinutes;
  const d = new Date(`${dateStr}T00:00:00`);
  d.setHours(hour, minute + jitter, 0, 0);
  return d;
}

// ---------------------------------------------------------------------------
// roster
// ---------------------------------------------------------------------------

const DEPARTMENTS = [
  { key: "retail", name: "Retail Operations", description: "Store floor staff and store managers" },
  { key: "warehouse", name: "Warehouse & Inventory", description: "Stock, inventory and warehouse operations" },
  { key: "service", name: "Customer Service", description: "Customer support and service desk" },
  { key: "hr", name: "Human Resources", description: "People operations" },
  { key: "finance", name: "Finance & Accounts", description: "Payroll, accounts and finance" },
];

interface RosterEntry {
  code: string;
  name: string;
  dept: string;
  designation: string;
  role: "manager";
  isManager: boolean;
  basicSalary: number;
  dateOfJoining: string;
}

const ROSTER: RosterEntry[] = [
  { code: "EMP001", name: "Asha Rao", dept: "retail", designation: "Store Manager", role: "manager", isManager: true, basicSalary: 60000, dateOfJoining: "2022-01-10" },
  { code: "EMP002", name: "Ravi Kumar", dept: "retail", designation: "Shop Keeper", role: "manager", isManager: false, basicSalary: 32000, dateOfJoining: "2023-03-01" },
  { code: "EMP003", name: "Priya Nair", dept: "retail", designation: "Shop Keeper", role: "manager", isManager: false, basicSalary: 30000, dateOfJoining: "2023-06-15" },
  { code: "EMP004", name: "Karan Mehta", dept: "retail", designation: "Shop Keeper", role: "manager", isManager: false, basicSalary: 31000, dateOfJoining: "2024-01-20" },
  { code: "EMP005", name: "Sneha Iyer", dept: "retail", designation: "Shop Keeper", role: "manager", isManager: false, basicSalary: 29000, dateOfJoining: "2024-05-10" },
  { code: "EMP006", name: "Vikram Singh", dept: "retail", designation: "Shop Keeper", role: "manager", isManager: false, basicSalary: 30500, dateOfJoining: "2024-08-01" },

  { code: "EMP007", name: "Deepak Sharma", dept: "warehouse", designation: "Warehouse Manager", role: "manager", isManager: true, basicSalary: 55000, dateOfJoining: "2021-11-05" },
  { code: "EMP008", name: "Anjali Gupta", dept: "warehouse", designation: "Inventory Clerk", role: "manager", isManager: false, basicSalary: 28000, dateOfJoining: "2023-02-14" },
  { code: "EMP009", name: "Rohit Verma", dept: "warehouse", designation: "Inventory Clerk", role: "manager", isManager: false, basicSalary: 27500, dateOfJoining: "2023-09-09" },
  { code: "EMP010", name: "Meena Pillai", dept: "warehouse", designation: "Inventory Clerk", role: "manager", isManager: false, basicSalary: 28500, dateOfJoining: "2024-03-18" },

  { code: "EMP011", name: "Kavita Joshi", dept: "service", designation: "Customer Service Manager", role: "manager", isManager: true, basicSalary: 52000, dateOfJoining: "2022-07-01" },
  { code: "EMP012", name: "Arjun Reddy", dept: "service", designation: "Customer Service Associate", role: "manager", isManager: false, basicSalary: 27000, dateOfJoining: "2023-10-11" },
  { code: "EMP013", name: "Neha Kapoor", dept: "service", designation: "Customer Service Associate", role: "manager", isManager: false, basicSalary: 26500, dateOfJoining: "2024-02-25" },
  { code: "EMP014", name: "Suresh Pillai", dept: "service", designation: "Customer Service Associate", role: "manager", isManager: false, basicSalary: 27200, dateOfJoining: "2024-06-30" },

  { code: "EMP015", name: "Divya Menon", dept: "hr", designation: "HR Manager", role: "manager", isManager: true, basicSalary: 58000, dateOfJoining: "2021-05-20" },
  { code: "EMP016", name: "Rahul Chawla", dept: "hr", designation: "HR Executive", role: "manager", isManager: false, basicSalary: 34000, dateOfJoining: "2023-04-12" },

  { code: "EMP017", name: "Pooja Agarwal", dept: "finance", designation: "Finance Manager", role: "manager", isManager: true, basicSalary: 62000, dateOfJoining: "2021-08-15" },
  { code: "EMP018", name: "Manoj Tiwari", dept: "finance", designation: "Accountant", role: "manager", isManager: false, basicSalary: 36000, dateOfJoining: "2022-12-01" },
  { code: "EMP019", name: "Swati Desai", dept: "finance", designation: "Accountant", role: "manager", isManager: false, basicSalary: 35500, dateOfJoining: "2023-11-20" },
  { code: "EMP020", name: "Amitabh Rao", dept: "finance", designation: "Junior Accountant", role: "manager", isManager: false, basicSalary: 29500, dateOfJoining: "2024-09-05" },
];

const LEAVE_TYPES = [
  { name: "Earned Leave", code: "EL", defaultAnnualDays: 18 },
  { name: "Sick Leave", code: "SL", defaultAnnualDays: 10 },
  { name: "Casual Leave", code: "CL", defaultAnnualDays: 8 },
  { name: "Comp Off", code: "CO", defaultAnnualDays: 0 },
];

// Wide enough to fully cover the two previous calendar months (used for the seeded payroll runs
// below), not just a rolling 45-day window.
const ATTENDANCE_DAYS_BACK = 70;
const YEAR = new Date().getFullYear();

async function run() {
  const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/hrms";
  await connectDB(MONGO_URI);

  console.log("Clearing previously seeded HR/attendance/leave/payroll data…");
  await Promise.all([
    Department.deleteMany({}),
    Employee.deleteMany({}),
    LeaveType.deleteMany({}),
    LeaveBalance.deleteMany({}),
    LeaveRequest.deleteMany({}),
    Attendance.deleteMany({}),
    SalaryStructure.deleteMany({}),
    PayrollRun.deleteMany({}),
    Payslip.deleteMany({}),
    DailyTask.deleteMany({}),
  ]);

  // Employee is wiped and rebuilt with brand-new IDs on every run, so any login account left
  // over from an older version of this script (previous email/role naming) would otherwise be
  // pointing at a deleted Employee — you'd see a blank dashboard on that account with no error.
  // These specific emails are seed-script artifacts, not real user data, so it's safe to remove
  // them here. Anything a real person self-registered with a different email is untouched.
  const LEGACY_SEED_EMAILS = ["employee@hrms.local", "manager@hrms.local"];
  const removedLegacy = await User.deleteMany({ email: { $in: LEGACY_SEED_EMAILS } });
  if (removedLegacy.deletedCount > 0) {
    console.log(
      `Removed ${removedLegacy.deletedCount} stale login(s) from an older seed run (${LEGACY_SEED_EMAILS.join(", ")}).`
    );
  }

  // --- departments ---
  const deptDocs = await Department.insertMany(DEPARTMENTS.map((d) => ({ name: d.name, description: d.description })));
  const deptIdByKey = new Map(DEPARTMENTS.map((d, i) => [d.key, deptDocs[i]._id]));

  // --- leave types ---
  const leaveTypeDocs = await LeaveType.insertMany(LEAVE_TYPES);
  const leaveTypeByCode = new Map(leaveTypeDocs.map((lt) => [lt.code, lt]));
  const rotatingLeaveTypes = leaveTypeDocs.filter((lt) => lt.code !== "CO"); // don't hand out comp-off automatically

  // --- employees: managers first, then their reports ---
  const employeeByCode = new Map<string, any>();
  const managerIdByDept = new Map<string, mongoose.Types.ObjectId>();

  for (const entry of ROSTER.filter((r) => r.isManager)) {
    const doc = await Employee.create({
      employeeCode: entry.code,
      name: entry.name,
      email: `${entry.name.toLowerCase().replace(/\s+/g, ".")}@example.com`,
      department: deptIdByKey.get(entry.dept),
      designation: entry.designation,
      dateOfJoining: new Date(entry.dateOfJoining),
      basicSalary: entry.basicSalary,
    });
    employeeByCode.set(entry.code, doc);
    managerIdByDept.set(entry.dept, doc._id);
  }

  for (const entry of ROSTER.filter((r) => !r.isManager)) {
    const doc = await Employee.create({
      employeeCode: entry.code,
      name: entry.name,
      email: `${entry.name.toLowerCase().replace(/\s+/g, ".")}@example.com`,
      department: deptIdByKey.get(entry.dept),
      designation: entry.designation,
      manager: managerIdByDept.get(entry.dept),
      dateOfJoining: new Date(entry.dateOfJoining),
      basicSalary: entry.basicSalary,
    });
    employeeByCode.set(entry.code, doc);
  }

  console.log(`Created ${employeeByCode.size} employees across ${deptDocs.length} departments.`);

  // --- salary structures ---
  for (const entry of ROSTER) {
    const employee = employeeByCode.get(entry.code);
    const hra = Math.round(entry.basicSalary * 0.4);
    const allowances = Math.round(entry.basicSalary * 0.1);
    await SalaryStructure.create({ employee: employee._id, basic: entry.basicSalary, hra, allowances });
  }

  // --- leave balances (allocate now, "used" gets incremented as approved requests are seeded below) ---
  for (const entry of ROSTER) {
    const employee = employeeByCode.get(entry.code);
    for (const lt of leaveTypeDocs) {
      await LeaveBalance.create({ employee: employee._id, leaveType: lt._id, year: YEAR, allocated: lt.defaultAnnualDays, used: 0 });
    }
  }

  // --- attendance for the last ~45 days, skipping weekends ---
  const today = new Date();
  let attendanceCount = 0;
  for (const entry of ROSTER) {
    const employee = employeeByCode.get(entry.code);
    for (let offset = ATTENDANCE_DAYS_BACK; offset >= 1; offset--) {
      const date = addDays(today, -offset);
      if (isWeekend(date)) continue;
      const dateStr = fmt(date);
      const roll = hash(`${entry.code}:${dateStr}`) % 100;

      if (roll < 4) {
        await Attendance.create({ employee: employee._id, date: dateStr, status: "absent" });
      } else if (roll < 9) {
        const checkIn = timeOn(dateStr, 9, 0, 20, `${entry.code}in${dateStr}`);
        const checkOut = timeOn(dateStr, 13, 15, 20, `${entry.code}out${dateStr}`);
        const hoursWorked = Number(((checkOut.getTime() - checkIn.getTime()) / 36e5).toFixed(2));
        await Attendance.create({ employee: employee._id, date: dateStr, checkIn, checkOut, status: "half_day", hoursWorked });
      } else {
        const checkIn = timeOn(dateStr, 9, 0, 30, `${entry.code}in${dateStr}`);
        const checkOut = timeOn(dateStr, 18, 0, 30, `${entry.code}out${dateStr}`);
        const hoursWorked = Number(((checkOut.getTime() - checkIn.getTime()) / 36e5).toFixed(2));
        await Attendance.create({ employee: employee._id, date: dateStr, checkIn, checkOut, status: "present", hoursWorked });
      }
      attendanceCount++;
    }
  }
  console.log(`Created ${attendanceCount} attendance records.`);

  // --- leave requests (approved history + a few pending/rejected) ---
  let leaveRequestCount = 0;
  for (let i = 0; i < ROSTER.length; i++) {
    const entry = ROSTER[i];
    const employee = employeeByCode.get(entry.code);
    const manager = entry.isManager ? undefined : managerIdByDept.get(entry.dept);

    // one approved leave in the past
    const leaveType = rotatingLeaveTypes[i % rotatingLeaveTypes.length];
    const duration = 1 + (i % 3);
    const startOffset = 30 + (i % 15);
    const start = addDays(today, -startOffset);
    const end = addDays(start, duration - 1);
    const startStr = fmt(start);
    const endStr = fmt(end);

    await LeaveRequest.create({
      employee: employee._id,
      leaveType: leaveType._id,
      startDate: startStr,
      endDate: endStr,
      days: duration,
      reason: "Personal",
      status: "approved",
      approver: manager,
    });
    await LeaveBalance.findOneAndUpdate(
      { employee: employee._id, leaveType: leaveType._id, year: YEAR },
      { $inc: { used: duration } }
    );
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      await Attendance.findOneAndUpdate(
        { employee: employee._id, date: fmt(d) },
        { $set: { status: "on_leave" }, $unset: { checkIn: "", checkOut: "", hoursWorked: "" } },
        { upsert: true }
      );
    }
    leaveRequestCount++;

    // roughly a third of employees also have an upcoming pending request
    if (i % 3 === 0) {
      const futureStart = addDays(today, 7 + (i % 7));
      const futureDuration = 1 + (i % 2);
      const futureEnd = addDays(futureStart, futureDuration - 1);
      await LeaveRequest.create({
        employee: employee._id,
        leaveType: rotatingLeaveTypes[(i + 1) % rotatingLeaveTypes.length]._id,
        startDate: fmt(futureStart),
        endDate: fmt(futureEnd),
        days: futureDuration,
        reason: "Planned time off",
        status: "pending",
      });
      leaveRequestCount++;
    }

    // roughly a fifth have a rejected request in their history
    if (i % 5 === 0) {
      const pastStart = addDays(today, -(60 + i));
      await LeaveRequest.create({
        employee: employee._id,
        leaveType: rotatingLeaveTypes[(i + 2) % rotatingLeaveTypes.length]._id,
        startDate: fmt(pastStart),
        endDate: fmt(pastStart),
        days: 1,
        reason: "Personal",
        status: "rejected",
        approver: manager,
        decisionNote: "Insufficient staffing coverage that day",
      });
      leaveRequestCount++;
    }
  }
  console.log(`Created ${leaveRequestCount} leave requests.`);

  // --- daily tasks for today's dashboard ---
  const taskTemplates: Record<string, string[]> = {
    retail: ["Verify opening stock count", "Update shelf display gaps", "Close customer follow-ups"],
    warehouse: ["Reconcile inbound stock", "Check pending dispatches", "Flag low inventory items"],
    service: ["Review open support tickets", "Call back escalated customers", "Update service resolution notes"],
    hr: ["Review attendance exceptions", "Follow up on pending leave approvals", "Update employee documentation"],
    finance: ["Review payment queue", "Reconcile payroll variance notes", "Prepare daily finance summary"],
  };
  const todayStr = fmt(today);
  let taskCount = 0;
  for (const entry of ROSTER) {
    const employee = employeeByCode.get(entry.code);
    const titles = entry.isManager
      ? ["Review team priorities", "Clear approval queue", ...(taskTemplates[entry.dept] || [])]
      : taskTemplates[entry.dept] || ["Review assigned work", "Update daily progress", "Close pending items"];

    for (let i = 0; i < Math.min(titles.length, 4); i++) {
      await DailyTask.create({
        employee: employee._id,
        date: todayStr,
        title: titles[i],
        description: i === 0 ? "Daily priority for the current shift." : undefined,
        status: i === 0 && hash(`${entry.code}:task:${todayStr}`) % 3 === 0 ? "done" : "todo",
      });
      taskCount++;
    }
  }
  console.log(`Created ${taskCount} daily tasks for ${todayStr}.`);

  // --- payroll: finalize the previous two months ---
  const payrollMonths: { month: number; year: number }[] = [];
  for (let back = 2; back >= 1; back--) {
    const d = new Date(today.getFullYear(), today.getMonth() - back, 1);
    payrollMonths.push({ month: d.getMonth() + 1, year: d.getFullYear() });
  }

  let payslipCount = 0;
  for (const { month, year } of payrollMonths) {
    const monthPrefix = `${year}-${String(month).padStart(2, "0")}`;
    const totalDays = daysInMonth(month, year);
    const run = await PayrollRun.create({
      month,
      year,
      status: "finalized",
      finalizedAt: new Date(year, month, 0),
    });

    for (const entry of ROSTER) {
      const employee = employeeByCode.get(entry.code);
      const hra = Math.round(entry.basicSalary * 0.4);
      const allowances = Math.round(entry.basicSalary * 0.1);
      const gross = entry.basicSalary + hra + allowances;

      const lopDays = await Attendance.countDocuments({
        employee: employee._id,
        date: { $regex: `^${monthPrefix}` },
        status: "absent",
      });

      const perDayRate = gross / totalDays;
      const deductions = Math.round(perDayRate * lopDays * 100) / 100;
      const netPay = Math.round((gross - deductions) * 100) / 100;

      await Payslip.create({
        payrollRun: run._id,
        employee: employee._id,
        basicSalary: entry.basicSalary,
        lopDays,
        grossPay: gross,
        deductions,
        netPay,
      });
      payslipCount++;
    }
  }
  console.log(`Finalized payroll for ${payrollMonths.map((m) => `${m.month}/${m.year}`).join(", ")} (${payslipCount} payslips).`);

  // --- login accounts ---
  const passwordHash = await bcrypt.hash("Password123!", 10);
  const storeManager = employeeByCode.get("EMP001"); // Asha Rao, Retail Operations
  const shopKeeper = employeeByCode.get("EMP002"); // Ravi Kumar, Retail Operations

  await User.findOneAndUpdate(
    { email: "admin@hrms.local" },
    { name: "System Admin", email: "admin@hrms.local", passwordHash, role: "admin" },
    { upsert: true }
  );
  await User.findOneAndUpdate(
    { email: "hr@hrms.local" },
    { name: "HR Admin", email: "hr@hrms.local", passwordHash, role: "admin" },
    { upsert: true }
  );
  await User.findOneAndUpdate(
    { email: "payroll@hrms.local" },
    { name: "Payroll Admin", email: "payroll@hrms.local", passwordHash, role: "admin" },
    { upsert: true }
  );
  await User.findOneAndUpdate(
    { email: "storemanager@hrms.local" },
    { name: storeManager.name, email: "storemanager@hrms.local", passwordHash, role: "manager", employee: storeManager._id },
    { upsert: true }
  );
  await User.findOneAndUpdate(
    { email: "shopkeeper@hrms.local" },
    { name: shopKeeper.name, email: "shopkeeper@hrms.local", passwordHash, role: "manager", employee: shopKeeper._id },
    { upsert: true }
  );

  console.log("\nSeed complete. Demo accounts (password: Password123!):");
  console.log(" admin@hrms.local         (admin)");
  console.log(" hr@hrms.local            (admin)");
  console.log(" payroll@hrms.local       (admin)");
  console.log(" storemanager@hrms.local  (manager — Asha Rao, Retail Operations)");
  console.log(" shopkeeper@hrms.local    (manager — Ravi Kumar, Retail Operations)");
  console.log(
    "\nThe other 18 employees have no login of their own yet — link one via the Users screen or"
  );
  console.log("mongosh if you want to log in as them too.");

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
