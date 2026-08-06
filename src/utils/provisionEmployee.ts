import Employee, { IEmployee } from "../models/Employee";
import { isDuplicateKeyError, nextEmployeeCode } from "./employeeCode";

const MAX_CODE_ATTEMPTS = 5;

export interface ProvisionEmployeeInput {
  name: string;
  email: string;
  /** Employee id of the reporting manager, when one was chosen. */
  managerId?: string;
  designation?: string;
  dateOfJoining?: Date;
  basicSalary?: number;
}

/**
 * Creates the Employee record that every staff member needs in order to appear on the Employees
 * screen and to own attendance, leave, tasks and payslips. The code is generated here so nobody
 * has to invent one by hand.
 *
 * If an Employee already exists for the email (HR added them before they signed up) it is reused
 * and back-filled with the manager rather than duplicated.
 */
export async function provisionEmployeeForUser(input: ProvisionEmployeeInput): Promise<IEmployee> {
  const email = input.email.trim().toLowerCase();

  const existing = await Employee.findOne({ email });
  if (existing) {
    if (input.managerId && !existing.manager) {
      existing.manager = input.managerId as unknown as IEmployee["manager"];
      await existing.save();
    }
    return existing;
  }

  // employeeCode is uniquely indexed; a concurrent signup can take the code we just picked.
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    try {
      return await Employee.create({
        employeeCode: await nextEmployeeCode(),
        name: input.name.trim(),
        email,
        manager: input.managerId,
        designation: input.designation,
        dateOfJoining: input.dateOfJoining ?? new Date(),
        status: "active",
        basicSalary: input.basicSalary ?? 0,
      });
    } catch (error) {
      lastError = error;
      if (!isDuplicateKeyError(error)) throw error;
    }
  }

  throw lastError;
}
