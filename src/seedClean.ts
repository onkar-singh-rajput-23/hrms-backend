import dotenv from "dotenv";
dotenv.config();

import bcrypt from "bcryptjs";
import { connectDB } from "./config/db";
import Department from "./models/Department";
import Employee from "./models/Employee";
import User from "./models/User";
import SalaryStructure from "./models/SalaryStructure";
import PayrollRun from "./models/PayrollRun";
import Payslip from "./models/Payslip";
import Attendance from "./models/Attendance";
import LeaveType from "./models/LeaveType";
import LeaveBalance from "./models/LeaveBalance";
import LeaveRequest from "./models/LeaveRequest";
import DailyTask from "./models/DailyTask";

// ---------------------------------------------------------------------------
// Clean rebuild for Hurry's Food & Beverages.
//
// DESTRUCTIVE: wipes every collection and recreates a clean dataset containing
// ONLY the 9-person kitchen/F&B roster, plus admin/hr/manager logins and one
// login per employee. June 2026 payroll is preserved to match the existing
// structure. Run with: npx ts-node src/seedClean.ts
// ---------------------------------------------------------------------------

const MONTH = 6; // June
const YEAR = 2026;

interface Row {
  code: string;        // stored employeeCode (must be unique)
  originalId: string;  // the ID exactly as printed on the sheet
  name: string;
  designation: string;
  gross: number;
  advance: number;
  penalty: number;
  inHand: number;
  present: number;
  absent: number;
  off: number;
  pattern: string;     // 28-char day pattern: P = present, A = absent, O = week-off
}

// NOTE: the sheet prints ID HP021 twice (Sonu & Lalit). employeeCode is unique
// in the DB, so Lalit is stored as HP021-2 while originalId keeps the sheet value.
const ROWS: Row[] = [
  { code: "HP006",   originalId: "HP006", name: "Monu",         designation: "F&B Assistant",  gross: 11000, advance: 0,    penalty: 0, inHand: 11000, present: 28, absent: 0,  off: 0,  pattern: "PPPPPPPPPPPPPPPPPPPPPPPPPPPP" },
  { code: "HP007",   originalId: "HP007", name: "Gulab Sen",    designation: "Head Cook",      gross: 22000, advance: 4500, penalty: 0, inHand: 17500, present: 28, absent: 0,  off: 0,  pattern: "PPPPPPPPPPPPPPPPPPPPPPPPPPPP" },
  { code: "HP010",   originalId: "HP010", name: "Shibam",       designation: "Kitchen Helper", gross: 9000,  advance: 0,    penalty: 0, inHand: 9000,  present: 26, absent: 0,  off: 2,  pattern: "PPPPPPPPPPPPPPPPPPPPPPPPOOPP" },
  { code: "HP016",   originalId: "HP016", name: "Dinesh",       designation: "Cook",           gross: 16000, advance: 0,    penalty: 0, inHand: 16000, present: 26, absent: 0,  off: 2,  pattern: "PPPPPPPPPPPPPPPPPPPPPPPOOPPP" },
  { code: "HP019",   originalId: "HP019", name: "Pankaj Singh", designation: "Kitchen Helper", gross: 13000, advance: 0,    penalty: 0, inHand: 13000, present: 26, absent: 0,  off: 2,  pattern: "PPPPPPPPPPPPPPPPPPOPPPPPOPPP" },
  { code: "HP020",   originalId: "HP020", name: "Shubham",      designation: "Kitchen Helper", gross: 12000, advance: 1000, penalty: 0, inHand: 8000,  present: 21, absent: 7,  off: 0,  pattern: "AAAAAAAPPPPPPPPPPPPPPPPPPPPP" },
  { code: "HP021",   originalId: "HP021", name: "Sonu",         designation: "Kitchen Helper", gross: 10000, advance: 0,    penalty: 0, inHand: 5357,  present: 14, absent: 13, off: 1,  pattern: "PPPPPPPPPPPPPPOAAAAAAAAAAAAA" },
  { code: "HP021-2", originalId: "HP021", name: "Lalit",        designation: "Kitchen Helper", gross: 9000,  advance: 0,    penalty: 0, inHand: 9000,  present: 28, absent: 0,  off: 0,  pattern: "PPPPPPPPPPPPPPPPPPPPPPPPPPPP" },
  { code: "HP022",   originalId: "HP022", name: "Roshan",       designation: "Kitchen Helper", gross: 22000, advance: 0,    penalty: 0, inHand: 22000, present: 3,  absent: 0,  off: 25, pattern: "PPPOOOOOOOOOOOOOOOOOOOOOOOOO" },
];

const LEAVE_TYPES = [
  { name: "Earned Leave", code: "EL", defaultAnnualDays: 18 },
  { name: "Sick Leave", code: "SL", defaultAnnualDays: 10 },
  { name: "Casual Leave", code: "CL", defaultAnnualDays: 8 },
  { name: "Comp Off", code: "CO", defaultAnnualDays: 0 },
];

function emailFor(name: string): string {
  return `${name.toLowerCase().replace(/\s+/g, ".")}@hurrys.local`;
}

