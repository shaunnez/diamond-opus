# **10. Technical Considerations**

**Data Flow**

```
┌─────────────┐     ┌─────────────┐      ┌─────────────┐
│  Scheduler  │───▶│ Service Bus  │────▶│   Workers   │
│  (2 AM UTC) │     │ work-items  │      │ (1-30 pods) │
└─────────────┘     └─────────────┘      └─────────────┘
       │                                       │
       │ reads watermark                       │ writes raw JSON
       ▼                                       ▼
┌─────────────┐                         ┌───────────────────┐
│Azure Storage│                         │raw_diamonds_nivoda│
│ (watermark) │                         └───────────────────┘
└─────────────┘                                │
                                               ▼ (if all workers succeed)
┌─────────────┐     ┌─────────────┐     ┌─────────────────┐
│  diamonds   │◀─── │ Consolidator│◀───│ Service Bus     │
│ (canonical) │     │  (pricing)  │     │ consolidate     │
└─────────────┘     └─────────────┘     └─────────────────┘
       │
       ▼
┌─────────────┐
│  REST API   │
│  (:3000)    │
└─────────────┘
```

### **Azure & Terraform Modules**

| **Module**             | **Resources Created**                                     |
| ---------------------- | --------------------------------------------------------- |
| **service-bus**        | Namespace + 3 queues (work-items, work-done, consolidate) |
| **storage**            | Storage account + watermarks container                    |
| **container-registry** | ACR with admin auth for image storage                     |
| **container-apps**     | Log Analytics + Container Apps Environment + 5 services   |

### **Resources Interconnections**

`Terraform Environment
    │
    ├─ service-bus module
    │   └─ Connection String → Container Apps (secrets)
    │
    ├─ storage module
    │   └─ Connection String → Scheduler/Consolidator
    │
    ├─ container-registry module
    │   └─ Login Server + Credentials → All Container Apps
    │
    └─ container-apps module
        ├─ API (Port 3000, HTTPS ingress, managed identity)
        ├─ Worker (Service Bus consumer, no ingress)
        ├─ Consolidator (Service Bus consumer, no ingress)
        └─ Scheduler (Container App Job, cron trigger)`

### **Environment Differences**

| **Aspect**          | **Staging**       | **Production** |
| ------------------- | ----------------- | -------------- |
| Service Bus SKU     | Basic/Standard    | Standard       |
| Storage Replication | LRS               | GRS/ZRS        |
| Min Replicas        | 0 (scale-to-zero) | 1 (always-on)  |
| Log Retention       | 7 days            | 30 days        |
| Blob Versioning     | Disabled          | Enabled        |
| ACR SKU             | Basic             | Standard       |

### **Architecture Decisions**

**Security**

- **Dual authentication**: API Key (SHA256 hashed) + HMAC signature
- **Secrets management**: Container App secrets (not in images)
- **TLS 1.2 minimum**: Storage account security
- **Non-root containers**: Alpine base images

**Reliability**

- **Idempotent operations**: Upserts on unique keys (safe re-processing)
- **Atomic counters**: Database-level completion tracking
- **Watermark gating**: Only advances on full success
- **Alert system**: Resend email on consolidation failure

**Scalability**

- **Horizontal scaling**: Workers scale 0-30 based on workload
- **Heatmap partitioning**: Optimal work distribution
- **Queue-based decoupling**: Service Bus for async processing
- **Auto-scaling**: Container Apps scale based on queue depth

**Cost Optimization**

- **Scale-to-zero** (staging): Services idle when not processing
- **Multi-stage builds**: Minimal image sizes
- **LRS storage** (staging): Lower replication costs
- **Shared infrastructure**: Single ACR for all images

### **7. Database Schema (9 Tables)**

| **Table**           | **Purpose**                      |
| ------------------- | -------------------------------- |
| api_keys            | API authentication               |
| raw_diamonds_nivoda | Staging table (JSON payloads)    |
| diamonds            | Canonical inventory (priced)     |
| pricing_rules       | Rule-based pricing config        |
| run_metadata        | Batch run tracking               |
| worker_runs         | Per-partition execution tracking |
| hold_history        | Diamond hold audit trail         |
| purchase_history    | Purchase audit trail             |
| schema_migrations   | Migration version tracking       |

### Technology Stack Summary

| **Layer**    | **Technology**             |
| ------------ | -------------------------- |
| **Language** | TypeScript (ES modules)    |
| **Runtime**  | Node.js 20                 |
| **Database** | PostgreSQL (Supabase)      |
| **Queue**    | Azure Service Bus          |
| **Storage**  | Azure Blob Storage         |
| **Compute**  | Azure Container Apps       |
| **Registry** | Azure Container Registry   |
| **IaC**      | Terraform 1.6              |
| **CI/CD**    | GitHub Actions             |
| **API**      | Express + Swagger          |
| **Logging**  | Pino + Azure Log Analytics |
| **Alerts**   | Resend (email)             |
|              |                            |
