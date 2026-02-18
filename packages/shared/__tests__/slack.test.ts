/**
 * Unit tests for the Slack notification client.
 * Tests the notify() function, channel routing, retry logic,
 * graceful degradation, and payload formatting.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { notify, NotifyCategory, NotifyChannel, _resetSlackState } from '../src/utils/slack.js';

// Helper to create a mock fetch response
function mockFetchOk() {
  return Promise.resolve(new Response('ok', { status: 200 }));
}

function mockFetchError(status: number, body = 'error') {
  return Promise.resolve(new Response(body, { status }));
}

function mockFetchNetworkError() {
  return Promise.reject(new Error('Network error'));
}

describe('Slack Notification Client', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    _resetSlackState();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  describe('notify() — graceful degradation', () => {
    it('should skip notification and warn once when webhook URL not configured', async () => {
      vi.stubEnv('SLACK_WEBHOOK_ERRORS', '');
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);

      await notify({ category: NotifyCategory.SCHEDULER_FAILED, title: 'Test', message: 'body' });
      await notify({ category: NotifyCategory.SCHEDULER_FAILED, title: 'Test 2', message: 'body' });

      expect(fetchSpy).not.toHaveBeenCalled();
      // Should warn only once
      expect(consoleSpy.mock.calls.filter(c => c[0].includes('SLACK_WEBHOOK_ERRORS'))).toHaveLength(1);
    });

    it('should never throw even if fetch fails', async () => {
      vi.stubEnv('SLACK_WEBHOOK_ERRORS', 'https://hooks.slack.com/test');
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')));

      // Should not throw
      await expect(
        notify({ category: NotifyCategory.API_ERROR, title: 'Fail', message: 'oh no' })
      ).resolves.toBeUndefined();
    });

    it('should log to console.error when fetch fails (not rethrow)', async () => {
      vi.stubEnv('SLACK_WEBHOOK_ERRORS', 'https://hooks.slack.com/test');
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await notify({ category: NotifyCategory.API_ERROR, title: 'Fail', message: 'oh no' });

      expect(consoleSpy).toHaveBeenCalledWith(
        '[slack] Failed to send notification',
        expect.objectContaining({ error: 'network down' })
      );
    });
  });

  describe('notify() — channel routing', () => {
    it('should route error categories to SLACK_WEBHOOK_ERRORS', async () => {
      const errorUrl = 'https://hooks.slack.com/errors';
      vi.stubEnv('SLACK_WEBHOOK_ERRORS', errorUrl);
      vi.stubEnv('SLACK_WEBHOOK_PIPELINE', 'https://hooks.slack.com/pipeline');
      const fetchSpy = vi.fn().mockImplementation(mockFetchOk);
      vi.stubGlobal('fetch', fetchSpy);

      const errorCategories = [
        NotifyCategory.SCHEDULER_FAILED,
        NotifyCategory.RUN_FAILED,
        NotifyCategory.CONSOLIDATION_FAILED,
        NotifyCategory.WORKER_ERROR,
        NotifyCategory.API_ERROR,
        NotifyCategory.AUTH_FAILURE,
        NotifyCategory.DATABASE_ERROR,
        NotifyCategory.EXTERNAL_SERVICE_ERROR,
      ];

      for (const category of errorCategories) {
        _resetSlackState();
        fetchSpy.mockClear();
        await notify({ category, title: 'Test', message: 'body' });
        expect(fetchSpy).toHaveBeenCalledWith(errorUrl, expect.any(Object));
      }
    });

    it('should route pipeline categories to SLACK_WEBHOOK_PIPELINE', async () => {
      const pipelineUrl = 'https://hooks.slack.com/pipeline';
      vi.stubEnv('SLACK_WEBHOOK_PIPELINE', pipelineUrl);
      const fetchSpy = vi.fn().mockImplementation(mockFetchOk);
      vi.stubGlobal('fetch', fetchSpy);

      const pipelineCategories = [
        NotifyCategory.RUN_COMPLETED,
        NotifyCategory.RUN_PARTIAL_SUCCESS,
        NotifyCategory.CONSOLIDATION_COMPLETED,
        NotifyCategory.CONSOLIDATION_SKIPPED,
      ];

      for (const category of pipelineCategories) {
        _resetSlackState();
        fetchSpy.mockClear();
        await notify({ category, title: 'Test', message: 'body' });
        expect(fetchSpy).toHaveBeenCalledWith(pipelineUrl, expect.any(Object));
      }
    });

    it('should route ops categories to SLACK_WEBHOOK_OPS', async () => {
      const opsUrl = 'https://hooks.slack.com/ops';
      vi.stubEnv('SLACK_WEBHOOK_OPS', opsUrl);
      const fetchSpy = vi.fn().mockImplementation(mockFetchOk);
      vi.stubGlobal('fetch', fetchSpy);

      const opsCategories = [
        NotifyCategory.SCHEDULER_STARTED,
        NotifyCategory.RATE_LIMIT_EXCEEDED,
        NotifyCategory.REPRICING_COMPLETED,
        NotifyCategory.REPRICING_FAILED,
      ];

      for (const category of opsCategories) {
        _resetSlackState();
        fetchSpy.mockClear();
        await notify({ category, title: 'Test', message: 'body' });
        expect(fetchSpy).toHaveBeenCalledWith(opsUrl, expect.any(Object));
      }
    });
  });

  describe('notify() — payload structure', () => {
    it('should send a valid Block Kit payload with correct structure', async () => {
      vi.stubEnv('SLACK_WEBHOOK_PIPELINE', 'https://hooks.slack.com/pipeline');
      let capturedBody: unknown;
      vi.stubGlobal('fetch', vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        capturedBody = JSON.parse(init.body as string);
        return mockFetchOk();
      }));

      await notify({
        category: NotifyCategory.RUN_COMPLETED,
        title: 'Run Done',
        message: 'All good',
        context: { runId: 'abc', feed: 'nivoda' },
      });

      expect(capturedBody).toMatchObject({
        attachments: [
          {
            color: '#28a745', // green for success
            blocks: expect.arrayContaining([
              expect.objectContaining({ type: 'header' }),
              expect.objectContaining({ type: 'section' }),
              expect.objectContaining({ type: 'context' }),
            ]),
          },
        ],
      });
    });

    it('should include context fields in the payload', async () => {
      vi.stubEnv('SLACK_WEBHOOK_PIPELINE', 'https://hooks.slack.com/pipeline');
      let capturedBody: { attachments: Array<{ blocks: Array<{ type: string; text?: { text: string } }> }> };
      vi.stubGlobal('fetch', vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        capturedBody = JSON.parse(init.body as string);
        return mockFetchOk();
      }));

      await notify({
        category: NotifyCategory.RUN_COMPLETED,
        title: 'Test',
        message: 'msg',
        context: { runId: 'run-123', feed: 'nivoda' },
      });

      const blocks = capturedBody!.attachments[0].blocks;
      const contextSectionBlock = blocks.find(b => b.type === 'section' && b.text?.text.includes('runId'));
      expect(contextSectionBlock).toBeDefined();
    });

    it('should use red color for error categories', async () => {
      vi.stubEnv('SLACK_WEBHOOK_ERRORS', 'https://hooks.slack.com/errors');
      let capturedColor: string = '';
      vi.stubGlobal('fetch', vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string);
        capturedColor = body.attachments[0].color;
        return mockFetchOk();
      }));

      await notify({ category: NotifyCategory.API_ERROR, title: 'Error', message: 'boom' });

      expect(capturedColor).toBe('#dc3545');
    });

    it('should use yellow color for warning categories', async () => {
      vi.stubEnv('SLACK_WEBHOOK_PIPELINE', 'https://hooks.slack.com/pipeline');
      let capturedColor: string = '';
      vi.stubGlobal('fetch', vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string);
        capturedColor = body.attachments[0].color;
        return mockFetchOk();
      }));

      await notify({ category: NotifyCategory.RUN_PARTIAL_SUCCESS, title: 'Partial', message: 'some workers failed' });

      expect(capturedColor).toBe('#ffc107');
    });
  });

  describe('notify() — message truncation', () => {
    it('should truncate messages longer than 3000 chars', async () => {
      vi.stubEnv('SLACK_WEBHOOK_ERRORS', 'https://hooks.slack.com/errors');
      let capturedBody: { attachments: Array<{ blocks: Array<{ type: string; text?: { text: string } }> }> };
      vi.stubGlobal('fetch', vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        capturedBody = JSON.parse(init.body as string);
        return mockFetchOk();
      }));

      const longMessage = 'x'.repeat(5000);
      await notify({ category: NotifyCategory.API_ERROR, title: 'Test', message: longMessage });

      const sectionBlock = capturedBody!.attachments[0].blocks.find(b => b.type === 'section');
      expect(sectionBlock?.text?.text.length).toBeLessThanOrEqual(3000);
    });

    it('should truncate title longer than 150 chars', async () => {
      vi.stubEnv('SLACK_WEBHOOK_ERRORS', 'https://hooks.slack.com/errors');
      let capturedBody: { attachments: Array<{ blocks: Array<{ type: string; text?: { text: string } }> }> };
      vi.stubGlobal('fetch', vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        capturedBody = JSON.parse(init.body as string);
        return mockFetchOk();
      }));

      const longTitle = 'T'.repeat(200);
      await notify({ category: NotifyCategory.API_ERROR, title: longTitle, message: 'body' });

      const headerBlock = capturedBody!.attachments[0].blocks.find(b => b.type === 'header');
      const text = (headerBlock as { type: string; text: { text: string } } | undefined)?.text?.text ?? '';
      expect(text.length).toBeLessThanOrEqual(150);
    });
  });

  describe('notify() — retry logic', () => {
    it('should retry on 5xx responses and succeed on final attempt', async () => {
      vi.stubEnv('SLACK_WEBHOOK_ERRORS', 'https://hooks.slack.com/errors');
      let callCount = 0;
      vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          return mockFetchError(500, 'internal error');
        }
        return mockFetchOk();
      }));

      await notify({ category: NotifyCategory.API_ERROR, title: 'Test', message: 'body' });

      expect(callCount).toBe(3);
    });

    it('should NOT retry on 4xx client errors', async () => {
      vi.stubEnv('SLACK_WEBHOOK_ERRORS', 'https://hooks.slack.com/errors');
      let callCount = 0;
      vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
        callCount++;
        return mockFetchError(400, 'bad request');
      }));

      await notify({ category: NotifyCategory.API_ERROR, title: 'Test', message: 'body' });

      expect(callCount).toBe(1); // No retries on 4xx
    });
  });

  describe('notify() — error attachment', () => {
    it('should include error stack in message when error is provided', async () => {
      vi.stubEnv('SLACK_WEBHOOK_ERRORS', 'https://hooks.slack.com/errors');
      let capturedBody: { attachments: Array<{ blocks: Array<{ type: string; text?: { text: string } }> }> };
      vi.stubGlobal('fetch', vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        capturedBody = JSON.parse(init.body as string);
        return mockFetchOk();
      }));

      const err = new Error('Something broke');
      await notify({ category: NotifyCategory.API_ERROR, title: 'Error', message: 'details', error: err });

      const sectionBlock = capturedBody!.attachments[0].blocks.find(b => b.type === 'section');
      expect(sectionBlock?.text?.text).toContain('Something broke');
    });
  });

  describe('formatDuration', () => {
    it('should format durations correctly', async () => {
      const { formatDuration } = await import('../src/utils/slack.js');

      const start = new Date('2024-01-01T10:00:00Z');

      expect(formatDuration(start, new Date('2024-01-01T10:00:45Z'))).toBe('45s');
      expect(formatDuration(start, new Date('2024-01-01T10:02:30Z'))).toBe('2m 30s');
      expect(formatDuration(start, new Date('2024-01-01T12:15:00Z'))).toBe('2h 15m');
    });
  });
});
