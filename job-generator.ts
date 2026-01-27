const axios = require('axios');
const fs = require('fs');

// --- CONFIGURATION ---
const API_URL = 'https://intg-customer-staging.nivodaapi.net/api/diamonds'; // Adjust if different
const JWT_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJraWQiOiJmNTg3OTBkMTciLCJpZCI6ImM1YWRiZWM0LTRkZjQtNDhlMC1iY2RlLTMxZmYxYjgxOGE5MiIsInJvbGUiOiJDVVNUT01FUiIsInN1YnR5cGUiOm51bGwsImNvdW50cnkiOiJHQiIsInB0IjoiREVGQVVMVCIsImlmIjoiIiwiY2lkIjoiZTk3MDEyYzYtOGE3Ni00NzNmLTljZjctMzBlMGU2ZjI3MWRhIiwiZ2VvX2NvdW50cnkiOiJHQiIsImFwaSI6dHJ1ZSwiYXBpX2giOnRydWUsImFwaV9jIjp0cnVlLCJhcGlfbyI6dHJ1ZSwiYXBpX3IiOnRydWUsImlhdCI6MTc2OTExNjM3MiwiZXhwIjoxNzY5MjAyNzcyfQ.N-dzTbPf4wBmxuSJXf8_PHyXCBRzOTiyTVfy-Zd_Xi4';

const MIN_PRICE = 0;
const MAX_PRICE = 250000; // Buffered slightly above highest
const TARGET_WORKERS = 30;

// --- GRAPHQL QUERY ---
const COUNT_QUERY = `
  query GetCount($min: Int!, $max: Int!, $token: String!) {
    as(token: $token) {
      diamonds_by_query_count(
        query: { 
            dollar_value: { from: $min, to: $max }
            sizes: {from: 0.5, to: 10}, 
            shapes: ["ROUND", "OVAL", "EMERALD", "CUSHION", "CUSHION B", "CUSHION MODIFIED", "CUSHION BRILLIANT", "ASSCHER", "RADIANT", "MARQUISE", "PEAR", "PRINCESS", "ROSE", "OLD MINER", "TRILLIANT", "HEXAGONAL", "HEART"]
        }
      )
    }
  }
`;

// --- HELPER: API REQUEST WITH RETRY ---
async function getCount(min, max) {
  try {
    const response = await axios.post(
      API_URL,
      {
        query: COUNT_QUERY,
        variables: {min, max, token: JWT_TOKEN}
      },
      {
        headers: {'Content-Type': 'application/json'}
      }
    );

    if (response.data.errors) {
      const errorStr = JSON.stringify(response.data.errors);
      // Truncate error to 2KB to avoid exceeding Azure log size limits
      const truncated = errorStr.length > 2048 ? errorStr.slice(0, 2048) + '...[truncated]' : errorStr;
      console.error('GraphQL Error:', truncated);
      return 0;
    }

    return response.data.data.as.diamonds_by_query_count;
  } catch (error) {
    console.error(`Request failed for ${min}-${max}. Retrying...`, error.status, error.data);
    await new Promise(r => setTimeout(r, 1000)); // 1 sec wait
    return getCount(min, max); // Simple retry
  }
}

// --- MAIN LOGIC ---
async function generateJobs() {
  console.log('💎 Starting Heatmap Scan...');
  // PHASE 1: HEATMAP SCAN
  let densityMap = [];
  let currentPrice = MIN_PRICE;
  let step = 100; // Start with a safe, small step

  while (currentPrice < MAX_PRICE) {
    // --- 1. HARD LIMIT FOR DENSE ZONE ---
    // If we are under $20,000, NEVER step more than $100 at a time.
    // This guarantees we break that 274k pile into ~2,700 small chunks.
    if (currentPrice < 20000) {
      step = 100;
    }

    // Ensure we don't overshoot the absolute max
    let rangeMax = Math.min(currentPrice + step, MAX_PRICE);
    if (rangeMax <= currentPrice) {
      rangeMax = currentPrice + 1;
    }

    // --- 2. EXECUTE QUERY ---
    const count = await getCount(currentPrice, rangeMax);

    process.stdout.write(`\rScanning: $${currentPrice} - $${rangeMax} (Step: ${step}) | Found: ${count}      `);

    if (count > 0) {
      densityMap.push({min: currentPrice, max: rangeMax, count: count});
    }

    // --- 3. ADAPTIVE STEP (Only for prices > $20,000) ---
    if (currentPrice >= 20000) {
      if (count === 0) {
        step = Math.min(step * 5, 100000); // Zoom through empty space
      } else {
        const ratio = 500 / count; // Target 500 records per scan
        let newStep = Math.floor(step * ratio);
        step = Math.max(100, Math.min(newStep, 50000));
      }
    }

    currentPrice = rangeMax + 1;
  }

  console.log('\n\n✅ Scan Complete. Calculating Fair Split...');

  // PHASE 2: THE FAIR SPLIT (The Allocation)
  // Now we group those small chunks into 30 equal buckets.

  const totalRecords = densityMap.reduce((sum, item) => sum + item.count, 0);
  const targetPerWorker = Math.ceil(totalRecords / TARGET_WORKERS);

  console.log(`Total Records: ${totalRecords}`);
  console.log(`Target per Worker: ~${targetPerWorker}\n`);

  let jobs = [];
  let currentWorkerId = 1;
  let currentBatchSum = 0;
  let currentBatchStart = densityMap[0].min;

  for (let i = 0; i < densityMap.length; i++) {
    const chunk = densityMap[i];
    currentBatchSum += chunk.count;

    // If we hit the target OR this is the absolute last chunk
    if (currentBatchSum >= targetPerWorker || i === densityMap.length - 1) {
      jobs.push({
        workerId: currentWorkerId,
        minPrice: currentBatchStart,
        maxPrice: chunk.max,
        totalRecords: currentBatchSum
      });

      console.log(`Worker ${currentWorkerId}: $${currentBatchStart} - $${chunk.max} (${currentBatchSum} records)`);

      // Reset for next worker
      currentWorkerId++;
      currentBatchSum = 0;
      // The next worker starts at the NEXT chunk's min (if it exists)
      if (i + 1 < densityMap.length) {
        currentBatchStart = densityMap[i + 1].min;
      }
    }
  }

  // --- OUTPUT ---
  fs.writeFileSync('jobs.json', JSON.stringify(jobs, null, 2));
  console.log("\n🎉 Done! Configuration saved to 'jobs.json'");
}

generateJobs();
