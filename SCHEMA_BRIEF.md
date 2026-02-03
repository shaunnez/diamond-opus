# Diamond Inventory System - Database Overview

This document explains how your diamond inventory system organizes and manages data. Think of the database as a filing cabinet with different drawers, where each "table" is a drawer that stores specific types of information.

---

## Core Inventory Tables

### **diamonds** - Your Product Catalog
**What it stores:** This is your main inventory - the diamonds customers can browse and purchase.

**What's in it:**
- Basic diamond details (carat weight, color, clarity, cut quality, shape)
- Pricing information (wholesale cost, retail price, markup)
- Images, videos, and certificates
- Availability status (available, on hold, or sold)
- Information about the original supplier

**Why it matters:** This is what powers your website and customer searches. When someone looks for a 1-carat round diamond, they're searching this table. It's the clean, ready-to-show version of your inventory.

---

### **raw_diamonds_nivoda** - The Staging Area
**What it stores:** Raw, unprocessed diamond data as it comes directly from your supplier (Nivoda).

**What's in it:**
- Complete supplier data dumps (stored as-is, unmodified)
- Tracking information to prevent duplicates
- Flags to show which diamonds have been processed and moved to your main catalog

**Why it matters:** This acts like a receiving dock at a warehouse. New inventory arrives here first, gets checked and organized, then moves to your showroom (the diamonds table). Keeping the raw data separate means you can always go back and reprocess if needed, and it protects your live inventory from incomplete or corrupted data.

---

### **pricing_rules** - Your Pricing Strategy
**What it stores:** The rules that automatically calculate prices and quality ratings for diamonds.

**What's in it:**
- Conditions (like "diamonds between 1-2 carats" or "only lab-grown")
- The markup percentage to apply
- Quality rating to assign (1-10 scale)
- Priority order (which rules to apply first)

**Why it matters:** Instead of manually pricing every diamond, you set rules once and the system applies them automatically. For example: "Mark up all 2+ carat natural diamonds by 25% and rate them 8/10." You can update pricing across thousands of diamonds instantly by changing a rule.

---

## Data Pipeline Management Tables

### **run_metadata** - The Job Tracker
**What it stores:** A record of each time the system fetches new inventory from suppliers.

**What's in it:**
- Start and completion times
- Type of update (full refresh or just new/changed items)
- How many tasks the job was broken into
- Success/failure counts
- Before and after inventory timestamps

**Why it matters:** This is your audit trail and status dashboard. You can see when the last update ran, whether it succeeded, and compare inventory states over time. If something goes wrong, this tells you exactly when and in which update run.

---

### **worker_runs** - Individual Task Progress
**What it stores:** Detailed progress for each piece of a larger update job.

**What's in it:**
- Which price range or category this task handled
- How many diamonds were processed
- Success or error status
- The exact task definition (in case you need to retry)

**Why it matters:** Large updates are split into smaller chunks that run in parallel. This table shows you which chunks succeeded, which failed, and why. It's like tracking individual workers on an assembly line - you know exactly who did what and where problems occurred.

---

### **partition_progress** - The Checkpoint System
**What it stores:** Where each task left off, so it can resume if interrupted.

**What's in it:**
- Which page of results was processed last
- Whether this piece is fully complete
- Tracking to prevent processing the same data twice

**Why it matters:** If a task gets interrupted (network issue, server restart), this ensures you don't lose progress or create duplicates. The system picks up exactly where it left off, making updates reliable even when things go wrong.

---

## Customer Interaction Tables

### **purchase_history** - Transaction Records
**What it stores:** Every diamond purchase transaction, from start to finish.

**What's in it:**
- Which diamond was purchased
- Current transaction status (pending, confirmed, completed, or failed)
- Order confirmation numbers
- Unique keys to prevent accidental duplicate orders
- Notes and reference information

**Why it matters:** This is your sales ledger. It tracks every purchase attempt, prevents customers from being charged twice if they accidentally click "buy" multiple times, and maintains a complete history for accounting, customer support, and analytics.

---

### **hold_history** - Reservation Records
**What it stores:** Logs of when diamonds are temporarily reserved (held) for customers.

**What's in it:**
- Which diamond was held
- How long the hold lasts
- Whether the hold was approved or denied
- Supplier confirmation numbers

**Why it matters:** When a customer wants to reserve a diamond while they decide, this tracks that reservation. It prevents other customers from buying the same diamond during the hold period and maintains an audit trail of all reservation requests.

---

## Security Table

### **api_keys** - Access Credentials
**What it stores:** Authentication keys that grant access to your system.

**What's in it:**
- Encrypted access keys (the actual keys are never stored, only secure hashes)
- Which client or application the key belongs to
- Last time it was used
- Expiration dates (optional)
- Active/inactive status

**Why it matters:** This controls who can access your inventory system. Each key is like a digital door key - you can see who's using the system, when they last accessed it, and revoke access instantly if needed.

---

## How It All Works Together

### The Update Cycle
1. **New inventory arrives** → Stored in `raw_diamonds_nivoda` (the receiving dock)
2. **System tracks the job** → Logged in `run_metadata` and `worker_runs`
3. **Rules are applied** → Uses `pricing_rules` to calculate prices and ratings
4. **Clean inventory emerges** → Final diamonds go into the `diamonds` table (your showroom)
5. **Progress is saved** → `partition_progress` tracks checkpoints

### The Customer Journey
1. **Customer searches** → Queries the `diamonds` table
2. **Customer reserves** → Creates entry in `hold_history`
3. **Customer purchases** → Creates entry in `purchase_history`
4. **All actions are logged** → Full audit trail for every interaction

### The Safety Features
- **Duplicate prevention:** The system won't process the same diamond twice or charge a customer twice
- **Resume capability:** Interrupted updates pick up where they left off
- **Audit trails:** Every change and transaction is logged with timestamps
- **Access control:** Only authorized users/applications can access the data via `api_keys`

---

## Key Benefits of This Structure

**Reliability:** Data flows through stages with checkpoints, so partial failures don't corrupt your inventory.

**Transparency:** Complete audit trails show what happened, when, and why.

**Flexibility:** Change pricing rules without changing code. Resume interrupted jobs without manual intervention.

**Performance:** Large updates run in parallel chunks, processing thousands of diamonds efficiently.

**Accuracy:** Raw supplier data is preserved separately from your processed inventory, so you can always verify or reprocess.
