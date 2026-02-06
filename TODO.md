# TODO - Future Enhancements

This document tracks areas for improvement and future enhancements.

## High Priority

### API Security

- [ ] **Add rate limiting** - Implement IP-based or API-key-based rate limiting to prevent abuse
  - Rate limit constants already exist in `packages/shared/src/constants.ts`
  - Need to wire up middleware in `packages/api/src/middleware/`
  - Consider using `express-rate-limit` package
  - Different limits for search vs. mutation operations

- [ ] **Strengthen request validation** - More comprehensive input validation
  - Zod schemas exist but could be more comprehensive
  - Validate diamond IDs are valid UUIDs
  - Location: `packages/api/src/validators/`

### Pipeline Reliability

- [ ] **Automatic worker retry** - Implement automatic retry for transient failures
  - Currently requires manual `npm run worker:retry`
  - Add exponential backoff with max attempts
  - Consider dead-letter queue processing automation
  - Location: `apps/worker/src/`

- [ ] **Consolidator timeout handling** - Add timeout for long-running consolidations
  - Large batches could exceed container timeouts
  - Implement checkpointing for recovery
  - Location: `apps/consolidator/src/`

### Monitoring & Observability

- [ ] **Add metrics collection** - Implement Prometheus metrics
  - Pipeline throughput (diamonds/second)
  - Worker success/failure rates
  - API latency percentiles
  - Queue depths

- [ ] **Add distributed tracing** - Implement OpenTelemetry
  - Trace requests across scheduler → worker → consolidator
  - Integrate with Azure Application Insights
  - Location: `packages/shared/src/`

- [ ] **Expand alerting beyond email** - Additional notification channels
  - Slack/Teams integration for failures
  - PagerDuty for critical issues

## Medium Priority

### Performance Optimizations

- [ ] **Heatmap caching** - Cache density scans for incremental runs
  - Store heatmap results in blob storage
  - Reduce API calls on incremental runs
  - Location: `apps/scheduler/src/heatmap.ts`

- [ ] **Auto-tune consolidator concurrency** - Dynamic based on system load
  - Currently configurable via `CONSOLIDATOR_CONCURRENCY` env var (default 2)
  - Monitor CPU/memory and adjust dynamically

### Code Quality

- [ ] **Increase test coverage** - Add integration tests
  - End-to-end pipeline tests with mocked Nivoda
  - API integration tests with test database
  - Load testing for heatmap scanner

- [ ] **Add load testing** - Performance baseline
  - Measure heatmap scanning time
  - Worker throughput under load
  - API response times at scale

- [ ] **Improve error messages** - More actionable error responses
  - Include troubleshooting hints
  - Link to documentation
  - Location: `packages/api/src/middleware/error-handler.ts`

### Feature Additions

- [ ] **Price history tracking** - Track price changes over time
  - Store historical prices in separate table
  - API endpoint for price trends
  - Useful for analytics

- [ ] **Webhook notifications** - Notify clients of inventory changes
  - Register webhook URLs per API client
  - Push notifications on diamond availability changes

- [ ] **GraphQL API** - Alternative to REST
  - More flexible queries for clients
  - Reduce over-fetching
  - Could coexist with REST

## Low Priority

### Developer Experience

- [ ] **Local development setup** - Docker Compose for full stack
  - Local Service Bus emulator (Azurite)
  - Local PostgreSQL option
  - One-command startup

- [ ] **API SDK generation** - Auto-generate client libraries
  - TypeScript SDK from OpenAPI spec
  - Python client

### Infrastructure

- [ ] **Multi-region deployment** - Geo-redundancy
  - Active-passive failover
  - Database replication

- [ ] **Secrets management** - Azure Key Vault integration
  - Remove secrets from environment variables
  - Managed identity authentication
  - Secret rotation

### Maintenance

- [ ] **Database cleanup job** - Remove old data
  - Archive old raw_diamonds_nivoda records
  - Purge soft-deleted diamonds after retention period
  - Scheduled Azure Function or Container Job

- [ ] **Log retention policy** - Manage log storage
  - Configure Log Analytics retention
  - Archive old logs to cold storage

## Technical Debt

- [ ] **Centralize error handling** - Consistent error types
  - Create custom error classes
  - Standardize error codes across packages
  - Location: `packages/shared/src/`

- [ ] **Type safety improvements** - Stricter TypeScript
  - Enable `noUncheckedIndexedAccess`
  - Remove `any` types where possible
  - Add runtime type validation with Zod

- [ ] **Remove deprecated counter columns** - After validation period
  - `run_metadata.completed_workers` and `failed_workers` columns no longer maintained
  - Counts now computed from `partition_progress` table
  - Apply `sql/migrations/005_remove_counter_columns.sql` when confident
  - See `IMPLEMENTATION_SUMMARY.md` for context

- [ ] **Clean up historical documentation** - Archive resolved design docs
  - `WORKER_CONTINUATION_PATTERN.md` - Pattern is implemented, doc is reference only
  - `IMPLEMENTATION_SUMMARY.md` - Dashboard sync fix is deployed
  - `SYNC_ISSUE_ANALYSIS.md` - Analysis is resolved
  - `instructions.md` - Original creation prompt, not needed in repo

## Completed

- [x] Add comprehensive README.md
- [x] Update CLAUDE.md with build commands
- [x] Document all packages with READMEs
- [x] Document all apps with READMEs
- [x] Split CI/CD workflows (now consolidated into ci-affected-staging.yaml)
- [x] Azure cost optimization
- [x] Worker retry consolidation
- [x] Worker continuation pattern (one page per message)
- [x] Bulk upsert for raw diamonds (UNNEST-based batch inserts)
- [x] Consolidator claim pattern with FOR UPDATE SKIP LOCKED
- [x] Dashboard sync fix (partition_progress as single source of truth)
- [x] Rate limit constants defined
- [x] Per-service database pool configuration (PG_POOL_MAX env var)
- [x] Dashboard admin UI with run management, analytics, triggers

---

## Priority Guidelines

- **High**: Security issues, data integrity, production reliability
- **Medium**: Performance, developer experience, maintainability
- **Low**: Nice-to-have features, future considerations
