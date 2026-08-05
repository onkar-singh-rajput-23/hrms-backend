import { Request, Response, NextFunction } from "express";
import { verifyToken, TokenPayload } from "../utils/jwt";
import { normalizeRole, Role } from "../types/roles";

export interface AuthRequest extends Request {
  auth?: TokenPayload;
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ message: "Missing or invalid Authorization header" });
    return;
  }
  const token = header.slice("Bearer ".length);
  try {
    req.auth = verifyToken(token);
    req.auth.role = normalizeRole(req.auth.role);
    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired token" });
  }
}

export function requireRole(...roles: Role[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({ message: "Not authenticated" });
      return;
    }
    if (req.auth.role === "admin" || roles.includes(req.auth.role)) {
      next();
      return;
    }
    res.status(403).json({ message: "You do not have permission to perform this action" });
  };
}
