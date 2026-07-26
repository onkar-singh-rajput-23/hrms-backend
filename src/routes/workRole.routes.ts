import { Router } from "express";
import { z } from "zod";
import WorkRole from "../models/WorkRole";
import { DEFAULT_WORK_ROLES } from "../data/defaultWorkRoles";
import { authenticate, requireRole, type AuthRequest } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";

const router = Router();

async function ensureDefaultRoles(): Promise<void> {
  if ((await WorkRole.countDocuments()) === 0) {
    await WorkRole.insertMany(DEFAULT_WORK_ROLES);
  }
}

router.get("/", authenticate, async (_req, res) => {
  await ensureDefaultRoles();
  const roles = await WorkRole.find().sort({ sortOrder: 1 });
  res.json(roles);
});

const updateSchema = z.object({
  area: z.string().trim().min(2),
  areaHindi: z.string().trim().min(1),
  responsibilities: z.array(z.string().trim().min(2)).min(1),
});

router.put("/:id", authenticate, requireRole("admin"), async (req: AuthRequest, res) => {
  const body = updateSchema.parse(req.body);
  const role = await WorkRole.findByIdAndUpdate(
    req.params.id,
    { ...body, updatedBy: req.auth?.userId },
    { new: true }
  );
  if (!role) throw new HttpError(404, "Work role not found");
  res.json(role);
});

export default router;
