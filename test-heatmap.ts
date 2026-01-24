import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { DIAMOND_SHAPES } from "@diamond/shared";
import { NivodaAdapter, type NivodaQuery } from "@diamond/nivoda";
import { scanHeatmap } from "./apps/scheduler/src/heatmap.ts";

async function main() {
  // Parse command line args for two-pass mode
  const useTwoPass = process.argv.includes('--two-pass');

  console.log("Testing heatmap scan against Nivoda staging API...");
  console.log(`Mode: ${useTwoPass ? 'Two-pass (coarse + fine)' : 'Single-pass (adaptive)'}\n`);

  const adapter = new NivodaAdapter();

  const baseQuery: NivodaQuery = {
    shapes: [...DIAMOND_SHAPES],
    sizes: { from: 0.5, to: 10 },
  };

  const result = await scanHeatmap(adapter, baseQuery, {
    maxWorkers: 30,
    minRecordsPerWorker: 1000,
    useTwoPassScan: useTwoPass,
    coarseStep: 5000, // $5000 steps for coarse pass
  });

  console.log("\n=== HEATMAP SCAN RESULTS ===");
  console.log(`Total records: ${result.totalRecords}`);
  console.log(`Worker count: ${result.workerCount}`);
  console.log(`Density chunks: ${result.densityMap.length}`);

  console.log("\n=== SCAN STATISTICS ===");
  console.log(`API calls: ${result.stats.apiCalls}`);
  console.log(`Ranges scanned: ${result.stats.rangesScanned}`);
  console.log(`Non-empty ranges: ${result.stats.nonEmptyRanges}`);
  console.log(`Duration: ${result.stats.scanDurationMs}ms`);
  console.log(`Two-pass mode: ${result.stats.usedTwoPass}`);

  console.log("\n=== WORKER PARTITIONS ===");
  for (const partition of result.partitions) {
    console.log(
      `${partition.partitionId}: $${partition.minPrice.toFixed(2)} - $${partition.maxPrice.toFixed(2)} (${partition.totalRecords} records)`
    );
  }

  // Dry-run summary: what would be enqueued
  console.log("\n=== DRY-RUN SUMMARY ===");
  console.log(`Would create ${result.workerCount} work items`);
  console.log(`Total records to process: ${result.totalRecords}`);
  const avgPerWorker = result.workerCount > 0 ? Math.round(result.totalRecords / result.workerCount) : 0;
  console.log(`Average records per worker: ${avgPerWorker}`);
}

main().catch(console.error);
