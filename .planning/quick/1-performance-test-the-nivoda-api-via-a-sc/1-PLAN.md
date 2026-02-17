---
phase: 1-performance-test-the-nivoda-api-via-a-sc
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - scripts/perf-test-proxy.ts
  - package.json
autonomous: false
requirements: []

must_haves:
  truths:
    - "Script can be run locally via npm command"
    - "Script measures request throughput through the ingestion proxy"
    - "Script reports rate limiting behavior (queueing, 429s)"
    - "Script measures latency distribution (p50, p95, p99)"
  artifacts:
    - path: "scripts/perf-test-proxy.ts"
      provides: "Performance testing script with concurrent requests"
      min_lines: 100
    - path: "package.json"
      provides: "npm script entry point"
      exports: ["scripts.perf:proxy"]
  key_links:
    - from: "scripts/perf-test-proxy.ts"
      to: "ProxyGraphqlTransport"
      via: "import from @diamond/nivoda"
      pattern: "import.*ProxyGraphqlTransport.*@diamond/nivoda"
    - from: "scripts/perf-test-proxy.ts"
      to: "ingestion-proxy"
      via: "fetch via NIVODA_PROXY_BASE_URL"
      pattern: "NIVODA_PROXY_BASE_URL"
---

<objective>
Create a TypeScript script for local performance testing of the Nivoda API via the ingestion proxy.

Purpose: Validate rate limiting behavior and measure latency characteristics under load
Output: Executable performance test script with detailed metrics reporting
</objective>

<execution_context>
@/Users/shaunnesbitt/.claude/get-shit-done/workflows/execute-plan.md
@/Users/shaunnesbitt/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@/Users/shaunnesbitt/Desktop/diamond/CLAUDE.md
@/Users/shaunnesbitt/Desktop/diamond/packages/nivoda/src/proxyTransport.ts
@/Users/shaunnesbitt/Desktop/diamond/apps/ingestion-proxy/src/routes/proxy.ts
@/Users/shaunnesbitt/Desktop/diamond/packages/shared/src/constants.ts
@/Users/shaunnesbitt/Desktop/diamond/.env.example
</context>

<tasks>

<task type="auto">
  <name>Create performance testing script</name>
  <files>scripts/perf-test-proxy.ts</files>
  <action>
Create a TypeScript script that:

1. **Test Configuration:**
   - Accepts CLI args: --concurrency (default: 30), --duration (default: 60), --operation (default: authenticate)
   - Uses ProxyGraphqlTransport from @diamond/nivoda
   - Reads NIVODA_PROXY_BASE_URL and INTERNAL_SERVICE_TOKEN from env

2. **GraphQL Operations:**
   - "authenticate" - Simple auth query (fast, minimal data)
   - "search" - diamonds_by_query with small page size (10 items)
   - "count" - diamonds_by_query_count (lightweight count query)

3. **Concurrent Request Pattern:**
   - Launch N concurrent request loops (N = concurrency parameter)
   - Each loop continuously sends requests until duration expires
   - Track per-request metrics: latency, status, success/failure

4. **Metrics Collection:**
   - Total requests sent
   - Successful requests (200)
   - Rate limited (429)
   - Errors (5xx, timeouts)
   - Latency distribution (min, max, mean, p50, p95, p99)
   - Throughput (req/s)

5. **Output:**
   - Live progress updates every 5 seconds (requests sent, current throughput)
   - Final summary table with all metrics
   - Use console.table for readable output

6. **Error Handling:**
   - Catch and count all errors (don't crash on single failures)
   - Log first occurrence of each error type
   - Continue testing until duration expires

Use simple percentile calculation (sort and index), not external stats libraries.
  </action>
  <verify>
npm run typecheck passes without errors in scripts/
  </verify>
  <done>
scripts/perf-test-proxy.ts exists with ProxyGraphqlTransport usage, CLI arg parsing, metrics collection, and console.table output
  </done>
</task>

<task type="auto">
  <name>Add npm script for performance testing</name>
  <files>package.json</files>
  <action>
Add script entry to package.json scripts section:

```json
"perf:proxy": "tsx scripts/perf-test-proxy.ts"
```

This allows running: npm run perf:proxy -- --concurrency 50 --duration 30
  </action>
  <verify>
cat package.json | grep "perf:proxy" shows the new script
  </verify>
  <done>
package.json has perf:proxy script that runs the TypeScript test via tsx
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Verify performance test script functionality</name>
  <what-built>
Performance testing script for Nivoda API via ingestion proxy with:
- Configurable concurrency and duration
- Multiple operation types (authenticate, search, count)
- Latency metrics (p50, p95, p99)
- Rate limiting observability (429 tracking)
- Live progress updates
  </what-built>
  <how-to-verify>
1. Ensure ingestion-proxy is running locally:
   ```bash
   npm run dev:ingestion-proxy
   ```

2. In another terminal, set up environment:
   ```bash
   export NIVODA_PROXY_BASE_URL=http://localhost:3000
   export INTERNAL_SERVICE_TOKEN=your-token-here
   ```

3. Run quick test (15 seconds, 10 concurrent):
   ```bash
   npm run perf:proxy -- --concurrency 10 --duration 15 --operation authenticate
   ```

4. Expected output:
   - Live progress updates every 5 seconds
   - Final summary table showing:
     - Total requests (should be ~150-250 for authenticate)
     - Success rate (should be high)
     - 429 count (should be 0 or low for authenticate)
     - Latency metrics (p50 < 200ms, p99 < 1000ms typical)

5. Test rate limiting (60 seconds, 30 concurrent with heavier operation):
   ```bash
   npm run perf:proxy -- --concurrency 30 --duration 60 --operation search
   ```

6. Expected rate limiting behavior:
   - Some 429 responses (rate limiter working)
   - Throughput stabilizes around configured limit (25 req/s default)
   - No crashes or unhandled errors

7. Verify metrics make sense:
   - Total requests reasonable for concurrency/duration
   - Latency distribution shows realistic values
   - Success + 429 + errors = total requests
  </how-to-verify>
  <resume-signal>
Type "approved" if metrics look reasonable and rate limiting is observable, or describe any issues
  </resume-signal>
</task>

</tasks>

<verification>
- [ ] npm run typecheck passes without errors
- [ ] package.json contains perf:proxy script
- [ ] Script accepts --concurrency, --duration, --operation args
- [ ] Script uses ProxyGraphqlTransport from @diamond/nivoda
- [ ] Script reports latency percentiles (p50, p95, p99)
- [ ] Script tracks and reports 429 responses
- [ ] Script outputs final summary via console.table
- [ ] Script runs locally against dev ingestion-proxy
</verification>

<success_criteria>
- User can run npm run perf:proxy with custom parameters
- Script measures throughput and latency under configurable load
- Rate limiting behavior is observable (429 tracking)
- Output is clear and actionable (console.table with key metrics)
- Script handles errors gracefully without crashing
</success_criteria>

<output>
After completion, create `.planning/quick/1-performance-test-the-nivoda-api-via-a-sc/1-SUMMARY.md`
</output>
