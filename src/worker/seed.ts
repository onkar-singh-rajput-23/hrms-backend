import bcrypt from "bcryptjs";
import {
  Department,
  Employee,
  User,
  SalaryStructure,
  PayrollRun,
  Payslip,
  Attendance,
  LeaveType,
  LeaveBalance,
  LeaveRequest,
  DailyTask,
} from "./db";

// Port of backend/src/seedClean.ts — wipes every collection and rebuilds the
// Hurry's Food & Beverages dataset (9 employees, June 2026 payroll, 12 logins).

const MONTH = 6;
const YEAR = 2026;

interface Row {
  code: string;
  originalId: string;
  name: string;
  designation: string;
  gross: number;
  advance: number;
  penalty: number;
  inHand: number;
  present: number;
  absent: number;
  off: number;
  pattern: string;
}

const ROWS: Row[] = [
  { code: "HP006", originalId: "HP006", name: "Monu", designation: "F&B Assistant", gross: 11000, advance: 0, penalty: 0, inHand: 11000, present: 28, absent: 0, off: 0, pattern: "PPPPPPPPPPPPPPPPPPPPPPPPPPPP" },
  { code: "HP007", originalId: "HP007", name: "Gulab Sen", designation: "Head Cook", gross: 22000, advance: 4500, penalty: 0, inHand: 17500, present: 28, absent: 0, off: 0, pattern: "PPPPPPPPPPPPPPPPPPPPPPPPPPPP" },
  { code: "HP010", originalId: "HP010", name: "Shibam", designation: "Kitchen Helper", gross: 9000, advance: 0, penalty: 0, inHand: 9000, present: 26, absent: 0, off: 2, pattern: "PPPPPPPPPPPPPPPPPPPPPPPPOOPP" },
  { code: "HP016", originalId: "HP016", name: "Dinesh", designation: "Cook", gross: 16000, advance: 0, penalty: 0, inHand: 16000, present: 26, absent: 0, off: 2, pattern: "PPPPPPPPPPPPPPPPPPPPPPPOOPPP" },
  { code: "HP019", originalId: "HP019", name: "Pankaj Singh", designation: "Kitchen Helper", gross: 13000, advance: 0, penalty: 0, inHand: 13000, present: 26, absent: 0, off: 2, pattern: "PPPPPPPPPPPPPPPPPPOPPPPPOPPP" },
  { code: "HP020", originalId: "HP020", name: "Shubham", designation: "Kitchen Helper", gross: 12000, advance: 1000, penalty: 0, inHand: 8000, present: 21, absent: 7, off: 0, pattern: "AAAAAAAPPPPPPPPPPPPPPPPPPPPP" },
  { code: "HP021", originalId: "HP021", name: "Sonu", designation: "Kitchen Helper", gross: 10000, advance: 0, penalty: 0, inHand: 5357, present: 14, absent: 13, off: 1, pattern: "PPPPPPPPPPPPPPOAAAAAAAAAAAAA" },
  { code: "HP021-2", originalId: "HP021", name: "Lalit", designation: "Kitchen Helper", gross: 9000, advance: 0, penalty: 0, inHand: 9000, present: 28, absent: 0, off: 0, pattern: "PPPPPPPPPPPPPPPPPPPPPPPPPPPP" },
  { code: "HP022", originalId: "HP022", name: "Roshan", designation: "Kitchen Helper", gross: 22000, advance: 0, penalty: 0, inHand: 22000, present: 3, absent: 0, off: 25, pattern: "PPPOOOOOOOOOOOOOOOOOOOOOOOOO" },
];

const LEAVE_TYPES = [
  { name: "Earned Leave", code: "EL", defaultAnnualDays: 18 },
  { name: "Sick Leave", code: "SL", defaultAnnualDays: 10 },
  { name: "Casual Leave", code: "CL", defaultAnnualDays: 8 },
  { name: "Comp Off", code: "CO", defaultAnnualDays: 0 },
];

const emailFor = (name: string) => `${name.toLowerCase().replace(/\s+/g, ".")}@hurrys.local`;

export async function runSeed() {
  // 1. wipe
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

  // 2. department
  const dept = await Department.create({
    name: "Kitchen & F&B",
    description: "Hurry's Food & Beverages — kitchen and F&B staff",
  });

  // 3. employees + 4. salary structures
  const employeeByCode = new Map<string, string>();
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

  // 5. payroll run + 6. payslips
  const payrollRun = await PayrollRun.create({
    month: MONTH,
    year: YEAR,
    status: "finalized",
    finalizedAt: new Date("2026-06-30"),
  });
  for (const r of ROWS) {
    await Payslip.create({
      payrollRun: payrollRun._id,
      employee: employeeByCode.get(r.code)!,
      basicSalary: r.gross,
      lopDays: r.absent,
      grossPay: r.gross,
      deductions: r.gross - r.inHand,
      netPay: r.inHand,
    });
  }

  // 7. attendance from patterns
  let attendanceCount = 0;
  for (const r of ROWS) {
    const employeeId = employeeByCode.get(r.code)!;
    for (let i = 0; i < r.pattern.length; i++) {
      const date = `2026-06-${String(i + 1).padStart(2, "0")}`;
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
    }
  }

  // 8. leave types + balances
  const leaveTypeDocs = await LeaveType.insertMany(LEAVE_TYPES);
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
    }
  }

  // 9. login accounts (shared password Password123!)
  const passwordHash = await bcrypt.hash("Password123!", 10);
  const created: { email: string; role: string }[] = [];
  const staffLogins = [
    { email: "admin@hurrys.local", name: "System Admin", role: "admin" },
    { email: "hr@hurrys.local", name: "HR Manager", role: "admin" },
    { email: "manager@hurrys.local", name: "Floor Manager", role: "manager" },
  ];
  for (const s of staffLogins) {
    await User.create({ name: s.name, email: s.email, passwordHash, role: s.role, isActive: true });
    created.push({ email: s.email, role: s.role });
  }
  for (const r of ROWS) {
    const email = emailFor(r.name);
    await User.create({
      name: r.name,
      email,
      passwordHash,
      role: "manager",
      employee: employeeByCode.get(r.code)!,
      isActive: true,
    });
    created.push({ email, role: "manager" });
  }

  const netTotal = ROWS.reduce((s, r) => s + r.inHand, 0);
  const grossTotal = ROWS.reduce((s, r) => s + r.gross, 0);
  return {
    ok: true,
    employees: ROWS.length,
    users: created.length,
    attendanceRecords: attendanceCount,
    leaveTypes: leaveTypeDocs.length,
    payrollRun: `${MONTH}/${YEAR}`,
    grossTotal,
    netTotal,
    logins: created,
  };
}
