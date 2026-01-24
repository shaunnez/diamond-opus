import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { DIAMOND_SHAPES } from "@diamond/shared";
import { NivodaAdapter, type NivodaQuery } from "@diamond/nivoda";
import { scanHeatmap } from "./apps/scheduler/src/heatmap.js";

async function main() {
  console.log("Testing heatmap scan against Nivoda staging API...\n");

  const adapter = new NivodaAdapter();

  const baseQuery: NivodaQuery = {
    shapes: [...DIAMOND_SHAPES],
    sizes: { from: 0.5, to: 10 },
  };

  const result = await scanHeatmap(adapter, baseQuery, {
    maxWorkers: 30,
    minRecordsPerWorker: 1000,
  });

  console.log("\n=== HEATMAP SCAN RESULTS ===");
  console.log(`Total records: ${result.totalRecords}`);
  console.log(`Worker count: ${result.workerCount}`);
  console.log(`Density chunks: ${result.densityMap.length}`);

  console.log("\n=== WORKER PARTITIONS ===");
  for (const partition of result.partitions) {
    console.log(
      `${partition.partitionId}: $${partition.minPrice} - $${partition.maxPrice} (${partition.totalRecords} records)`
    );
  }
}

main().catch(console.error);
