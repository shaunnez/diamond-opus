# Architecture Diagrams

Visual Mermaid diagrams for the Diamond Opus system architecture, database design, and ingestion pipeline.

---

## 1. System Architecture

```mermaid
flowchart TD
    subgraph External["External Services"]
        NIVODA["Nivoda GraphQL API"]
        FRANK["Frankfurter API"]
        STRIPE["Stripe"]
        SLACK["Slack Webhooks"]
        RESEND["Resend Email"]
    end

    subgraph Pipeline["Ingestion Pipeline"]
        SCHED["Scheduler\n(CronJob)"]
        WORKER["Worker\n(0-10 replicas)"]
        CONSOL["Consolidator\n(1-3 replicas)"]
        IPROXY["Ingestion Proxy\n(apps/ingestion-proxy)"]
    end

    subgraph Messaging["Azure Service Bus"]
        Q_WORK["work-items queue"]
        Q_DONE["work-done queue"]
        Q_CONS["consolidate queue"]
    end

    subgraph Storage["Data Storage"]
        PG[("PostgreSQL\n(Supabase)")]
        BLOB["Azure Blob Storage\n(watermarks)"]
    end

    subgraph Packages["Shared Libraries"]
        FEED_REG["Feed Registry\n+ Heatmap"]
        NIVODA_PKG["Nivoda Adapter"]
        PRICING["Pricing Engine"]
        DB_PKG["Database Client"]
        SHARED["Shared Types\n& Utils"]
    end

    subgraph API_LAYER["API Layer"]
        API["Express API\n(:3000)"]
        CACHE["In-Memory\nLRU Cache"]
        RATE["Rate Limiter\n(Token Bucket)"]
    end

    subgraph Frontends["Web Frontends"]
        DASH["Dashboard\n(React + Vite)"]
        STORE["Storefront\n(React + Vite)"]
    end

    subgraph Infra["Infrastructure"]
        ACA["Azure Container Apps"]
        ACR["Container Registry"]
        GHA["GitHub Actions CI/CD"]
        TF["Terraform IaC"]
    end

    %% Pipeline flow
    SCHED -->|"heatmap counts (via proxy)"| IPROXY
    SCHED -->|"load/save watermark"| BLOB
    SCHED -->|"create run"| PG
    SCHED -->|"enqueue WorkItemMessages"| Q_WORK

    Q_WORK -->|"receive message"| WORKER
    WORKER -->|"fetch page (via proxy)"| IPROXY
    IPROXY -->|"rate-limited GraphQL"| NIVODA
    WORKER -->|"upsert raw payloads"| PG
    WORKER -->|"next page"| Q_WORK
    WORKER -->|"partition done"| Q_DONE
    WORKER -->|"all done → ConsolidateMessage"| Q_CONS

    Q_CONS -->|"receive message"| CONSOL
    CONSOL -->|"claim raw → upsert diamonds"| PG
    CONSOL -->|"advance watermark"| BLOB
    CONSOL -->|"failure alerts"| RESEND
    CONSOL -->|"pipeline status"| SLACK

    %% API layer
    API --> CACHE
    API --> RATE
    API -->|"query diamonds"| PG
    API -->|"exchange rates"| FRANK
    API -->|"payment"| STRIPE

    %% Frontends
    DASH -->|"REST"| API
    STORE -->|"REST"| API

    %% Package dependencies (lightweight)
    SCHED -.-> FEED_REG
    WORKER -.-> NIVODA_PKG
    CONSOL -.-> PRICING
    API -.-> DB_PKG
    FEED_REG -.-> SHARED

    %% Infrastructure
    TF -.->|"provisions"| ACA
    GHA -.->|"builds images"| ACR
    ACR -.->|"deploys to"| ACA
```

---

## 2. Database Schema

