import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: any, req: Request, res: Response, next: NextFunction): void {
  if (err instanceof ZodError) {
    const firstIssue = err.issues[0];
    const field = firstIssue?.path.join(" ");
    res.status(400).json({ message: field ? `${field}: ${firstIssue.message}` : "Invalid registration details" });
    return;
  }
  const status = err instanceof HttpError ? err.status : err.status || 500;
  const message = err.message || "Internal server error";
  if (status >= 500) {
    console.error(err);
  }
  res.status(status).json({ message });
}
