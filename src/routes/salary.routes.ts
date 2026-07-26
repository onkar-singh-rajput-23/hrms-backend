import { Router } from "express";
import { z } from "zod";
import SalaryStructure from "../models/SalaryStructure";
import { authenticate, requireRole } from "../middleware/auth";

const router = Router();

router.get("/:employeeId", authenticate, requireRole("admin"), async (req, res) => {
  const structure = await SalaryStructure.findOne({ employee: req.params.employeeId }).sort({ effectiveFrom: -1 });
  res.json(structure);
});

const upsertSchema = z.object({
  employeeId: z.string(),
  basic: z.number().nonnegative(),
  hra: z.number().nonnegative().default(0),
  allowances: z.number().nonnegative().default(0),
  effectiveFrom: z.string().optional(),
});

router.post("/", authenticate, requireRole("admin"), async (req, res) => {
  const body = upsertSchema.parse(req.body);
  const structure = await SalaryStructure.create({
    employee: body.employeeId,
    basic: body.basic,
    hra: body.hra,
    allowances: body.allowances,
    effectiveFrom: body.effectiveFrom ? new Date(body.effectiveFrom) : new Date(),
  });
  res.status(201).json(structure);
});

export default router;
