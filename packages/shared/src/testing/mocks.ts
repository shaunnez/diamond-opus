/**
 * Mock implementations for external services and dependencies.
 * These mocks can be used in integration tests to avoid hitting real services.
 */

import { type Logger, type LogContext } from '../utils/logger.js';

/**
 * Create a mock logger that captures log calls for assertions.
 * Useful for testing that components log the expected messages.
 */
export interface CapturedLog {
  level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  message: string;
  data?: Record<string, unknown>;
  error?: Error | unknown;
}

export interface MockLogger extends Logger {
  logs: CapturedLog[];
  clear(): void;
  getLogsByLevel(level: CapturedLog['level']): CapturedLog[];
  hasLog(level: CapturedLog['level'], messagePattern: string | RegExp): boolean;
}

export function createMockLogger(): MockLogger {
  const logs: CapturedLog[] = [];
  const context: LogContext = {};

  const mockLogger: MockLogger = {
    logs,

    debug(msg: string, data?: Record<string, unknown>): void {
      logs.push({ level: 'debug', message: msg, data: { ...context, ...data } });
    },

    info(msg: string, data?: Record<string, unknown>): void {
      logs.push({ level: 'info', message: msg, data: { ...context, ...data } });
    },

    warn(msg: string, data?: Record<string, unknown>): void {
      logs.push({ level: 'warn', message: msg, data: { ...context, ...data } });
    },

    error(msg: string, error?: Error | unknown, data?: Record<string, unknown>): void {
      logs.push({ level: 'error', message: msg, error, data: { ...context, ...data } });
    },

    fatal(msg: string, error?: Error | unknown, data?: Record<string, unknown>): void {
      logs.push({ level: 'fatal', message: msg, error, data: { ...context, ...data } });
    },

    child(childContext: LogContext): MockLogger {
      const childLogger = createMockLogger();
      // Share the same logs array
      childLogger.logs.length = 0;
      Object.assign(childLogger, { logs });
      // Merge context
      Object.assign(context, childContext);
      return childLogger;
    },

    getContext(): LogContext {
      return { ...context };
    },

    clear(): void {
      logs.length = 0;
    },

    getLogsByLevel(level: CapturedLog['level']): CapturedLog[] {
      return logs.filter(log => log.level === level);
    },

    hasLog(level: CapturedLog['level'], messagePattern: string | RegExp): boolean {
      return logs.some(log => {
        if (log.level !== level) return false;
        if (typeof messagePattern === 'string') {
          return log.message.includes(messagePattern);
        }
        return messagePattern.test(log.message);
      });
    },
  };

  return mockLogger;
}

/**
 * Mock database client for testing database queries without a real connection.
 */
export interface MockQueryResult<T = unknown> {
  rows: T[];
  rowCount: number;
}

export interface MockDatabaseClient {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<MockQueryResult<T>>;
  setQueryResult<T>(pattern: string | RegExp, result: MockQueryResult<T>): void;
  setQueryError(pattern: string | RegExp, error: Error): void;
  getExecutedQueries(): Array<{ sql: string; params?: unknown[] }>;
  reset(): void;
}

export function createMockDatabaseClient(): MockDatabaseClient {
  const queryResults = new Map<string | RegExp, MockQueryResult | Error>();
  const executedQueries: Array<{ sql: string; params?: unknown[] }> = [];

  return {
    async query<T = unknown>(sql: string, params?: unknown[]): Promise<MockQueryResult<T>> {
      executedQueries.push({ sql, params });

      for (const [pattern, result] of queryResults) {
        const matches = typeof pattern === 'string'
          ? sql.includes(pattern)
          : pattern.test(sql);

        if (matches) {
          if (result instanceof Error) {
            throw result;
          }
          return result as MockQueryResult<T>;
        }
      }

      // Default: return empty result
      return { rows: [] as T[], rowCount: 0 };
    },

    setQueryResult<T>(pattern: string | RegExp, result: MockQueryResult<T>): void {
      queryResults.set(pattern, result);
    },

    setQueryError(pattern: string | RegExp, error: Error): void {
      queryResults.set(pattern, error);
    },

    getExecutedQueries() {
      return [...executedQueries];
    },

    reset(): void {
      queryResults.clear();
      executedQueries.length = 0;
    },
  };
}

/**
 * Mock Service Bus for testing message sending/receiving without Azure.
 */
export interface MockServiceBusMessage<T = unknown> {
  body: T;
  contentType: string;
  sentAt: Date;
}

export interface MockServiceBus {
  workItems: MockServiceBusMessage[];
  workDone: MockServiceBusMessage[];
  consolidate: MockServiceBusMessage[];

  sendWorkItem<T>(message: T): Promise<void>;
  sendWorkDone<T>(message: T): Promise<void>;
  sendConsolidate<T>(message: T): Promise<void>;

  receiveWorkItem<T>(): Promise<T | null>;
  receiveWorkDone<T>(): Promise<T | null>;
  receiveConsolidate<T>(): Promise<T | null>;

  reset(): void;
}