```mermaid
erDiagram
    diamonds {
        uuid id PK
        text feed
        text supplier_stone_id UK
        text offer_id
        text shape
        numeric carats
        text color
        text clarity
        text status
        text availability
        numeric feed_price
        numeric price_model_price
        numeric price_per_carat
        numeric markup_ratio
        integer rating
        integer pricing_rating
        boolean lab_grown
        timestamptz created_at
        timestamptz updated_at
    }

    raw_diamonds_nivoda {
        uuid id PK
        uuid run_id FK
        text supplier_stone_id UK
        text offer_id
        jsonb payload
        text payload_hash
        boolean consolidated
        text consolidation_status
        timestamptz claimed_at
        text claimed_by
    }

    raw_diamonds_demo {
        uuid id PK
        uuid run_id FK
        text supplier_stone_id UK
        text offer_id
        jsonb payload
        text payload_hash
        boolean consolidated
        text consolidation_status
        timestamptz claimed_at
        text claimed_by
    }

    run_metadata {
        uuid run_id PK
        text feed
        text run_type
        integer expected_workers
        integer completed_workers
        integer failed_workers
        integer consolidation_processed
        integer consolidation_errors
        timestamptz started_at
        timestamptz completed_at
    }

    partition_progress {
        uuid run_id PK_FK
        text partition_id PK
        integer next_offset
        boolean completed
        boolean failed
        timestamptz updated_at
    }

    worker_runs {
        uuid id PK
        uuid run_id FK
        text partition_id UK
        uuid worker_id
        text status
        integer records_processed
        text error_message
    }

    pricing_rules {
        uuid id PK
        integer priority
        text stone_type
        numeric price_min
        numeric price_max
        text feed
        numeric margin_modifier
        integer rating
        boolean active
    }

    pricing_reapply_jobs {
        uuid id PK
        text status
        integer total_diamonds
        integer processed_diamonds
        integer failed_diamonds
        text trigger_type
        uuid triggered_by_rule_id FK
        timestamptz started_at
        timestamptz completed_at
    }

    pricing_reapply_snapshots {
        uuid job_id PK_FK
        uuid diamond_id PK
        numeric old_price_model_price
        numeric new_price_model_price
    }

    rating_rules {
        uuid id PK
        integer priority
        boolean active
        integer rating
        text feed
        numeric price_min
        numeric price_max
    }

    rating_reapply_jobs {
        uuid id PK
        text status
        integer total_diamonds
        integer processed_diamonds
        integer updated_diamonds
        uuid triggered_by_rule_id FK
        text trigger_type
    }

    rating_reapply_snapshots {
        uuid job_id PK_FK
        uuid diamond_id PK
        integer old_rating
        integer new_rating
    }

    purchase_history {
        uuid id PK
        uuid diamond_id FK
        text feed
        text offer_id
        text idempotency_key UK
        text status
        text order_number
        text payment_status
        text stripe_checkout_session_id
        integer amount_cents
    }

    hold_history {
        uuid id PK
        uuid diamond_id FK
        text feed
        text offer_id
        text status
        boolean denied
        timestamptz hold_until
    }

    api_keys {
        uuid id PK
        text key_hash UK
        text client_name
        boolean active
        timestamptz last_used_at
    }

    dataset_versions {
        text feed PK
        bigint version
        timestamptz updated_at
    }

    demo_feed_inventory {
        uuid id PK
        text stone_id UK
        numeric weight_ct
        text stone_shape
        numeric asking_price_usd
        text availability_status
    }

    exchange_rates {
        uuid id PK
        text base_currency UK
        text target_currency UK
        numeric rate
        date rate_date
    }

    error_logs {
        bigint id PK
        varchar service
        text error_message UK
        jsonb context
        timestamptz created_at
    }

    rate_limit {
        text key PK
        timestamptz window_start
        integer request_count
    }

    %% Pipeline relationships
    run_metadata ||--o{ raw_diamonds_nivoda : "run_id"
    run_metadata ||--o{ raw_diamonds_demo : "run_id"
    run_metadata ||--o{ partition_progress : "run_id"
    run_metadata ||--o{ worker_runs : "run_id"

    %% Transaction relationships
    diamonds ||--o{ purchase_history : "diamond_id"
    diamonds ||--o{ hold_history : "diamond_id"

    %% Pricing reapply relationships
    pricing_rules ||--o{ pricing_reapply_jobs : "triggered_by_rule_id"
    pricing_reapply_jobs ||--o{ pricing_reapply_snapshots : "job_id"

    %% Rating reapply relationships
    rating_rules ||--o{ rating_reapply_jobs : "triggered_by_rule_id"
    rating_reapply_jobs ||--o{ rating_reapply_snapshots : "job_id"
```

