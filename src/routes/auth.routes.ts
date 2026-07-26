import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import User from "../models/User";
import { signToken } from "../utils/jwt";
import { authenticate, requireRole, AuthRequest } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { ROLES, PUBLIC_ROLES } from "../types/roles";

const router = Router();

const registerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(ROLES).default("manager"),
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
  role: z.enum(PUBLIC_ROLES).default("manager"),
});

// Public self-service sign-up creates manager accounts. Admin access is only
// granted by an existing admin through the protected role-management flow.
// New accounts have no linked Employee record yet — HR links the account to an Employee profile
// afterwards from the Employees screen.
router.post("/signup", async (req, res) => {
  const body = signupSchema.parse(req.body);
  const existing = await User.findOne({ email: body.email });
  if (existing) throw new HttpError(409, "A user with this email already exists");

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
  });

  const token = signToken({ userId: String(user._id), role: user.role });

  res.status(201).json({
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      employeeId: user.employee,
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

  const token = signToken({
    userId: String(user._id),
    role: user.role,
    employeeId: user.employee ? String(user.employee) : undefined,
  });

  res.json({
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
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
    role: user.role,
    employee: user.employee,
  });
});

export default router;
