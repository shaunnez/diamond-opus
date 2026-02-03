# Data Flow Diagram (End-to-End)

This diagram shows how data flows through the entire system from ingestion to API serving.

```mermaid
flowchart TB
    subgraph External["External Systems"]
        Nivoda[("Nivoda API<br/>(GraphQL)")]
        Client["API Client<br/>(HMAC/API Key)"]
    end

    subgraph Stage1["Stage 1: Raw Ingestion Pipeline"]
        Scheduler["Scheduler<br/>(Cron Job)"]
        WatermarkBlob[("Azure Blob<br/>watermark.json")]

        Scheduler -->|1. Read watermark| WatermarkBlob
        Scheduler -->|2. Heatmap scan<br/>count queries| Nivoda
        Scheduler -->|3. Partition workload| WorkQueue

        WorkQueue[("Service Bus<br/>work-items queue")]
        Workers["Workers (N replicas)<br/>(Auto-scale)"]

        WorkQueue -->|4. Consume messages| Workers
        Workers -->|5. Fetch diamonds<br/>paginated| Nivoda
        Workers -->|6. Write raw JSON| RawTable
        Workers -->|7. Send completion| DoneQueue

        DoneQueue[("Service Bus<br/>work-done queue")]
        RawTable[("Database<br/>raw_diamonds_nivoda")]

        DoneQueue -.->|Monitor| RunMeta[("Database<br/>run_metadata")]
    end

    subgraph Stage2["Stage 2: Consolidation Pipeline"]
        ConsolidateQueue[("Service Bus<br/>consolidate queue")]
        Consolidator["Consolidator (N replicas)<br/>(Multi-replica safe)"]

        Workers -->|8. Last worker triggers| ConsolidateQueue
        ConsolidateQueue -->|9. Consume| Consolidator

        Consolidator -->|10. Fetch batches<br/>SKIP LOCKED| RawTable
        Consolidator -->|11. Map schema| Mapper["Nivoda Mapper<br/>(Transform)"]
        Mapper -->|12. Apply pricing| Engine["Pricing Engine<br/>(Rule Matching)"]
        Engine -->|13. Batch upsert<br/>UNNEST| DiamondsTable

        DiamondsTable[("Database<br/>diamonds (canonical)")]
        PricingRules[("Database<br/>pricing_rules")]

        PricingRules -.->|Load rules| Engine

        Consolidator -->|14. Mark consolidated| RawTable
        Consolidator -->|15. Update run status| RunMeta
        Consolidator -->|16. Advance watermark<br/>ONLY on success| WatermarkBlob
    end

    subgraph Serving["API Serving Layer"]
        API["REST API<br/>(Express)"]
        AuthMW["Auth Middleware<br/>(API Key / HMAC)"]
        APIKeys[("Database<br/>api_keys")]

        Client -->|HTTP Request| AuthMW
        AuthMW -->|Validate| APIKeys
        AuthMW -->|Authorized| API
        API -->|Query| DiamondsTable
        API -->|Response| Client
    end

    style Stage1 fill:#e1f5ff
    style Stage2 fill:#fff4e1
    style Serving fill:#f0f0f0
    style External fill:#ffe1e1
```

## Data Transformations

### 1. Raw Ingestion (Workers)
- **Input**: Nivoda GraphQL response (JSON)
- **Output**: Raw JSON stored in `raw_diamonds_nivoda.payload`
- **Transformation**: None (raw storage)
- **Keys**:
  - `offer_id` = `items[].id` (for ordering)
  - `supplier_stone_id` = `items[].diamond.id` (for deduplication)

### 2. Schema Mapping (Consolidator → Mapper)
- **Input**: Raw Nivoda payload
- **Output**: Canonical diamond schema
- **Transformation**: Field mapping, unit conversion, normalization
- **Example**:
  ```typescript
  // Nivoda → Canonical
  payload.diamond.measurements.length → measurements.length (mm)
  payload.diamond.supplierName → supplier_name
  payload.price.total → feed_price (dollars, DECIMAL)
  ```

### 3. Pricing Application (Pricing Engine)
- **Input**: Base diamond with `feed_price`
- **Output**: Diamond with applied pricing rules
- **Transformation**: Rule matching by priority, markup calculation
- **Formula**: `price_model_price = feed_price * markup_multiplier`
- **Rules Match**: shape, color, clarity, carat range, cut (priority: lower = higher precedence)

### 4. Database Upsert (Consolidator)
- **Input**: Array of canonical diamonds (100/batch)
- **Output**: PostgreSQL UNNEST batch insert
- **Conflict Resolution**: `ON CONFLICT (supplier_stone_id) DO UPDATE`
- **Soft Delete**: Diamonds not in new run → `status = 'deleted'`, `deleted_at = NOW()`

## Data Volume & Performance

| Stage | Volume | Batch Size | Throughput |
|-------|--------|------------|------------|
| Heatmap Scan | 500K records | 3 concurrent queries | ~30-60 API calls |
| Worker Ingestion | 5K/worker | 30 items/page | ~5-10 min (30 workers) |
| Consolidation | 500K records | 2K fetch, 100 upsert | ~4-6 min (1 replica)<br/>~1-2 min (3 replicas) |

## Failure Handling

- **Worker Failure**: Skip consolidation, do NOT advance watermark
- **Consolidation Failure**: Send email alert, do NOT advance watermark
- **Watermark Rollback**: Not needed (only advanced on success)
- **Retry**: Failed runs can be manually force-consolidated with `force: true`