---

## 3. Ingestion Pipeline

```mermaid
sequenceDiagram
    participant Blob as Azure Blob
    participant Sched as Scheduler
    participant Nivoda as Nivoda API
    participant PG as PostgreSQL
    participant SB as Service Bus
    participant Worker as Worker
    participant Consol as Consolidator

    rect rgb(240, 248, 255)
    note right of Sched: Stage 1 — Partitioning
    Sched->>Blob: Load watermark
    Blob-->>Sched: lastUpdatedAt, lastRunId

    Sched->>Nivoda: getCount() per price range (heatmap)
    Nivoda-->>Sched: Record counts

    Sched->>Sched: Build balanced partitions (1-10)

    Sched->>PG: INSERT run_metadata + partition_progress
    Sched->>SB: Enqueue N WorkItemMessages (work-items)
    end

    rect rgb(245, 255, 245)
    note right of Worker: Stage 2 — Ingestion (per partition)
    SB->>Worker: Receive WorkItemMessage

    loop One page per message
        Worker->>PG: Check partition_progress (idempotency)
        Worker->>Nivoda: search(offset, limit=40)
        Nivoda-->>Worker: Page of diamonds
        Worker->>PG: Upsert raw payloads
        Worker->>PG: Update partition_progress.next_offset

        alt More pages remain
            Worker->>SB: Enqueue next WorkItemMessage
        else Last page
            Worker->>PG: Mark partition completed
        end
    end

    Worker->>PG: Atomic check — all partitions done?

    alt All partitions completed
        Worker->>SB: Enqueue ConsolidateMessage
    else Partial success >= 70%
        Worker->>SB: Enqueue ConsolidateMessage (after 5 min delay)
    end
    end

    rect rgb(255, 248, 240)
    note right of Consol: Stage 3 — Consolidation
    SB->>Consol: Receive ConsolidateMessage

    loop Batch of 2000 raw diamonds
        Consol->>PG: SELECT ... FOR UPDATE SKIP LOCKED (claim)
        Consol->>Consol: mapRawToDiamond() + applyPricing()
        Consol->>PG: UNNEST batch upsert → diamonds (100/batch)
        Consol->>PG: Mark raw rows consolidated
    end

    Consol->>PG: INCREMENT dataset_versions
    Consol->>Blob: Advance watermark
    Consol->>PG: Update run_metadata.completed_at
    end
```

---

## Notes

- **System Architecture**: Dashed lines (-.->)  show package dependencies; solid lines show runtime data flow.
- **Ingestion Proxy**: `apps/ingestion-proxy` is a standalone Express service (separate from the main API) that rate-limits and proxies Nivoda GraphQL calls. Workers and the scheduler route through it via `NIVODA_PROXY_BASE_URL`.
- **Database Schema**: Only key columns are shown per table. See `sql/full_schema.sql` and `sql/migrations/` for complete definitions. Tables added via migrations (e.g. `dataset_versions`, `rating_rules`, `pricing_reapply_jobs`) are included.
- **Pipeline Sequence**: Shows the happy path. On failure, watermark is not advanced and alerts are sent via Resend/Slack.
