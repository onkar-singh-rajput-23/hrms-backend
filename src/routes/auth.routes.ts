import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import User from "../models/User";
import { signToken } from "../utils/jwt";
import { authenticate, requireRole, AuthRequest } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { normalizeRole, ROLES, PUBLIC_ROLES } from "../types/roles";
import { provisionEmployeeForUser } from "../utils/provisionEmployee";

const router = Router();

const registerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(ROLES).default("employee"),
  employeeId: z.string().optional(),
});

// Only an existing admin can create new login accounts.
router.post("/register", authenticate, requireRole("admin"), async (req, res) => {
  const body = registerSchema.parse(req.body);
  const existing = await User.findOne({ email: body.email });
  if (existing) throw new HttpError(409, "A user with this email already exists");

  const passwordHash = await bcrypt.hash(body.password, 10);
  const user = await User.create({
    name: body.name,
    email: body.email,
    passwordHash,
    role: body.role,
    employee: body.employeeId,
  });

  res.status(201).json({
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
  });
});

const signupSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name"),
  fathersName: z.string().trim().min(2, "Enter your father's name"),
  temporaryAddress: z.string().trim().min(5, "Enter your temporary address"),
  permanentAddress: z.string().trim().min(5, "Enter your permanent address"),
  aadhaarLinkedMobileNumber: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Aadhaar-linked mobile number"),
  aadhaarNumber: z.string().regex(/^\d{12}$/, "Enter a valid 12-digit Aadhaar number"),
  aadhaarDocument: z
    .object({
      fileName: z.string().min(1),
      mimeType: z.enum(["application/pdf", "image/jpeg", "image/png"]),
      data: z.string().max(7_000_000, "Aadhaar document must be 5 MB or smaller"),
    })
    .optional(),
  panNumber: z.string().regex(/^[A-Z]{5}\d{4}[A-Z]$/, "Enter a valid PAN number, for example ABCDE1234F"),
  panDocument: z
    .object({
      fileName: z.string().min(1),
      mimeType: z.enum(["application/pdf", "image/jpeg", "image/png"]),
      data: z.string().max(7_000_000, "PAN document must be 5 MB or smaller"),
    })
    .optional(),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(PUBLIC_ROLES).default("employee"),
  /** Employee id of the chosen reporting manager, from GET /auth/managers. */
  reportingManagerId: z.string().optional(),
});

/**
 * Employee ids of accounts that can be picked as a reporting manager: role `manager` (or `admin`)
 * with a linked Employee record, since `Employee.manager` points at an Employee.
 */
async function selectableManagers(): Promise<{ id: string; name: string }[]> {
  const managers = await User.find({ role: { $in: ["manager", "admin"] }, employee: { $ne: null } })
    .select("name employee")
    .populate<{ employee: { _id: unknown; name: string } }>("employee", "name")
    .sort({ name: 1 });

  return managers
    .filter((m) => m.employee)
    .map((m) => ({ id: String(m.employee._id), name: m.employee.name || m.name }));
}

/**
 * Public: the sign-up form needs this before the user has a token. Deliberately exposes only
 * the employee id and display name — no emails or other contact details.
 */
router.get("/managers", async (_req, res) => {
  res.json(await selectableManagers());
});

// Public self-service sign-up creates employee or manager accounts. Admin access is
// only granted by an existing admin through the protected role-management flow.
// New accounts have no linked Employee record yet — HR links the account to an Employee profile
// afterwards from the Employees screen, at which point `reportingManager` becomes Employee.manager.
router.post("/signup", async (req, res) => {
  const body = signupSchema.parse(req.body);
  const existing = await User.findOne({ email: body.email });
  if (existing) throw new HttpError(409, "A user with this email already exists");

  // Validate the chosen manager, and require one for employees whenever any manager exists.
  const managers = await selectableManagers();
  if (body.reportingManagerId) {
    if (!managers.some((m) => m.id === body.reportingManagerId)) {
      throw new HttpError(400, "Select a valid reporting manager");
    }
  } else if (body.role === "employee" && managers.length > 0) {
    throw new HttpError(400, "Select your reporting manager");
  }

  const passwordHash = await bcrypt.hash(body.password, 10);
  const user = await User.create({
    name: body.name,
    fathersName: body.fathersName,
    temporaryAddress: body.temporaryAddress,
    permanentAddress: body.permanentAddress,
    aadhaarLinkedMobileNumber: body.aadhaarLinkedMobileNumber,
    aadhaarNumber: body.aadhaarNumber,
    aadhaarDocumentName: body.aadhaarDocument?.fileName,
    aadhaarDocumentMimeType: body.aadhaarDocument?.mimeType,
    aadhaarDocumentData: body.aadhaarDocument?.data,
    panNumber: body.panNumber,
    panDocumentName: body.panDocument?.fileName,
    panDocumentMimeType: body.panDocument?.mimeType,
    panDocumentData: body.panDocument?.data,
    email: body.email,
    passwordHash,
    role: body.role,
    reportingManager: body.reportingManagerId,
  });

  // Every staff member needs an Employee record: it is what the Employees screen lists and what
  // attendance, leave, tasks and payslips hang off. Created here so registering is enough.
  const employee = await provisionEmployeeForUser({
    name: body.name,
    email: body.email,
    managerId: body.reportingManagerId,
  });
  user.employee = employee._id as typeof user.employee;
  await user.save();

  // employeeId must be in the token, otherwise the new account's own records 404 until re-login.
  const token = signToken({
    userId: String(user._id),
    role: user.role,
    employeeId: String(employee._id),
  });

  res.status(201).json({
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      employeeId: user.employee,
      employeeCode: employee.employeeCode,
    },
  });
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post("/login", async (req, res) => {
  const body = loginSchema.parse(req.body);
  const user = await User.findOne({ email: body.email });
  if (!user || !user.isActive) throw new HttpError(401, "Invalid email or password");

  const match = await bcrypt.compare(body.password, user.passwordHash);
  if (!match) throw new HttpError(401, "Invalid email or password");

  const normalizedRole = normalizeRole(user.role);
  if (normalizedRole !== user.role) {
    user.role = normalizedRole;
    await user.save();
  }

  const token = signToken({
    userId: String(user._id),
    role: normalizedRole,
    employeeId: user.employee ? String(user.employee) : undefined,
  });

  res.json({
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: normalizedRole,
      employeeId: user.employee,
    },
  });
});

router.get("/me", authenticate, async (req: AuthRequest, res) => {
  const user = await User.findById(req.auth!.userId).populate("employee");
  if (!user) throw new HttpError(404, "User not found");
  res.json({
    id: user._id,
    name: user.name,
    email: user.email,
    role: normalizeRole(user.role),
    employee: user.employee,
  });
});

export default router;
