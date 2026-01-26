# TODO - Future Enhancements

This document tracks areas for improvement and future enhancements identified during code review.

## High Priority

### API Security

- [ ] **Add rate limiting** - Implement IP-based or API-key-based rate limiting to prevent abuse
  - Consider using `express-rate-limit` package
  - Different limits for search vs. mutation operations
  - Location: `packages/api/src/middleware/`

- [ ] **Add request validation** - Strengthen input validation on all endpoints
  - Zod schemas exist but could be more comprehensive
  - Validate diamond IDs are valid UUIDs
  - Location: `packages/api/src/schemas/`

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

- [ ] **Add structured alerting** - Expand alerting beyond email
  - Slack/Teams integration for failures
  - PagerDuty for critical issues
  - Dashboard with run history

## Medium Priority

### Performance Optimizations

- [ ] **Heatmap caching** - Cache density scans for incremental runs
  - Store heatmap results in blob storage
  - Reduce API calls on incremental runs
  - Location: `apps/scheduler/src/heatmap.ts`

- [ ] **Consolidator concurrency tuning** - Auto-tune based on system load
  - Currently fixed at 10 concurrent batches
  - Monitor CPU/memory and adjust dynamically
  - Location: `apps/consolidator/src/processor.ts`

- [ ] **Database connection pooling** - Optimize pool settings
  - Current: min 2, max 15
  - Add connection health checks
  - Consider PgBouncer for high load
  - Location: `packages/database/src/client.ts`

- [ ] **Batch insert optimization** - Use COPY for large inserts
  - Current: Individual upserts
  - Bulk operations for raw diamond ingestion
  - Location: `apps/worker/src/inserter.ts`

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
  - Location: `packages/api/src/middleware/error.ts`

### Feature Additions

- [ ] **Diamond comparison endpoint** - Compare multiple diamonds
  - Side-by-side comparison API
  - Calculate value scores
  - Location: `packages/api/src/routes/diamonds.ts`

- [ ] **Price history tracking** - Track price changes over time
  - Store historical prices in separate table
  - API endpoint for price trends
  - Useful for analytics

- [ ] **Webhook notifications** - Notify clients of inventory changes
  - Register webhook URLs per API client
  - Push notifications on diamond availability changes
  - Location: `packages/api/src/`

- [ ] **GraphQL API** - Alternative to REST
  - More flexible queries for clients
  - Reduce over-fetching
  - Could coexist with REST

## Low Priority

### Developer Experience

- [ ] **Local development setup** - Docker Compose for full stack
  - Local Service Bus emulator (Azurite)
  - Local PostgreSQL
  - One-command startup

- [ ] **API SDK generation** - Auto-generate client libraries
  - TypeScript SDK from OpenAPI spec
  - Python client
  - Location: `packages/api/src/swagger/`

- [ ] **Documentation site** - Generate docs from code
  - TypeDoc for API documentation
  - Docusaurus or similar for guides
  - Host on GitHub Pages

### Infrastructure

- [ ] **Multi-region deployment** - Geo-redundancy
  - Active-passive failover
  - Database replication
  - CDN for API responses

- [ ] **Cost optimization** - Reduce Azure spend
  - Reserved instances for production
  - Spot instances for workers
  - Storage lifecycle policies

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
  - Reduce costs

## Technical Debt

### Code Improvements

- [ ] **Centralize error handling** - Consistent error types
  - Create custom error classes
  - Standardize error codes across packages
  - Location: `packages/shared/src/errors/`

- [ ] **Extract common patterns** - Reduce duplication
  - Retry logic used in multiple places
  - Pagination handling
  - Service Bus message handling

- [ ] **Type safety improvements** - Stricter TypeScript
  - Enable `noUncheckedIndexedAccess`
  - Remove `any` types where possible
  - Add runtime type validation with Zod

### Documentation

- [ ] **API examples** - More code examples
  - Python integration examples
  - JavaScript/TypeScript examples
  - Postman collection

- [ ] **Architecture decision records** - Document decisions
  - Why two-stage pipeline?
  - Why heatmap partitioning?
  - Why cents for pricing?

## Completed

- [x] Add comprehensive README.md
- [x] Update CLAUDE.md with build commands
- [x] Document all packages with READMEs
- [x] Document all apps with READMEs
- [x] Split CI/CD workflows
- [x] Azure cost optimization
- [x] Worker retry consolidation

---

## How to Contribute

1. Pick an item from the list
2. Create a feature branch: `git checkout -b feature/description`
3. Implement the change
4. Add tests if applicable
5. Update documentation
6. Create a pull request

## Priority Guidelines

- **High**: Security issues, data integrity, production reliability
- **Medium**: Performance, developer experience, maintainability
- **Low**: Nice-to-have features, future considerations
