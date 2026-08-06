import Employee from "../models/Employee";

/** Codes look like HP006. The seeded sheet also contains a suffixed duplicate (HP021-2). */
const CODE_PREFIX = "HP";
const CODE_PATTERN = /^HP(\d+)/i;

/**
 * Next free employee code, e.g. HP023. Derived from the highest existing number rather than a
 * count, so deleting a record never causes a collision.
 *
 * `employeeCode` is uniquely indexed, so a concurrent signup can still lose the race; callers
 * should retry on a duplicate-key error.
 */
export async function nextEmployeeCode(): Promise<string> {
  const employees = await Employee.find().select("employeeCode");

  let highest = 0;
  for (const employee of employees) {
    const match = CODE_PATTERN.exec(employee.employeeCode || "");
    if (!match) continue;
    const value = Number(match[1]);
    if (Number.isFinite(value) && value > highest) highest = value;
  }

  return `${CODE_PREFIX}${String(highest + 1).padStart(3, "0")}`;
}

/** True for a MongoDB duplicate-key error, which is how a lost code race surfaces. */
export function isDuplicateKeyError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as { code?: number }).code === 11000);
}
