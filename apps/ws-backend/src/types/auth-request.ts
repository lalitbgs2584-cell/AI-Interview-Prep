import { Request } from "express";

export interface AuthenticatedRequest extends Request {
  session?: {
    user?: {
      id: string;
      role?: string;
    };
  };
  adminUser?: {
    id: string;
    name: string;
    email: string;
    role: string;
    isBlocked: boolean;
    isDeleted: boolean;
  };
}
