import type { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { notify, NotifyCategory } from '@diamond/shared';

// Deduplicate 5xx Slack notifications: at most one per unique error message per minute
const errorNotifyLastSent = new Map<string, number>();
const ERROR_NOTIFY_COOLDOWN_MS = 60_000;

function shouldNotify5xx(message: string): boolean {
  const now = Date.now();
  const last = errorNotifyLastSent.get(message) ?? 0;
  if (now - last >= ERROR_NOTIFY_COOLDOWN_MS) {
    errorNotifyLastSent.set(message, now);
    // Prune stale entries occasionally to prevent unbounded growth
    if (errorNotifyLastSent.size > 200) {
      const cutoff = now - 5 * 60_000;
      for (const [k, v] of errorNotifyLastSent) {
        if (v < cutoff) errorNotifyLastSent.delete(k);
      }
    }
    return true;
  }
  return false;
}

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

  // Notify Slack on 5xx errors (deduplicated to prevent flooding)
  if (statusCode >= 500 && shouldNotify5xx(err.message)) {
    notify({
      category: NotifyCategory.API_ERROR,
      title: 'API Server Error',
      message: err.message,
      context: { method: req.method, path: req.path, statusCode: String(statusCode) },
      error: err,
    }).catch(() => {});
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

export function fatalError(message: string): AppError {
  return createError(message, 500, 'FATAL_ERROR');
}