import { Router } from "express";
import { z } from "zod";
import Employee from "../models/Employee";
import { authenticate, requireRole, AuthRequest } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";

const router = Router();

router.get("/", authenticate, requireRole("manager"), async (_req, res) => {
  const employees = await Employee.find().populate("department").populate("manager", "name employeeCode").sort({ name: 1 });
  res.json(employees);
});

router.get("/me", authenticate, async (req: AuthRequest, res) => {
  if (!req.auth?.employeeId) throw new HttpError(404, "No employee record linked to this account");
  const employee = await Employee.findById(req.auth.employeeId).populate("department").populate("manager", "name employeeCode");
  if (!employee) throw new HttpError(404, "Employee not found");
  res.json(employee);
});

router.get("/:id", authenticate, async (req, res) => {
  const employee = await Employee.findById(req.params.id).populate("department").populate("manager", "name employeeCode");
  if (!employee) throw new HttpError(404, "Employee not found");
  res.json(employee);
});

const createSchema = z.object({
  employeeCode: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  department: z.string().optional(),
  designation: z.string().optional(),
  manager: z.string().optional(),
  dateOfJoining: z.string().optional(),
  basicSalary: z.number().nonnegative().default(0),
});

router.post("/", authenticate, requireRole("admin"), async (req, res) => {
  const body = createSchema.parse(req.body);
  const employee = await Employee.create({
    ...body,
    dateOfJoining: body.dateOfJoining ? new Date(body.dateOfJoining) : new Date(),
  });
  res.status(201).json(employee);
});

const updateSchema = createSchema.partial().extend({
  status: z.enum(["active", "exited"]).optional(),
});

router.put("/:id", authenticate, requireRole("admin"), async (req, res) => {
  const body = updateSchema.parse(req.body);
  const employee = await Employee.findByIdAndUpdate(
    req.params.id,
    { ...body, dateOfJoining: body.dateOfJoining ? new Date(body.dateOfJoining) : undefined },
    { new: true }
  );
  if (!employee) throw new HttpError(404, "Employee not found");
  res.json(employee);
});

router.delete("/:id", authenticate, requireRole("admin"), async (req, res) => {
  await Employee.findByIdAndUpdate(req.params.id, { status: "exited" });
  res.status(204).send();
});

export default router;
