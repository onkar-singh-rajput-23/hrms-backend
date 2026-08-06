import { Router } from "express";
import { z } from "zod";
import User from "../models/User";
import { authenticate, requireRole, AuthRequest } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { normalizeRole, ROLES } from "../types/roles";
import { provisionEmployeeForUser } from "../utils/provisionEmployee";

const router = Router();

// HR admins and admins can see every login account (to link employees and manage roles).
router.get("/", authenticate, requireRole("admin"), async (_req, res) => {
  const users = await User.find()
    .select("-passwordHash -aadhaarDocumentData -panDocumentData")
    .populate("employee", "name employeeCode")
    .sort({ name: 1 });
  for (const user of users) user.role = normalizeRole(user.role);
  res.json(users);
});

/**
 * Repair for accounts created before sign-up provisioned an Employee record: without one they
 * are invisible on the Employees screen and cannot own attendance, leave, tasks or payslips.
 *
 * Idempotent, and admin-only. Admin logins carry no employee identity, so they are skipped.
 * Same logic as the `npm run backfill:employees` CLI, reachable when only the API is available.
 */
router.post("/backfill-employees", authenticate, requireRole("admin"), async (_req, res) => {
  const users = await User.find({
    employee: { $in: [null, undefined] },
    role: { $in: ["employee", "manager"] },
  });

  const linked: { email: string; employeeCode: string }[] = [];
  for (const user of users) {
    const employee = await provisionEmployeeForUser({
      name: user.name,
      email: user.email,
      managerId: user.reportingManager ? String(user.reportingManager) : undefined,
    });
    user.employee = employee._id as typeof user.employee;
    await user.save();
    linked.push({ email: user.email, employeeCode: employee.employeeCode });
  }

  res.json({ scanned: users.length, linked });
});

const roleSchema = z.object({ role: z.enum(ROLES) });

// An admin can assign any of the three supported roles.
router.put("/:id/role", authenticate, requireRole("admin"), async (req, res) => {
  const body = roleSchema.parse(req.body);
  const user = await User.findByIdAndUpdate(req.params.id, { role: body.role }, { new: true }).select("-passwordHash");
  if (!user) throw new HttpError(404, "User not found");
  res.json(user);
});

router.delete("/:id", authenticate, requireRole("admin"), async (req: AuthRequest, res) => {
  if (req.auth?.userId === req.params.id) throw new HttpError(400, "You cannot delete your own account");
  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) throw new HttpError(404, "User not found");
  res.status(204).send();
});

export default router;
