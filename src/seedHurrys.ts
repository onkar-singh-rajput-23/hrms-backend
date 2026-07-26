import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import { connectDB } from "./config/db";
import Department from "./models/Department";
import Employee from "./models/Employee";
import SalaryStructure from "./models/SalaryStructure";
import PayrollRun from "./models/PayrollRun";
import Payslip from "./models/Payslip";

// ---------------------------------------------------------------------------
// Hurry's Food & Beverages Pvt. Ltd. — attendance & salary sheet.
// The source sheet is for February 2026; per request it is stored here as the
// JUNE 2026 payroll run. This script is idempotent and NON-destructive: it
// upserts by employeeCode / (payrollRun, employee) so re-running just refreshes
// values, and it does not touch the demo data created by src/seed.ts.
// ---------------------------------------------------------------------------

const MONTH = 6; // June
const YEAR = 2026;
const DAYS_IN_MONTH = 28; // the source sheet covers a 28-day cycle

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
}

// NOTE: the sheet prints ID HP021 twice (Sonu & Lalit). employeeCode is unique
// in the DB, so Lalit is stored as HP021-2 while originalId keeps the sheet value.
const ROWS: Row[] = [
  { code: "HP006", originalId: "HP006", name: "Monu",         designation: "F&B Assistant",  gross: 11000, advance: 0,    penalty: 0, inHand: 11000, present: 28, absent: 0,  off: 0 },
  { code: "HP007", originalId: "HP007", name: "Gulab Sen",    designation: "Head Cook",      gross: 22000, advance: 4500, penalty: 0, inHand: 17500, present: 28, absent: 0,  off: 0 },
  { code: "HP010", originalId: "HP010", name: "Shibam",       designation: "Kitchen Helper", gross: 9000,  advance: 0,    penalty: 0, inHand: 9000,  present: 26, absent: 0,  off: 2 },
  { code: "HP016", originalId: "HP016", name: "Dinesh",       designation: "Cook",           gross: 16000, advance: 0,    penalty: 0, inHand: 16000, present: 26, absent: 0,  off: 2 },
  { code: "HP019", originalId: "HP019", name: "Pankaj Singh", designation: "Kitchen Helper", gross: 13000, advance: 0,    penalty: 0, inHand: 13000, present: 26, absent: 0,  off: 2 },
  { code: "HP020", originalId: "HP020", name: "Shubham",      designation: "Kitchen Helper", gross: 12000, advance: 1000, penalty: 0, inHand: 8000,  present: 21, absent: 7,  off: 0 },
  { code: "HP021", originalId: "HP021", name: "Sonu",         designation: "Kitchen Helper", gross: 10000, advance: 0,    penalty: 0, inHand: 5357,  present: 14, absent: 13, off: 1 },
  { code: "HP021-2", originalId: "HP021", name: "Lalit",      designation: "Kitchen Helper", gross: 9000,  advance: 0,    penalty: 0, inHand: 9000,  present: 28, absent: 0,  off: 0 },
  { code: "HP022", originalId: "HP022", name: "Roshan",       designation: "Kitchen Helper", gross: 22000, advance: 0,    penalty: 0, inHand: 22000, present: 3,  absent: 0,  off: 25 },
];

function emailFor(name: string): string {
  return `${name.toLowerCase().replace(/\s+/g, ".")}@hurrys.local`;
}

async function run() {
  const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/hrms";
  await connectDB(MONGO_URI);

  // --- department ---
  const dept = await Department.findOneAndUpdate(
    { name: "Kitchen & F&B" },
    { name: "Kitchen & F&B", description: "Hurry's Food & Beverages — kitchen and F&B staff" },
    { upsert: true, new: true }
  );

  // --- employees (upsert by employeeCode) ---
  const employeeByCode = new Map<string, mongoose.Types.ObjectId>();
  for (const r of ROWS) {
    const doc = await Employee.findOneAndUpdate(
      { employeeCode: r.code },
      {
        employeeCode: r.code,
        name: r.name,
        email: emailFor(r.name),
        department: dept._id,
        designation: r.designation,
        dateOfJoining: new Date("2025-06-01"),
        status: "active",
        basicSalary: r.gross,
      },
      { upsert: true, new: true }
    );
    employeeByCode.set(r.code, doc._id as mongoose.Types.ObjectId);

    // salary structure (whole gross treated as basic; this sheet doesn't split components)
    await SalaryStructure.findOneAndUpdate(
      { employee: doc._id },
      { employee: doc._id, basic: r.gross, hra: 0, allowances: 0, effectiveFrom: new Date(`${YEAR}-06-01`) },
      { upsert: true }
    );
  }
  console.log(`Upserted ${ROWS.length} Hurry's employees into "${dept.name}".`);

  // --- payroll run for June 2026 (reuse the existing one if the demo seed made it) ---
  const run = await PayrollRun.findOneAndUpdate(
    { month: MONTH, year: YEAR },
    { month: MONTH, year: YEAR, status: "finalized", finalizedAt: new Date(`${YEAR}-06-30`) },
    { upsert: true, new: true }
  );
  console.log(`Payroll run ready: ${MONTH}/${YEAR} (status: ${run.status}).`);

  // --- payslips (upsert by payrollRun + employee) ---
  // Mapping to the Payslip model, consistent with the sheet's business rules:
  //   grossPay      = monthly gross
  //   lopDays       = absent days (unpaid)
  //   deductions    = grossPay - inHand  (LOP for absences + salary advance + penalty)
  //   netPay        = inHand  (net salary in hand)
  for (const r of ROWS) {
    const employeeId = employeeByCode.get(r.code)!;
    const deductions = r.gross - r.inHand;
    await Payslip.findOneAndUpdate(
      { payrollRun: run._id, employee: employeeId },
      {
        payrollRun: run._id,
        employee: employeeId,
        basicSalary: r.gross,
        lopDays: r.absent,
        grossPay: r.gross,
        deductions,
        netPay: r.inHand,
      },
      { upsert: true }
    );
  }
  console.log(`Upserted ${ROWS.length} payslips for ${MONTH}/${YEAR}.`);

  // --- verification ---
  const total = await Payslip.countDocuments({ payrollRun: run._id });
  console.log(`\nJune ${YEAR} run now holds ${total} payslip(s) in total (Hurry's + any demo staff).`);
  console.log("Hurry's net pay by employee:");
  for (const r of ROWS) {
    console.log(`  ${r.originalId.padEnd(6)} ${r.name.padEnd(13)} net ₹${r.inHand.toLocaleString("en-IN")}`);
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
