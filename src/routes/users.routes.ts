import { Router } from "express";
import { z } from "zod";
import User from "../models/User";
import { authenticate, requireRole } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { ROLES } from "../types/roles";

const router = Router();

// HR admins and admins can see every login account (to link employees and manage roles).
router.get("/", authenticate, requireRole("admin"), async (_req, res) => {
  const users = await User.find()
    .select("-passwordHash -aadhaarDocumentData -panDocumentData")
    .populate("employee", "name employeeCode")
    .sort({ name: 1 });
  res.json(users);
});

const roleSchema = z.object({ role: z.enum(ROLES) });

// An admin can switch another account between manager and admin.
router.put("/:id/role", authenticate, requireRole("admin"), async (req, res) => {
  const body = roleSchema.parse(req.body);
  const user = await User.findByIdAndUpdate(req.params.id, { role: body.role }, { new: true }).select("-passwordHash");
  if (!user) throw new HttpError(404, "User not found");
  res.json(user);
});

export default router;