export function createMockServiceBus(): MockServiceBus {
  const workItems: MockServiceBusMessage[] = [];
  const workDone: MockServiceBusMessage[] = [];
  const consolidate: MockServiceBusMessage[] = [];

  return {
    workItems,
    workDone,
    consolidate,

    async sendWorkItem<T>(message: T): Promise<void> {
      workItems.push({
        body: message,
        contentType: 'application/json',
        sentAt: new Date(),
      });
    },

    async sendWorkDone<T>(message: T): Promise<void> {
      workDone.push({
        body: message,
        contentType: 'application/json',
        sentAt: new Date(),
      });
    },

    async sendConsolidate<T>(message: T): Promise<void> {
      consolidate.push({
        body: message,
        contentType: 'application/json',
        sentAt: new Date(),
      });
    },

    async receiveWorkItem<T>(): Promise<T | null> {
      const msg = workItems.shift();
      return msg ? (msg.body as T) : null;
    },

    async receiveWorkDone<T>(): Promise<T | null> {
      const msg = workDone.shift();
      return msg ? (msg.body as T) : null;
    },

    async receiveConsolidate<T>(): Promise<T | null> {
      const msg = consolidate.shift();
      return msg ? (msg.body as T) : null;
    },

    reset(): void {
      workItems.length = 0;
      workDone.length = 0;
      consolidate.length = 0;
    },
  };
}

/**
 * Mock HTTP client for testing API calls without network requests.
 */
export interface MockHttpResponse {
  status: number;
  data: unknown;
  headers?: Record<string, string>;
}

export interface MockHttpClient {
  setResponse(method: string, urlPattern: string | RegExp, response: MockHttpResponse): void;
  setError(method: string, urlPattern: string | RegExp, error: Error): void;
  request(method: string, url: string, options?: { body?: unknown; headers?: Record<string, string> }): Promise<MockHttpResponse>;
  getRequests(): Array<{ method: string; url: string; body?: unknown; headers?: Record<string, string> }>;
  reset(): void;
}

export function createMockHttpClient(): MockHttpClient {
  const responses = new Map<string, MockHttpResponse | Error>();
  const requests: Array<{ method: string; url: string; body?: unknown; headers?: Record<string, string> }> = [];

  const makeKey = (method: string, pattern: string | RegExp) => `${method}:${pattern.toString()}`;

  return {
    setResponse(method: string, urlPattern: string | RegExp, response: MockHttpResponse): void {
      responses.set(makeKey(method, urlPattern), response);
    },

    setError(method: string, urlPattern: string | RegExp, error: Error): void {
      responses.set(makeKey(method, urlPattern), error);
    },

    async request(method: string, url: string, options?: { body?: unknown; headers?: Record<string, string> }): Promise<MockHttpResponse> {
      requests.push({ method, url, body: options?.body, headers: options?.headers });

      for (const [key, result] of responses) {
        const [keyMethod, pattern] = key.split(':');
        if (keyMethod !== method) continue;

        const matches = pattern.startsWith('/')
          ? new RegExp(pattern.slice(1, -1)).test(url)
          : url.includes(pattern);

        if (matches) {
          if (result instanceof Error) {
            throw result;
          }
          return result;
        }
      }

      // Default: 404
      return { status: 404, data: { error: 'Not found' } };
    },

    getRequests() {
      return [...requests];
    },

    reset(): void {
      responses.clear();
      requests.length = 0;
    },
  };
}

/**
 * Mock Slack notification client for testing notify() calls without hitting real webhooks.
 * Mirrors the notify(options) interface used across all services.
 */
import type { NotifyOptions } from '../utils/slack.js';

export interface MockSentNotification {
  category: string;
  title: string;
  message: string;
  context?: Record<string, string>;
  sentAt: Date;
}

export interface MockNotifyClient {
  sent: MockSentNotification[];
  notify(options: NotifyOptions): Promise<void>;
  getByCategory(category: string): MockSentNotification[];
  getByTitle(pattern: string | RegExp): MockSentNotification[];
  hasNotification(titlePattern: string | RegExp): boolean;
  reset(): void;
}

export function createMockNotifyClient(): MockNotifyClient {
  const sent: MockSentNotification[] = [];

  return {
    sent,

    async notify(options: NotifyOptions): Promise<void> {
      sent.push({
        category: options.category,
        title: options.title,
        message: options.message,
        context: options.context,
        sentAt: new Date(),
      });
    },

    getByCategory(category: string): MockSentNotification[] {
      return sent.filter(n => n.category === category);
    },

    getByTitle(pattern: string | RegExp): MockSentNotification[] {
      return sent.filter(n => {
        if (typeof pattern === 'string') return n.title.includes(pattern);
        return pattern.test(n.title);
      });
    },

    hasNotification(titlePattern: string | RegExp): boolean {
      return sent.some(n => {
        if (typeof titlePattern === 'string') return n.title.includes(titlePattern);
        return titlePattern.test(n.title);
      });
    },

    reset(): void {
      sent.length = 0;
    },
  };
}

/** @deprecated Use createMockNotifyClient instead */
export const createMockEmailClient = createMockNotifyClient;

/**
 * Test utilities for async operations
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Wait for a condition to be true, with timeout
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  options: { timeout?: number; interval?: number } = {}
): Promise<void> {
  const timeout = options.timeout ?? 5000;
  const interval = options.interval ?? 100;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await delay(interval);
  }

  throw new Error(`Condition not met within ${timeout}ms`);
}
