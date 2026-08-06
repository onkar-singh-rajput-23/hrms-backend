import { Router } from "express";
import { z } from "zod";
import Employee from "../models/Employee";
import { authenticate, requireRole, AuthRequest } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { assertCanActOnEmployee, teamEmployeeIds } from "../utils/team";
import { provisionEmployeeForUser } from "../utils/provisionEmployee";

const router = Router();

router.get("/", authenticate, requireRole("manager"), async (req: AuthRequest, res) => {
  const filter = req.auth?.role === "admin" ? {} : { _id: { $in: await teamEmployeeIds(req.auth) } };
  const employees = await Employee.find(filter).populate("department").populate("manager", "name employeeCode").sort({ name: 1 });
  res.json(employees);
});

router.get("/me", authenticate, async (req: AuthRequest, res) => {
  if (!req.auth?.employeeId) throw new HttpError(404, "No employee record linked to this account");
  const employee = await Employee.findById(req.auth.employeeId).populate("department").populate("manager", "name employeeCode");
  if (!employee) throw new HttpError(404, "Employee not found");
  res.json(employee);
});

router.get("/:id", authenticate, async (req: AuthRequest, res) => {
  await assertCanActOnEmployee(req.auth, req.params.id);
  const employee = await Employee.findById(req.params.id).populate("department").populate("manager", "name employeeCode");
  if (!employee) throw new HttpError(404, "Employee not found");
  res.json(employee);
});

const createSchema = z.object({
  /** Optional — generated as the next free HPnnn when the admin leaves it blank. */
  employeeCode: z.string().min(1).optional(),
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

  // No code supplied: reuse the same provisioning path as sign-up so numbering stays consistent.
  if (!body.employeeCode) {
    const employee = await provisionEmployeeForUser({
      name: body.name,
      email: body.email,
      managerId: body.manager,
      designation: body.designation,
      dateOfJoining: body.dateOfJoining ? new Date(body.dateOfJoining) : undefined,
      basicSalary: body.basicSalary,
    });
    // provisionEmployeeForUser only sets the fields it knows about; apply the rest.
    if (body.phone || body.department) {
      employee.phone = body.phone ?? employee.phone;
      employee.department = (body.department ?? employee.department) as typeof employee.department;
      await employee.save();
    }
    res.status(201).json(employee);
    return;
  }

  const employee = await Employee.create({
    ...body,
    dateOfJoining: body.dateOfJoining ? new Date(body.dateOfJoining) : new Date(),
  });
  res.status(201).json(employee);
});

const updateSchema = createSchema.partial().extend({
  manager: z.string().nullable().optional(),
  status: z.enum(["active", "exited"]).optional(),
});

router.put("/:id", authenticate, requireRole("admin"), async (req, res) => {
  const body = updateSchema.parse(req.body);
  const update: Record<string, unknown> = {
    ...body,
    dateOfJoining: body.dateOfJoining ? new Date(body.dateOfJoining) : undefined,
  };
  if (body.manager === null) {
    delete update.manager;
    update.$unset = { manager: 1 };
  }
  const employee = await Employee.findByIdAndUpdate(
    req.params.id,
    update,
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
