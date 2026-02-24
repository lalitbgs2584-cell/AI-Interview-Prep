import { Request } from "express";

export interface AuthenticatedRequest extends Request {
  session?: {
    user?: {
      id: string;
    };
  };
}