# Observability & Monitoring Patterns

**Research Date:** 2026-02-17
**Domain:** Message-driven distributed systems on Azure
**Infrastructure:** Azure Container Apps + Azure Service Bus + PostgreSQL
**Overall Confidence:** HIGH

## Problem Space

### Current State
The diamond inventory platform has foundational logging (pino with structured JSON) and basic alerting (email via Resend), but lacks production-grade observability for distributed tracing, health monitoring, and failure recovery.

**Services:**
- Scheduler (CronJob) - Partitions work and enqueues messages
- Worker (message consumer, 0-10 replicas) - Processes inventory data pages
- Consolidator (message consumer, 1-2 replicas) - Transforms and prices data
- API (HTTP REST) - Serves consolidated data with search/caching

**Current Infrastructure:**
- Azure Container Apps with Log Analytics workspace
- Azure Service Bus (work-items, consolidate, work-done queues)
- Structured logging with pino (traceId, runId, partitionId already in place)
- Email alerts via Resend (rate-limited, retries, queued)
- No distributed tracing
- No dead-letter queue monitoring/automation
- No health probes configured in Terraform
- Silent alert failures (alerts exist but may not fire correctly)

### Identified Gaps

1. **Silent Alert Failures**
   - Current alerts use Resend email only, no delivery confirmation
   - No monitoring of alert delivery success/failure
   - No fallback notification channels

2. **No Distributed Tracing**
   - TraceId generated but not propagated through Service Bus
   - Cannot trace requests across scheduler → worker → consolidator flow
   - No correlation of logs across service boundaries
   - Missing observability into message processing latency

3. **No Dead-Letter Queue Monitoring**
   - Service Bus DLQs exist by default but not monitored
   - Failed messages accumulate silently
   - No automated retry or manual intervention workflows
   - No alerting on DLQ message accumulation

4. **Insufficient Health Checks**
   - Azure Container Apps deployed without health probes
   - No liveness/readiness/startup probes configured in Terraform
   - Cannot detect hung processes or slow startup times
   - Platform cannot auto-recover from unhealthy states

5. **Inconsistent Error Logging**
   - Good: Structured logging with pino, context propagation, error truncation
   - Gap: No centralized error aggregation/analysis
   - Gap: Error logs in database but not correlated with traces
   - Gap: Stack traces truncated to 6 frames (good for Azure limits, may lose context)

---

## Distributed Tracing

### Solution: OpenTelemetry + Azure Application Insights

**Confidence: HIGH**

Azure Container Apps has native OpenTelemetry support with automatic collection and export to any OTLP-compatible endpoint. Application Insights supports OpenTelemetry via the Azure Monitor OpenTelemetry Distro for Node.js/TypeScript.

### Implementation Pattern

#### 1. Install OpenTelemetry Packages

```bash
npm install @azure/monitor-opentelemetry \
  @opentelemetry/api \
  @opentelemetry/instrumentation-pino \
  @opentelemetry/instrumentation-pg
```

#### 2. Initialize Tracing in Each Service

```typescript
// packages/shared/src/telemetry.ts
import { useAzureMonitor } from '@azure/monitor-opentelemetry';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

export function initializeTelemetry(serviceName: string): void {
  // Azure Monitor will use APPLICATIONINSIGHTS_CONNECTION_STRING env var
  useAzureMonitor({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
    }),
    enableAutoCollectConsole: false, // We use pino
    enableAutoCollectExceptions: true,
    enableAutoCollectRequests: true,
    enableAutoCollectDependencies: true,
  });
}
```

Call in each service entrypoint:
```typescript
// apps/scheduler/src/index.ts
import { initializeTelemetry } from '@diamond/shared';
initializeTelemetry('scheduler');
```

#### 3. Service Bus Context Propagation

**CRITICAL:** Service Bus does not automatically propagate trace context. Must implement manually.

```typescript
// packages/shared/src/tracing.ts
import { trace, context, propagation } from '@opentelemetry/api';
import type { ServiceBusMessage } from '@azure/service-bus';

/**
 * Inject trace context into Service Bus message application properties
 */
export function injectTraceContext(message: ServiceBusMessage): void {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);

  // Service Bus stores custom properties in applicationProperties
  message.applicationProperties = {
    ...message.applicationProperties,
    ...carrier,
  };
}

/**
 * Extract trace context from Service Bus message and set as active
 */
export function extractAndSetTraceContext(message: ServiceBusMessage): void {
  const carrier = message.applicationProperties || {};
  const extractedContext = propagation.extract(context.active(), carrier);
  context.setGlobalContextManager(extractedContext);
}
```

#### 4. Update Message Sending (Scheduler & Worker)

```typescript
// apps/scheduler/src/service-bus.ts
import { injectTraceContext } from '@diamond/shared';

export async function sendWorkItems(workItems: WorkItemMessage[]): Promise<void> {
  const sender = serviceBusClient.createSender('work-items');

  const messages = workItems.map(item => {
    const message = {
      body: item,
      contentType: 'application/json',
      applicationProperties: {},
    };
    injectTraceContext(message); // Inject trace context
    return message;
  });

  await sender.sendMessages(messages);
  await sender.close();
}
```

#### 5. Update Message Receiving (Worker & Consolidator)

