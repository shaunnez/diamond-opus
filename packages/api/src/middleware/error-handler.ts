import type { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
}

export const errorHandler: ErrorRequestHandler = (
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const statusCode = err.statusCode ?? 500;

  // Use request logger if available, otherwise log to console
  if (req.log) {
    if (statusCode >= 500) {
      req.log.error('Request error', err, { statusCode });
    } else {
      req.log.warn('Request error', { statusCode, message: err.message });
    }
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: err.errors,
      },
    });
    return;
  }

  const code = err.code ?? 'INTERNAL_ERROR';
  const message = statusCode === 500 ? 'Internal server error' : err.message;

  res.status(statusCode).json({
    error: {
      code,
      message,
    },
  });
};

export function createError(
  message: string,
  statusCode: number,
  code: string
): AppError {
  const error = new Error(message) as AppError;
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

export function notFound(message: string = 'Resource not found'): AppError {
  return createError(message, 404, 'NOT_FOUND');
}

export function badRequest(message: string): AppError {
  return createError(message, 400, 'BAD_REQUEST');
}

export function conflict(message: string): AppError {
  return createError(message, 409, 'CONFLICT');
}