async function run() {
  await connectDB();

  // --- 1. wipe every collection ---
  console.log("Clearing ALL collections…");
  await Department.deleteMany({});
  await Employee.deleteMany({});
  await User.deleteMany({});
  await SalaryStructure.deleteMany({});
  await PayrollRun.deleteMany({});
  await Payslip.deleteMany({});
  await Attendance.deleteMany({});
  await LeaveType.deleteMany({});
  await LeaveBalance.deleteMany({});
  await LeaveRequest.deleteMany({});
  await DailyTask.deleteMany({});

  // --- 2. department ---
  const dept = await Department.create({
    name: "Kitchen & F&B",
    description: "Hurry's Food & Beverages — kitchen and F&B staff",
  });

  // --- 3. employees + 4. salary structures ---
  const employeeByCode = new Map<string, any>();
  for (const r of ROWS) {
    const emp = await Employee.create({
      employeeCode: r.code,
      name: r.name,
      email: emailFor(r.name),
      department: dept._id,
      designation: r.designation,
      dateOfJoining: new Date("2025-06-01"),
      status: "active",
      basicSalary: r.gross,
    });
    employeeByCode.set(r.code, emp._id);

    await SalaryStructure.create({
      employee: emp._id,
      basic: r.gross,
      hra: 0,
      allowances: 0,
      effectiveFrom: new Date("2026-06-01"),
    });
  }
  console.log(`Created ${ROWS.length} employees and salary structures in "${dept.name}".`);

  // --- 5. payroll run (June 2026) ---
  const payrollRun = await PayrollRun.create({
    month: MONTH,
    year: YEAR,
    status: "finalized",
    finalizedAt: new Date("2026-06-30"),
  });

  // --- 6. payslips ---
  for (const r of ROWS) {
    const employeeId = employeeByCode.get(r.code)!;
    await Payslip.create({
      payrollRun: payrollRun._id,
      employee: employeeId,
      basicSalary: r.gross,
      lopDays: r.absent,
      grossPay: r.gross,
      deductions: r.gross - r.inHand,
      netPay: r.inHand,
    });
  }
  console.log(`Created ${ROWS.length} payslips for ${MONTH}/${YEAR}.`);

  // --- 7. attendance from the 28-day patterns ---
  let attendanceCount = 0;
  for (const r of ROWS) {
    const employeeId = employeeByCode.get(r.code)!;
    for (let i = 0; i < r.pattern.length; i++) {
      const day = String(i + 1).padStart(2, "0");
      const date = `2026-06-${day}`;
      const mark = r.pattern[i];
      if (mark === "P") {
        await Attendance.create({
          employee: employeeId,
          date,
          status: "present",
          checkIn: new Date(`${date}T09:00:00`),
          checkOut: new Date(`${date}T18:00:00`),
          hoursWorked: 9,
        });
        attendanceCount++;
      } else if (mark === "A") {
        await Attendance.create({ employee: employeeId, date, status: "absent" });
        attendanceCount++;
      }
      // "O" (week-off) => no record
    }
  }
  console.log(`Created ${attendanceCount} attendance records.`);

  // --- 8. leave types + balances ---
  const leaveTypeDocs = await LeaveType.insertMany(LEAVE_TYPES);
  let leaveBalanceCount = 0;
  for (const r of ROWS) {
    const employeeId = employeeByCode.get(r.code)!;
    for (const lt of leaveTypeDocs) {
      await LeaveBalance.create({
        employee: employeeId,
        leaveType: lt._id,
        year: YEAR,
        allocated: lt.defaultAnnualDays,
        used: 0,
      });
      leaveBalanceCount++;
    }
  }
  console.log(`Created ${leaveTypeDocs.length} leave types and ${leaveBalanceCount} leave balances.`);

  // --- 9. login accounts ---
  const passwordHash = await bcrypt.hash("Password123!", 10);

  interface Cred { email: string; role: string; name: string; employeeCode?: string }
  const created: Cred[] = [];

  const staffLogins = [
    { email: "admin@hurrys.local",   name: "System Admin",   role: "admin" as const },
    { email: "hr@hurrys.local",      name: "HR Manager",     role: "admin" as const },
    { email: "manager@hurrys.local", name: "Floor Manager",  role: "manager" as const },
  ];
  for (const s of staffLogins) {
    await User.create({ name: s.name, email: s.email, passwordHash, role: s.role, isActive: true });
    created.push({ email: s.email, role: s.role, name: s.name });
  }

  for (const r of ROWS) {
    const employeeId = employeeByCode.get(r.code)!;
    const email = emailFor(r.name);
    await User.create({
      name: r.name,
      email,
      passwordHash,
      role: "manager",
      employee: employeeId,
      isActive: true,
    });
    created.push({ email, role: "manager", name: r.name, employeeCode: r.code });
  }

  // --- 10. summary ---
  const netTotal = ROWS.reduce((s, r) => s + r.inHand, 0);
  const grossTotal = ROWS.reduce((s, r) => s + r.gross, 0);

  console.log("\n=== Login accounts (shared password: Password123!) ===");
  for (const c of created) {
    const link = c.employeeCode ? ` -> employee ${c.employeeCode} (${c.name})` : "";
    console.log(`  ${c.email.padEnd(24)} ${c.role.padEnd(14)}${link}`);
  }
  console.log(`\nTotal users: ${created.length}`);

  console.log("\n=== Per-employee net pay ===");
  for (const r of ROWS) {
    console.log(`  ${r.originalId.padEnd(6)} ${r.name.padEnd(13)} net ₹${r.inHand.toLocaleString("en-IN")}`);
  }
  console.log(`\nGross total: ₹${grossTotal.toLocaleString("en-IN")}  |  Net total: ₹${netTotal.toLocaleString("en-IN")}`);

  console.log("\nAll old/demo data removed. leaveRequests and dailyTasks are empty.");

  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