```typescript
// apps/worker/src/index.ts
import { extractAndSetTraceContext } from '@diamond/shared';
import { trace } from '@opentelemetry/api';

async function handleWorkItem(workItem: WorkItemMessage, message: ServiceBusReceivedMessage): Promise<void> {
  // Extract and activate parent trace context
  extractAndSetTraceContext(message);

  const tracer = trace.getTracer('worker');
  const span = tracer.startSpan('process_work_item', {
    attributes: {
      'messaging.system': 'servicebus',
      'messaging.destination': 'work-items',
      'diamond.run_id': workItem.runId,
      'diamond.partition_id': workItem.partitionId,
    },
  });

  try {
    await processWorkItemPage(workItem, adapter, workerRunId, log);
    span.setStatus({ code: SpanStatusCode.OK });
  } catch (error) {
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR });
    throw error;
  } finally {
    span.end();
  }
}
```

#### 6. Pino Integration (Automatic Trace/Span ID Injection)

```typescript
// packages/shared/src/utils/logger.ts
import { logs } from '@opentelemetry/api-logs';
import { PinoInstrumentation } from '@opentelemetry/instrumentation-pino';

// Register Pino instrumentation (call once at startup)
const pinoInstrumentation = new PinoInstrumentation({
  logHook: (span, record) => {
    record['trace_id'] = span.spanContext().traceId;
    record['span_id'] = span.spanContext().spanId;
  },
});
pinoInstrumentation.enable();
```

This automatically injects `trace_id` and `span_id` into every pino log entry within an active span.

#### 7. Environment Variables

Add to all Container Apps:
```hcl
env {
  name        = "APPLICATIONINSIGHTS_CONNECTION_STRING"
  secret_name = "applicationinsights-connection-string"
}
```

### W3C Trace Context Standard

Use W3C TraceContext (industry standard) for propagation. OpenTelemetry defaults to this via `traceparent` and `tracestate` headers.

For Service Bus, these are stored in `applicationProperties` and extracted manually (see code above).

### Querying Traces in Application Insights

```kql
// Find all operations for a specific run
dependencies
| union requests
| where customDimensions.diamond_run_id == "abc123"
| project timestamp, name, duration, success, operation_Id
| order by timestamp asc

// End-to-end trace for a partition
let runId = "abc123";
let partitionId = "p-1";
traces
| union dependencies, requests
| where customDimensions.diamond_run_id == runId
  and customDimensions.diamond_partition_id == partitionId
| project timestamp, severityLevel, message, operation_Id, operation_ParentId
| order by timestamp asc
```

### Benefits

- **End-to-end visibility:** Trace scheduler → worker (N pages) → consolidator flow
- **Performance analysis:** Identify slow operations (Nivoda API calls, DB queries, consolidation)
- **Failure correlation:** Link errors to specific traces and parent operations
- **Automatic dependency tracking:** HTTP, PostgreSQL, Service Bus calls auto-instrumented

### References

