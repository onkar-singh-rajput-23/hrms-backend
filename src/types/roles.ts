export const ROLES = ["employee", "manager", "admin"] as const;
export type Role = (typeof ROLES)[number];

// Public registration lets a person sign up as an employee or a manager. Admin access is
// only granted by an existing admin through the Users screen or protected registration API.
export const PUBLIC_ROLES = ["employee", "manager"] as const;
export type PublicRole = (typeof PUBLIC_ROLES)[number];

/** True for roles that supervise a team: they may act on their direct reports. */
export function isSupervisor(role: Role | undefined): boolean {
  return role === "manager" || role === "admin";
}

/** Maps roles from the previous five-role model into the supported three-role model. */
export function normalizeRole(role: unknown): Role {
  if (role === "admin" || role === "hr_admin" || role === "payroll_admin") return "admin";
  if (role === "manager" || role === "store_manager") return "manager";
  return "employee";
}
