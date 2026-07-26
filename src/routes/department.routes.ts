import { Router } from "express";
import { z } from "zod";
import Department from "../models/Department";
import { authenticate, requireRole } from "../middleware/auth";

const router = Router();

router.get("/", authenticate, async (_req, res) => {
  const departments = await Department.find().sort({ name: 1 });
  res.json(departments);
});

const upsertSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

router.post("/", authenticate, requireRole("admin"), async (req, res) => {
  const body = upsertSchema.parse(req.body);
  const dept = await Department.create(body);
  res.status(201).json(dept);
});

router.put("/:id", authenticate, requireRole("admin"), async (req, res) => {
  const body = upsertSchema.partial().parse(req.body);
  const dept = await Department.findByIdAndUpdate(req.params.id, body, { new: true });
  res.json(dept);
});

router.delete("/:id", authenticate, requireRole("admin"), async (req, res) => {
  await Department.findByIdAndDelete(req.params.id);
  res.status(204).send();
});

export default router;