- [Azure Application Insights distributed tracing with Service Bus](https://learn.microsoft.com/en-us/azure/service-bus-messaging/service-bus-end-to-end-tracing)
- [OpenTelemetry on Azure](https://learn.microsoft.com/en-us/azure/azure-monitor/app/opentelemetry)
- [OpenTelemetry TypeScript context propagation](https://opentelemetry.io/docs/languages/js/propagation/)
- [Propagate OpenTelemetry Context via Azure Service Bus](https://www.twilio.com/en-us/blog/developers/community/propagate-opentelemetry-context-via-azure-service-bus-for-async-dotnet-services)
- [Pino Logger OpenTelemetry integration](https://medium.com/@hadiyolworld007/node-js-structured-logging-with-pino-opentelemetry-correlated-traces-logs-and-metrics-in-one-2c28b10c4fa0)

---

## Dead-Letter Queue Patterns

### Solution: Monitoring + Automated Retry + Manual Intervention

**Confidence: HIGH**

Azure Service Bus automatically moves messages to DLQs when:
- Delivery count exceeds `MaxDeliveryCount` (default: 10)
- Message TTL expires
- Manual dead-lettering via `deadLetter()` API

### Current State

DLQs exist for each queue (`work-items/$deadletterqueue`, `consolidate/$deadletterqueue`) but are not monitored or processed.

### Implementation Pattern

#### 1. DLQ Monitoring with Azure Monitor Alerts

Create metric alerts on dead-letter message count:

```hcl
# infrastructure/terraform/modules/monitoring/main.tf
resource "azurerm_monitor_metric_alert" "dlq_work_items" {
  name                = "${var.environment_name}-dlq-work-items-alert"
  resource_group_name = var.resource_group_name
  scopes              = [var.servicebus_namespace_id]
  description         = "Alert when work-items DLQ has messages"

  criteria {
    metric_namespace = "Microsoft.ServiceBus/namespaces"
    metric_name      = "DeadletteredMessages"
    aggregation      = "Maximum"
    operator         = "GreaterThan"
    threshold        = 0

    dimension {
      name     = "EntityName"
      operator = "Include"
      values   = ["work-items"]
    }
  }

  action {
    action_group_id = azurerm_monitor_action_group.alerts.id
  }

  frequency   = "PT5M"  # Check every 5 minutes
  window_size = "PT5M"
}
```

Repeat for `consolidate` queue.

#### 2. Action Group for Multiple Notification Channels

```hcl
resource "azurerm_monitor_action_group" "alerts" {
  name                = "${var.environment_name}-alerts"
  resource_group_name = var.resource_group_name
  short_name          = "diamondalert"

  email_receiver {
    name          = "primary"
    email_address = var.alert_email_to
  }

  # Optional: Add webhook for Slack/Teams integration
  webhook_receiver {
    name        = "slack"
    service_uri = var.slack_webhook_url  # Optional
  }
}
```

#### 3. DLQ Processing Logic (Manual Intervention)

Create a new Container App for DLQ processing (optional, or add to API):

```typescript
// apps/dlq-processor/src/index.ts
import { ServiceBusClient } from '@azure/service-bus';

const client = ServiceBusClient.createFromConnectionString(
  process.env.AZURE_SERVICE_BUS_CONNECTION_STRING!
);

async function processDLQ(queueName: string): Promise<void> {
  const receiver = client.createReceiver(queueName, {
    subQueueType: 'deadLetter',
    receiveMode: 'peekLock',
  });

  const messages = await receiver.receiveMessages(10, { maxWaitTimeInMs: 5000 });

  for (const message of messages) {
    const reason = message.deadLetterReason;
    const description = message.deadLetterErrorDescription;

    log.warn('DLQ message', {
      queueName,
      reason,
      description,
      deliveryCount: message.deliveryCount,
      enqueuedTime: message.enqueuedTimeUtc,
      body: message.body,
    });

    // Manual inspection: Log to database for review
    await insertDLQLog({
      queue_name: queueName,
      message_id: message.messageId,
      reason,
      description,
      body: message.body,
      enqueued_at: message.enqueuedTimeUtc,
    });

    // Complete the DLQ message (removes it from DLQ)
    await receiver.completeMessage(message);
  }

  await receiver.close();
}

// Run every 5 minutes
setInterval(() => {
  processDLQ('work-items').catch(console.error);
  processDLQ('consolidate').catch(console.error);
}, 5 * 60 * 1000);
```

#### 4. Resubmit Pattern (After Fix)

```typescript
// Resubmit fixed message to original queue
async function resubmitFromDLQ(
  queueName: string,
  messageId: string
): Promise<void> {
  const dlqReceiver = client.createReceiver(queueName, {
    subQueueType: 'deadLetter',
    receiveMode: 'peekLock',
  });

  const messages = await dlqReceiver.receiveMessages(100);
  const targetMessage = messages.find(m => m.messageId === messageId);

  if (!targetMessage) {
    throw new Error(`Message ${messageId} not found in DLQ`);
  }

  // Send back to original queue
  const sender = client.createSender(queueName);
  await sender.sendMessages({
    body: targetMessage.body,
    contentType: targetMessage.contentType,
    applicationProperties: targetMessage.applicationProperties,
  });

  // Remove from DLQ
  await dlqReceiver.completeMessage(targetMessage);

  await dlqReceiver.close();
  await sender.close();

  log.info('Message resubmitted from DLQ', { queueName, messageId });
}
```

#### 5. Dashboard Query for DLQ Analysis

```kql
// Service Bus DLQ messages by reason
ServiceBusQueueLogs
| where OperationName == "DeadLetter"
| summarize count() by DeadLetterReason, bin(TimeGenerated, 1h)
| render timechart
```

### Retry Strategy

**Automatic Retries (Service Bus Native):**
- MaxDeliveryCount: 10 (default, configurable in Terraform)
- Lock duration: 60 seconds (adjust if worker processing time exceeds this)
- If worker abandons message (uncaught error), Service Bus retries automatically

**Manual Retries (DLQ):**
- Inspect DLQ messages via processor
- Fix root cause (code bug, data issue, infrastructure)
- Resubmit to original queue with `resubmitFromDLQ()`

### DLQ Terraform Configuration

```hcl
# infrastructure/terraform/modules/service-bus/main.tf
resource "azurerm_servicebus_queue" "work_items" {
  name         = "work-items"
  namespace_id = azurerm_servicebus_namespace.main.id

  enable_partitioning       = false
  max_delivery_count        = 10      # Move to DLQ after 10 retries
  lock_duration             = "PT1M"  # 1 minute lock duration
  default_message_ttl       = "P1D"   # 1 day TTL
  dead_lettering_on_message_expiration = true  # TTL expiry → DLQ
}
```

### Benefits

- **Visibility:** Alerts fire when DLQ accumulates messages
- **Root cause analysis:** DLQ processor logs reason/description
- **Manual recovery:** Resubmit workflow for transient failures
- **Prevent data loss:** Messages don't disappear after max retries

### References

- [Service Bus dead-letter queues](https://learn.microsoft.com/en-us/azure/service-bus-messaging/service-bus-dead-letter-queues)
- [Enable dead lettering for Service Bus](https://learn.microsoft.com/en-us/azure/service-bus-messaging/enable-dead-letter)
- [DLQ monitoring and automation patterns](https://turbo360.com/blog/azure-service-bus-dead-letter-queue-monitoring)
- [Implementing retry patterns with Service Bus](https://www.infosupport.com/en/implementing-a-retry-pattern-for-azure-service-bus-with-topic-filters/)

---

## Health Checks

### Solution: Liveness/Readiness/Startup Probes in Terraform

**Confidence: HIGH**

Azure Container Apps support HTTP, TCP, and gRPC health probes. For TypeScript apps, HTTP probes are most common.

### Probe Types

1. **Startup Probe:** Delays liveness/readiness checks until app finishes startup (prevents premature restarts)
2. **Liveness Probe:** Checks if container is running; restarts if fails (recovers from hung processes)
3. **Readiness Probe:** Checks if container is ready for traffic; removes from load balancer if fails

### Implementation Pattern

#### 1. Add Health Endpoints to Services

**API (Express):**
```typescript
// packages/api/src/routes/health.ts
import { Router } from 'express';
import { getPool } from '@diamond/database';

const router = Router();

router.get('/health/liveness', (req, res) => {
  // Simple check: process is running
  res.status(200).json({ status: 'alive' });
});

router.get('/health/readiness', async (req, res) => {
  try {
    // Check database connection
    await getPool().query('SELECT 1');
    res.status(200).json({ status: 'ready' });
  } catch (error) {
    res.status(503).json({ status: 'not_ready', error: error.message });
  }
});

export default router;
```

**Worker/Consolidator (Long-running consumers):**
```typescript
// apps/worker/src/health.ts
import { createServer } from 'http';

let isReady = false;

export function setReady(ready: boolean): void {
  isReady = ready;
}

// Simple HTTP server for probes
export function startHealthServer(port = 8080): void {
  const server = createServer((req, res) => {
    if (req.url === '/health/liveness') {
      // Always return 200 if process is running
      res.writeHead(200);
      res.end('alive');
    } else if (req.url === '/health/readiness') {
      // Return 200 only if worker is initialized
      if (isReady) {
        res.writeHead(200);
        res.end('ready');
      } else {
        res.writeHead(503);
        res.end('not_ready');
      }
    } else {
      res.writeHead(404);
      res.end('not_found');
    }
  });

  server.listen(port, () => {
    console.log(`Health server listening on :${port}`);
  });
}

// In main():
startHealthServer();
// After initialization:
setReady(true);
```

#### 2. Configure Probes in Terraform

**API (HTTP service):**
```hcl
# infrastructure/terraform/modules/container-apps/main.tf
resource "azurerm_container_app" "api" {
  # ... existing config ...

  template {
    container {
      # ... existing container config ...

      liveness_probe {
        transport = "HTTP"
        port      = 3000
        path      = "/health/liveness"

        initial_delay_seconds = 10
        interval_seconds      = 30
        timeout_seconds       = 5
        failure_threshold     = 3
      }

      readiness_probe {
        transport = "HTTP"
        port      = 3000
        path      = "/health/readiness"

        initial_delay_seconds = 5
        interval_seconds      = 10
        timeout_seconds       = 3
        failure_threshold     = 3
        success_threshold     = 1
      }
    }
  }
}
```

**Worker (long-running consumer with startup probe):**
```hcl
resource "azurerm_container_app" "worker" {
  # ... existing config ...

  template {
    container {
      # ... existing container config ...

      # Port 8080 for health checks (separate from message processing)
      env {
        name  = "HEALTH_PORT"
        value = "8080"
      }

      startup_probe {
        transport = "HTTP"
        port      = 8080
        path      = "/health/liveness"

        initial_delay_seconds = 0
        interval_seconds      = 5
        timeout_seconds       = 3
        failure_threshold     = 48  # 48 * 5s = 4 minutes max startup time
      }

      liveness_probe {
        transport = "HTTP"
        port      = 8080
        path      = "/health/liveness"

        initial_delay_seconds = 0  # Startup probe delays this
        interval_seconds      = 30
        timeout_seconds       = 5
        failure_threshold     = 3  # 3 * 30s = 90s before restart
      }

      readiness_probe {
        transport = "HTTP"
        port      = 8080
        path      = "/health/readiness"

        initial_delay_seconds = 0
        interval_seconds      = 10
        timeout_seconds       = 3
        failure_threshold     = 3
        success_threshold     = 1
      }
    }
  }
}
```

**Consolidator (similar to worker):**
```hcl
resource "azurerm_container_app" "consolidator" {
  # ... same probe config as worker ...
}
```

**Scheduler (CronJob - no probes needed, job either succeeds or fails):**
```hcl
# No health probes for scheduler job
# Container Apps Jobs terminate after execution
```

#### 3. Probe Timing Guidelines

**API (fast startup):**
- Startup probe: Not needed (starts in <10s)
- Liveness: 10s initial delay, 30s interval, 3 failures = restart
- Readiness: 5s initial delay, 10s interval, removes from LB if DB fails

**Worker/Consolidator (slower startup, high replica count):**
- Startup probe: 0s initial delay, 5s interval, 48 failures = 4min max (prevents premature liveness failures)
- Liveness: 0s initial delay (startup delays it), 30s interval, 3 failures = restart after 90s hung
- Readiness: 0s initial delay, 10s interval, removes from scaling if not ready

### Failure Scenarios

| Scenario | Probe Response | Container Action |
|----------|---------------|------------------|
| Process hangs | Liveness fails after 3*30s | Container restarts |
| DB connection lost | Readiness fails | Removed from LB, remains running |
| Slow startup (2 min) | Startup succeeds within 4 min | Liveness/readiness delayed, no premature restart |
| Message processing timeout | No probe impact | Message lock expires, Service Bus redelivers |

### Benefits

- **Automatic recovery:** Platform restarts hung processes
- **Load balancer integration:** Unhealthy replicas removed from traffic
- **Prevents cascading failures:** Slow-starting replicas don't receive traffic until ready
- **Scales correctly:** Readiness probe ensures new replicas are healthy before adding to pool

### References

- [Health probes in Azure Container Apps](https://learn.microsoft.com/en-us/azure/container-apps/health-probes)
- [Container Apps health check Terraform docs](https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs/resources/container_app)
- [Best practices for health probes](https://azureossd.github.io/2023/08/23/Container-Apps-Troubleshooting-and-configuration-with-Health-Probes/)

---

## Alert Reliability

### Solution: Multi-Channel Alerting + Confirmation + Fallback

**Confidence: MEDIUM** (Current Resend email setup is reliable but lacks confirmation/fallback)

### Current State

Alerts use Resend email API with:
- Rate limiting (600ms min interval)
- Exponential backoff retries (3 attempts)
- Serialized queue to prevent concurrent sends
- Silent failures (no confirmation of delivery)

### Gaps

1. **No delivery confirmation:** Email sent but no verification recipient received it
2. **Single channel:** Only email, no SMS/Slack/Teams fallback
3. **Silent failures:** If Resend API is down, alerts are lost (logged to console only)
4. **No alerting on alert failures:** Meta-problem - if alerting fails, nobody knows

### Implementation Pattern

#### 1. Multi-Channel Action Groups (Azure Monitor)

**Recommendation:** Use Azure Monitor Action Groups for critical alerts instead of/in addition to Resend.

```hcl
# infrastructure/terraform/modules/monitoring/main.tf
resource "azurerm_monitor_action_group" "critical" {
  name                = "${var.environment_name}-critical-alerts"
  resource_group_name = var.resource_group_name
  short_name          = "critical"

  # Primary email
  email_receiver {
    name                    = "primary"
    email_address           = var.alert_email_to
    use_common_alert_schema = true
  }

  # Secondary email (optional)
  email_receiver {
    name                    = "secondary"
    email_address           = var.alert_email_secondary
    use_common_alert_schema = true
  }

  # SMS (optional, requires phone number)
  sms_receiver {
    name         = "oncall"
    country_code = "1"
    phone_number = var.alert_phone_number
  }

  # Webhook for Slack/Teams (optional)
  webhook_receiver {
    name        = "slack"
    service_uri = var.slack_webhook_url
  }
}

resource "azurerm_monitor_action_group" "non_critical" {
  name                = "${var.environment_name}-alerts"
  resource_group_name = var.resource_group_name
  short_name          = "alerts"

  email_receiver {
    name                    = "primary"
    email_address           = var.alert_email_to
    use_common_alert_schema = true
  }
}
```

#### 2. Alert Rules for Key Metrics

```hcl
# Worker failures
resource "azurerm_monitor_metric_alert" "worker_failures" {
  name                = "${var.environment_name}-worker-failures"
  resource_group_name = var.resource_group_name
  scopes              = [var.database_id]  # Assuming failures logged to DB
  description         = "Alert on worker failures"
  severity            = 2  # Warning

  # Custom metric query for failed_workers > 0
  criteria {
    metric_namespace = "Microsoft.DBforPostgreSQL/flexibleServers"
    metric_name      = "active_connections"  # Placeholder, use custom metric
    aggregation      = "Maximum"
    operator         = "GreaterThan"
    threshold        = 0
  }

  action {
    action_group_id = azurerm_monitor_action_group.non_critical.id
  }
}

# Consolidation failures
resource "azurerm_monitor_metric_alert" "consolidation_failures" {
  name                = "${var.environment_name}-consolidation-failures"
  resource_group_name = var.resource_group_name
  scopes              = [azurerm_log_analytics_workspace.main.id]
  description         = "Alert on consolidation failures"
  severity            = 1  # Error

  # KQL query for consolidation errors
  criteria {
    query = <<-QUERY
      ContainerAppConsoleLogs_CL
      | where ContainerAppName_s == "consolidator"
      | where Log_s contains "Consolidation failed"
      | summarize count() by bin(TimeGenerated, 5m)
      | where count_ > 0
    QUERY

    time_aggregation = "Total"
    operator         = "GreaterThan"
    threshold        = 0
  }

  action {
    action_group_id = azurerm_monitor_action_group.critical.id
  }
}
```

#### 3. Hybrid Approach: Azure Monitor + Resend

**Critical alerts:** Use Azure Monitor Action Groups (email + SMS + webhook)
**Non-critical alerts:** Use existing Resend email (in-app alerts like "repricing job completed")

**Rationale:**
- Azure Monitor guarantees delivery and retries
- Resend is cheaper for high-frequency non-critical alerts
- Azure Monitor integrates with Application Insights metrics

#### 4. Alert Delivery Monitoring

Track alert delivery success in Application Insights:

```typescript
// apps/worker/src/alerts.ts
import { trace } from '@opentelemetry/api';

export async function sendAlert(subject: string, body: string): Promise<void> {
  const span = trace.getTracer('worker').startSpan('send_alert');

  try {
    await sendQueue;  // Existing Resend logic
    span.setStatus({ code: SpanStatusCode.OK });
    span.setAttribute('alert.delivered', true);
  } catch (error) {
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR });
    span.setAttribute('alert.delivered', false);

    // Fallback: Log to Application Insights directly
    console.error('[ALERT_FAILED]', { subject, error: error.message });

    throw error;
  } finally {
    span.end();
  }
}
```

Query alert failures:
```kql
traces
| where message contains "ALERT_FAILED"
| summarize count() by bin(timestamp, 1h)
| render timechart
```

### Alert Testing

```typescript
// Test alert delivery on startup (optional)
async function testAlertDelivery(): Promise<void> {
  try {
    await sendAlert('Test Alert', 'Alert system is operational');
    logger.info('Alert delivery test succeeded');
  } catch (error) {
    logger.error('Alert delivery test failed', error);
    // Emit metric to Application Insights for monitoring
  }
}
```

### Benefits

- **Guaranteed delivery:** Azure Monitor has SLA and retries
- **Multi-channel:** Email + SMS + webhook for critical alerts
- **Confirmation:** Azure Monitor tracks delivery status
- **Fallback:** If Resend fails, logs to Application Insights
- **Cost-effective:** Use Azure Monitor only for critical alerts

### References

- [Best practices for Azure Monitor alerts](https://learn.microsoft.com/en-us/azure/azure-monitor/alerts/best-practices-alerts)
- [Azure Monitor action groups](https://learn.microsoft.com/en-us/azure/azure-monitor/alerts/alerts-overview)
- [Alert processing rules](https://learn.microsoft.com/en-us/azure/azure-monitor/alerts/alerts-plan)

---

## Error Logging Consistency

### Solution: Structured Logging + Application Insights Integration

**Confidence: HIGH** (Current pino setup is strong, needs Application Insights integration)

### Current State

**Strengths:**
- Structured JSON logging with pino (high performance)
- Context propagation (runId, traceId, partitionId, workerId)
- Error truncation to avoid Azure log size limits (32KB)
- Child loggers with merged context
- Safe error persistence to database with fallback to stdout

**Gaps:**
- Not integrated with Application Insights (logs only in Log Analytics)
- No automatic correlation with traces (will be fixed by OpenTelemetry integration)
- Stack traces truncated to 6 frames (may lose deep call stack context)

### Implementation Pattern

#### 1. OpenTelemetry Pino Integration (Already Covered in Tracing Section)

```typescript
// packages/shared/src/telemetry.ts (extend)
import { PinoInstrumentation } from '@opentelemetry/instrumentation-pino';

export function initializeTelemetry(serviceName: string): void {
  useAzureMonitor({ /* ... */ });

  // Auto-inject trace_id and span_id into pino logs
  new PinoInstrumentation({
    logHook: (span, record) => {
      record['trace_id'] = span.spanContext().traceId;
      record['span_id'] = span.spanContext().spanId;
      record['trace_flags'] = span.spanContext().traceFlags;
    },
  }).enable();
}
```

Now every log has `trace_id` and `span_id`, correlating with traces.

#### 2. Standardized Error Logging Pattern

**Current pattern is good, document it:**

```typescript
// Standard error logging across all services
try {
  await riskyOperation();
} catch (error) {
  // 1. Log with context
  logger.error('Operation failed', error, {
    operationName: 'riskyOperation',
    inputParams: { /* ... */ },
  });

  // 2. Persist to error_logs table (with fallback)
  safeLogError(insertErrorLog, 'worker', error, {
    runId: workItem.runId,
    partitionId: workItem.partitionId,
  }, logger);

  // 3. Propagate error (let caller decide recovery)
  throw error;
}
```

#### 3. Increase Stack Trace Depth (Configurable)

```typescript
// packages/shared/src/utils/logger.ts
const STACK_TRACE_DEPTH = parseInt(process.env.STACK_TRACE_DEPTH || '10', 10);

private formatError(error?: Error | unknown): Record<string, unknown> {
  if (!error) return {};
  if (error instanceof Error) {
    const stackLines = error.stack?.split('\n') ?? [];
    const truncatedStack = stackLines.slice(0, STACK_TRACE_DEPTH).join('\n');

    return {
      err: {
        type: error.name,
        message: error.message,
        stack: truncatedStack,
      },
    };
  }
  return { err: String(error) };
}
```

Add to Terraform:
```hcl
env {
  name  = "STACK_TRACE_DEPTH"
  value = "10"  # Increase from 6 to 10
}
```

#### 4. Log Levels by Environment

```typescript
// packages/shared/src/utils/logger.ts
function getLogLevel(configLevel?: string): string {
  if (configLevel) return configLevel;
  if (process.env.LOG_LEVEL) return process.env.LOG_LEVEL;

  // Default: info in production, debug in dev
  const env = process.env.NODE_ENV;
  return env === 'production' ? 'info' : 'debug';
}
```

Terraform:
```hcl
env {
  name  = "LOG_LEVEL"
  value = var.environment == "prod" ? "info" : "debug"
}
```

#### 5. Application Insights Custom Metrics

Track error rates as custom metrics:

```typescript
// packages/shared/src/telemetry.ts
import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('diamond');
const errorCounter = meter.createCounter('errors', {
  description: 'Total errors by service and type',
});

export function recordError(serviceName: string, errorType: string): void {
  errorCounter.add(1, {
    service: serviceName,
    error_type: errorType,
  });
}

// In catch blocks:
recordError('worker', error.name);
```

Query in Application Insights:
```kql
customMetrics
| where name == "errors"
| summarize count() by tostring(customDimensions.service), tostring(customDimensions.error_type)
| render columnchart
```

### Logging Best Practices Summary

1. **Always use structured logging** (JSON format, pino already does this)
2. **Include correlation IDs** (traceId, runId, partitionId - already done)
3. **Use appropriate log levels:**
   - DEBUG: Verbose internal state (disabled in prod)
   - INFO: Normal operations (run started, batch processed)
   - WARN: Recoverable issues (retry, offset mismatch)
   - ERROR: Unrecoverable errors (requires investigation)
   - FATAL: Service cannot continue (process exits)
4. **Never log sensitive data** (passwords, tokens, PII)
5. **Redact payloads in production:**
   ```typescript
   logger.info('Received message', {
     messageId: message.messageId,
     // Don't log full body in prod
     bodyPreview: JSON.stringify(message.body).slice(0, 100),
   });
   ```
6. **Use child loggers for context:**
   ```typescript
   const log = logger.withContext({ runId, partitionId });
   log.info('Processing partition');  // Auto includes runId, partitionId
   ```

### Benefits

- **Correlated logs and traces:** trace_id links logs to distributed traces
- **Structured query:** JSON logs queryable via KQL
- **Context-rich:** Every log has runId, traceId, service, etc.
- **High performance:** Pino is 5x faster than Winston
- **Azure-optimized:** Truncation prevents log size limit issues

### References

- [Pino Logger production-grade guide](https://signoz.io/guides/pino-logger/)
- [Node.js structured logging with Pino + OpenTelemetry](https://medium.com/@hadiyolworld007/node-js-structured-logging-with-pino-opentelemetry-correlated-traces-logs-and-metrics-in-one-2c28b10c4fa0)
- [Pino best practices](https://betterstack.com/community/guides/logging/how-to-install-setup-and-use-pino-to-log-node-js-applications/)

---

## Recommendations

### Phase 1: Foundation (High Priority)

**Goal:** Enable distributed tracing and health checks

1. **Distributed Tracing** (Confidence: HIGH)
   - Install OpenTelemetry packages (`@azure/monitor-opentelemetry`)
   - Initialize telemetry in all services
   - Implement Service Bus context propagation (inject/extract)
   - Enable Pino instrumentation for trace_id injection
   - Deploy Application Insights connection string via Terraform
   - **Effort:** 2-3 days
   - **Impact:** Immediate visibility into end-to-end request flow

2. **Health Checks** (Confidence: HIGH)
   - Add `/health/liveness` and `/health/readiness` endpoints to API
   - Add health HTTP server to worker/consolidator (port 8080)
   - Configure liveness/readiness/startup probes in Terraform for all Container Apps
   - Test probe behavior (manual restart, DB disconnect)
   - **Effort:** 1 day
   - **Impact:** Automatic recovery from hung processes, proper load balancing

### Phase 2: Reliability (Medium Priority)

**Goal:** Monitor failures and enable recovery

3. **DLQ Monitoring** (Confidence: HIGH)
   - Create Azure Monitor metric alerts for DLQ message count
   - Implement DLQ processor (log to database for manual inspection)
   - Build resubmit workflow (API endpoint + UI in dashboard)
   - **Effort:** 2 days
   - **Impact:** No silent message loss, manual recovery from transient failures

4. **Alert Reliability** (Confidence: MEDIUM)
   - Create Azure Monitor Action Groups for critical alerts
   - Migrate critical alerts (consolidation failure, DLQ accumulation) to Action Groups
   - Keep Resend for non-critical alerts (repricing jobs, etc.)
   - Add alert delivery monitoring (track failures in Application Insights)
   - **Effort:** 1 day
   - **Impact:** Guaranteed alert delivery for critical issues

### Phase 3: Optimization (Low Priority)

**Goal:** Improve observability experience

5. **Dashboards** (Confidence: HIGH)
   - Create Application Insights workbook for pipeline health:
     - End-to-end trace visualization (scheduler → worker → consolidator)
     - Worker performance (partition processing time, Nivoda API latency)
     - Error rate by service/type
     - DLQ message count by queue
   - **Effort:** 1 day
   - **Impact:** Single pane of glass for operations

6. **Error Logging Enhancements** (Confidence: HIGH)
   - Increase stack trace depth to 10 frames (env var)
   - Add custom metrics for error rates
   - Implement log sampling for high-frequency debug logs (if needed)
   - **Effort:** 0.5 day
   - **Impact:** Better debugging context

### Phase 4: Advanced (Optional)

7. **Distributed Tracing for Database Queries** (Confidence: MEDIUM)
   - Enable `@opentelemetry/instrumentation-pg` for automatic PostgreSQL span creation
   - Track slow queries in Application Insights
   - **Effort:** 0.5 day
   - **Impact:** Visibility into DB performance bottlenecks

8. **Synthetic Monitoring** (Confidence: MEDIUM)
   - Create Azure Monitor availability tests for API endpoints
   - Alerts if API is unreachable from multiple regions
   - **Effort:** 0.5 day
   - **Impact:** Proactive detection of outages

### Implementation Order

**Week 1:**
1. Distributed Tracing (Phase 1)
2. Health Checks (Phase 1)

**Week 2:**
3. DLQ Monitoring (Phase 2)
4. Alert Reliability (Phase 2)

**Week 3 (if time):**
5. Dashboards (Phase 3)
6. Error Logging Enhancements (Phase 3)

### Cost Considerations

- **Application Insights:** ~$2-5/GB ingestion (5GB free tier)
- **Azure Monitor Alerts:** First 1,000 metric evaluations free, $0.10/1,000 after
- **Log Analytics:** First 5GB free, $2.30/GB after
- **Estimated monthly cost:** $20-50 for small workload

### Success Metrics

- **Tracing:** 100% of runs have linked traces in Application Insights
- **Health Checks:** Container restart time < 30 seconds (liveness probe)
- **DLQ:** Alert fires within 5 minutes of DLQ accumulation
- **Alerts:** Critical alerts delivered within 1 minute
- **Errors:** All errors have trace_id for correlation

---

## Confidence Assessment

| Area | Confidence | Rationale |
|------|-----------|-----------|
| Distributed Tracing | HIGH | OpenTelemetry + Application Insights is Azure's standard, well-documented |
| DLQ Patterns | HIGH | Service Bus DLQ is native, monitoring/retry patterns are standard |
| Health Checks | HIGH | Container Apps health probes are Kubernetes-based, mature |
| Alert Reliability | MEDIUM | Azure Monitor is reliable, but multi-channel setup requires testing |
| Error Logging | HIGH | Current pino setup is strong, OpenTelemetry integration is standard |

---

## Gaps and Open Questions

1. **SBMP Protocol Retirement (Sept 30, 2026):**
   - Current Service Bus SDK version unknown
   - **Action:** Verify `@azure/service-bus` version >= 7.x (uses AMQP)
   - **Risk:** If using legacy SDK, migration required before deadline

2. **Alert Delivery Testing:**
   - Azure Monitor Action Groups not tested in this environment
   - **Action:** Create test action group and trigger manual alert
   - **Risk:** Email/SMS/webhook may not be configured correctly

3. **Application Insights Cost:**
   - Unknown current log volume
   - **Action:** Enable sampling if ingestion exceeds 5GB/month
   - **Risk:** High cardinality custom dimensions (e.g., diamondId) may inflate costs

4. **Startup Probe Timing:**
   - Worker/consolidator startup time unknown
   - **Action:** Test in staging, adjust `failure_threshold` if needed
   - **Risk:** Aggressive probe may restart slow-starting containers prematurely

5. **DLQ Resubmit Logic:**
   - Manual inspection workflow not defined
   - **Action:** Design UI in dashboard for DLQ management
   - **Risk:** DLQ messages may accumulate if manual process is slow

---

## References

### Distributed Tracing
- [End-to-end tracing with Azure Service Bus](https://learn.microsoft.com/en-us/azure/service-bus-messaging/service-bus-end-to-end-tracing)
- [OpenTelemetry on Azure](https://learn.microsoft.com/en-us/azure/azure-monitor/app/opentelemetry)
- [Collect OpenTelemetry data in Container Apps](https://learn.microsoft.com/en-us/azure/container-apps/opentelemetry-agents)
- [OpenTelemetry context propagation](https://opentelemetry.io/docs/languages/js/propagation/)
- [Propagate context via Service Bus (.NET, applies to TypeScript)](https://www.twilio.com/en-us/blog/developers/community/propagate-opentelemetry-context-via-azure-service-bus-for-async-dotnet-services)

### Dead-Letter Queues
- [Service Bus dead-letter queues](https://learn.microsoft.com/en-us/azure/service-bus-messaging/service-bus-dead-letter-queues)
- [Enable dead lettering](https://learn.microsoft.com/en-us/azure/service-bus-messaging/enable-dead-letter)
- [DLQ monitoring and automation](https://turbo360.com/blog/azure-service-bus-dead-letter-queue-monitoring)
- [Retry patterns with Service Bus](https://www.infosupport.com/en/implementing-a-retry-pattern-for-azure-service-bus-with-topic-filters/)

### Health Checks
- [Health probes in Container Apps](https://learn.microsoft.com/en-us/azure/container-apps/health-probes)
- [Troubleshooting health probes](https://learn.microsoft.com/en-us/azure/container-apps/troubleshoot-health-probe-failures)
- [Health probe best practices](https://azureossd.github.io/2023/08/23/Container-Apps-Troubleshooting-and-configuration-with-Health-Probes/)

### Alerting
- [Best practices for Azure Monitor alerts](https://learn.microsoft.com/en-us/azure/azure-monitor/alerts/best-practices-alerts)
- [Azure Monitor overview](https://learn.microsoft.com/en-us/azure/azure-monitor/alerts/alerts-overview)
- [Architecture strategies for monitoring and alerting](https://learn.microsoft.com/en-us/azure/well-architected/reliability/monitoring-alerting-strategy)

### Logging
- [Pino Logger complete guide](https://signoz.io/guides/pino-logger/)
- [Production-grade logging with Pino](https://www.dash0.com/guides/logging-in-node-js-with-pino)
- [Pino + OpenTelemetry structured logging](https://medium.com/@hadiyolworld007/node-js-structured-logging-with-pino-opentelemetry-correlated-traces-logs-and-metrics-in-one-2c28b10c4fa0)
- [Node.js logging best practices](https://betterstack.com/community/guides/logging/how-to-install-setup-and-use-pino-to-log-node-js-applications/)

### Application Insights
- [Application Insights FAQ](https://learn.microsoft.com/en-us/azure/azure-monitor/app/application-insights-faq)
- [KQL queries for Application Insights](https://www.cloudthat.com/resources/blog/using-kql-in-azure-for-application-monitoring-and-insights)
- [Distributed tracing with Application Insights](https://www.cicoria.com/leveraging-azure-application-insights-with-opentelemetry-distributed-tracing-done-right/)
