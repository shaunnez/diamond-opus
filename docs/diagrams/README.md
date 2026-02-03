# Diamond Opus Architecture Diagrams

This directory contains comprehensive architecture diagrams for the Diamond Opus system.

## Available Diagrams

### 1. [Data Flow Diagram (End-to-End)](./01-data-flow.md)
Shows how data flows through the entire system from raw ingestion to API serving.

**Key Topics:**
- Two-stage pipeline (Ingestion → Consolidation)
- Data transformations at each stage
- Database tables and their relationships
- Performance metrics and batch sizes

**Best for:** Understanding the overall data pipeline and transformations

---

### 2. [Sequence Diagram (Pipeline Execution)](./02-sequence-diagram.md)
Timeline view of component interactions during a full pipeline run.

**Key Topics:**
- Message passing between services
- Scheduler → Workers → Consolidator flow
- Continuation pattern for workers
- Timing breakdown for 500K records

**Best for:** Understanding timing, async operations, and message flows

---

### 5. [Heatmap Algorithm (Visual)](./05-heatmap-algorithm.md)
Illustrates how the scheduler partitions work using adaptive density scanning.

**Key Topics:**
- Dense vs sparse zone handling
- Adaptive stepping strategy
- Fair partitioning algorithm
- Performance optimization techniques

**Best for:** Understanding workload distribution and scheduler optimization

---

### 6. [Error Handling & Recovery](./06-error-handling-recovery.md)
Failure scenarios and recovery mechanisms throughout the pipeline.

**Key Topics:**
- Scheduler, Worker, and Consolidator failures
- Service Bus retry logic
- Idempotency safeguards
- Manual recovery procedures

**Best for:** Troubleshooting, operations, and reliability engineering

---

### 8. [Azure Infrastructure (Deployment)](./08-azure-infrastructure.md)
Complete Azure infrastructure and deployment architecture.

**Key Topics:**
- Container Apps configuration
- Service Bus queues
- Auto-scaling with KEDA
- Cost breakdown and optimization
- CI/CD deployment process

**Best for:** DevOps, infrastructure planning, and cost optimization

---

### 10. [State Machine (Run Lifecycle)](./10-state-machine-run-lifecycle.md)
Complete state machine for pipeline runs from creation to completion.

**Key Topics:**
- Run metadata state transitions
- Worker and partition lifecycle
- Watermark state machine
- Database queries for monitoring

**Best for:** Understanding run states, monitoring, and debugging

---

## How to Use These Diagrams

### For New Team Members
Start with:
1. **Data Flow Diagram** - Get the big picture
2. **Sequence Diagram** - Understand the flow
3. **State Machine** - Learn the lifecycle

### For Debugging Issues
Refer to:
1. **Error Handling & Recovery** - Identify failure scenarios
2. **State Machine** - Check run states
3. **Sequence Diagram** - Trace message flows

### For Infrastructure Work
Review:
1. **Azure Infrastructure** - Understand deployment
2. **Error Handling & Recovery** - Plan monitoring
3. **Data Flow** - Understand resource usage

### For Performance Optimization
Study:
1. **Heatmap Algorithm** - Optimize partitioning
2. **Data Flow** - Identify bottlenecks
3. **Azure Infrastructure** - Tune scaling

---

## Diagram Format

All diagrams are written in Markdown with Mermaid diagrams for easy rendering in:
- GitHub
- GitLab
- VSCode (with Mermaid extension)
- Documentation sites (Docusaurus, MkDocs, etc.)

---

## Quick Reference

### System Components

| Component | Purpose | Scaling |
|-----------|---------|---------|
| Scheduler | Partition workload, create runs | On-demand (cron) |
| Workers | Fetch raw data from Nivoda | 0-30 replicas (KEDA) |
| Consolidator | Transform & apply pricing | 1-3 replicas (KEDA) |
| API | Serve diamond data | 1-3 replicas |
| Dashboard | Web UI for monitoring | 1-2 replicas |

### Key Databases

| Table | Purpose | Size |
|-------|---------|------|
| `diamonds` | Canonical diamond data | ~500K rows |
| `raw_diamonds_nivoda` | Raw JSON from Nivoda | ~500K rows (per run) |
| `pricing_rules` | Pricing rule definitions | ~20 rows |
| `run_metadata` | Pipeline run tracking | Growing |
| `worker_runs` | Worker status tracking | Growing |

### Key Queues

| Queue | Purpose | Volume |
|-------|---------|--------|
| `work-items` | Worker task distribution | 30-300 messages/run |
| `work-done` | Worker completion tracking | 30 messages/run |
| `consolidate` | Consolidation trigger | 1 message/run |

---

## Contributing

When adding new diagrams:
1. Use Mermaid syntax for consistency
2. Include detailed notes and tables
3. Add code examples where relevant
4. Update this README with links
5. Follow numbering convention (01-, 02-, etc.)

---

## Related Documentation

- [CLAUDE.md](../../CLAUDE.md) - Main project documentation
- [Architecture Overview](../../CLAUDE.md#architecture-overview) - High-level system design
- [Common Tasks](../../CLAUDE.md#common-tasks) - Development guide
