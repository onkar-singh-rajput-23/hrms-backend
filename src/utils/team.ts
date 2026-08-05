import Employee from "../models/Employee";
import { TokenPayload } from "./jwt";
import { HttpError } from "../middleware/errorHandler";

/**
 * "Team" means a manager's direct reports — the employees whose `Employee.manager`
 * points at the manager's own Employee record.
 *
 *  - admin    → every employee (unrestricted)
 *  - manager  → their direct reports
 *  - employee → nobody but themselves
 *
 * Returned ids are strings so callers can compare them without ObjectId casting.
 */
export async function teamEmployeeIds(auth: TokenPayload | undefined): Promise<string[]> {
  if (!auth) return [];

  if (auth.role === "admin") {
    const all = await Employee.find().select("_id");
    return all.map((e) => String(e._id));
  }

  if (auth.role === "manager" && auth.employeeId) {
    const reports = await Employee.find({ manager: auth.employeeId }).select("_id");
    return reports.map((e) => String(e._id));
  }

  return [];
}

/** Admins are unscoped; everyone else is limited to the ids in `teamEmployeeIds`. */
export function isUnscoped(auth: TokenPayload | undefined): boolean {
  return auth?.role === "admin";
}

/**
 * Throws unless `auth` may act on `employeeId` — either it is their own record, or
 * they supervise it. Use before returning or mutating another person's data.
 */
export async function assertCanActOnEmployee(
  auth: TokenPayload | undefined,
  employeeId: string
): Promise<void> {
  if (!auth) throw new HttpError(401, "Not authenticated");
  if (auth.role === "admin") return;
  if (auth.employeeId && String(auth.employeeId) === String(employeeId)) return;

  if (auth.role === "manager" && auth.employeeId) {
    const report = await Employee.findOne({ _id: employeeId, manager: auth.employeeId }).select("_id");
    if (report) return;
  }

  throw new HttpError(403, "You do not have permission to view or change this employee's records");
}

/** Throws unless the caller supervises the employee. Self-access is intentionally excluded. */
export async function assertCanManageEmployee(
  auth: TokenPayload | undefined,
  employeeId: string
): Promise<void> {
  if (!auth) throw new HttpError(401, "Not authenticated");
  if (auth.role === "admin") return;

  if (auth.role === "manager" && auth.employeeId) {
    const report = await Employee.findOne({ _id: employeeId, manager: auth.employeeId }).select("_id");
    if (report) return;
  }

  throw new HttpError(403, "You can only manage employees who report directly to you");
}

/**
 * Mongo filter restricting an `employee` field to what `auth` may see.
 * Returns `null` when the caller may see everything.
 */
export async function employeeScopeFilter(
  auth: TokenPayload | undefined,
  options: { includeSelf?: boolean } = {}
): Promise<{ employee: { $in: string[] } } | null> {
  if (isUnscoped(auth)) return null;

  const ids = await teamEmployeeIds(auth);
  if (options.includeSelf && auth?.employeeId) ids.push(String(auth.employeeId));

  return { employee: { $in: ids } };
}
