import jwt from "jsonwebtoken";
import { Role } from "../types/roles";

export interface TokenPayload {
  userId: string;
  role: Role;
  employeeId?: string;
}

export function signToken(payload: TokenPayload): string {
  const secret = process.env.JWT_SECRET || "dev_secret";
  const expiresIn = process.env.JWT_EXPIRES_IN || "7d";
  return jwt.sign(payload, secret, { expiresIn } as jwt.SignOptions);
}

export function verifyToken(token: string): TokenPayload {
  const secret = process.env.JWT_SECRET || "dev_secret";
  return jwt.verify(token, secret) as TokenPayload;
}
