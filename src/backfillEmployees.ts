/**
 * One-off, idempotent repair for accounts created before sign-up provisioned an Employee record.
 * Such users never appeared on the Employees screen and had no attendance/leave/payslip identity.
 *
 * Run with:  npm run backfill:employees
 * Safe to run repeatedly — accounts that already have an Employee are skipped.
 */
import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import { connectDB } from "./config/db";
import User from "./models/User";
import { provisionEmployeeForUser } from "./utils/provisionEmployee";

async function main(): Promise<void> {
  await connectDB();

  // Admin-only logins (no employee identity) are intentionally left alone.
  const users = await User.find({
    employee: { $in: [null, undefined] },
    role: { $in: ["employee", "manager"] },
  });

  if (users.length === 0) {
    console.log("Nothing to backfill — every employee/manager account already has an Employee record.");
    await mongoose.disconnect();
    return;
  }

  console.log(`Found ${users.length} account(s) without an Employee record:`);
  for (const user of users) {
    const employee = await provisionEmployeeForUser({
      name: user.name,
      email: user.email,
      managerId: user.reportingManager ? String(user.reportingManager) : undefined,
    });
    user.employee = employee._id as typeof user.employee;
    await user.save();
    console.log(`  ${user.email.padEnd(34)} -> ${employee.employeeCode} (${employee.name})`);
  }

  console.log("Done.");
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error("[backfill] failed", error);
  process.exit(1);
});
