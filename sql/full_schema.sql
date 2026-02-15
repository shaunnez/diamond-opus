


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';


SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."api_keys" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key_hash" "text" NOT NULL,
    "client_name" "text" NOT NULL,
    "permissions" "text"[] DEFAULT '{}'::"text"[],
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "last_used_at" timestamp with time zone,
    "expires_at" timestamp with time zone
);


ALTER TABLE "public"."api_keys" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."demo_feed_inventory" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "stone_id" "text" NOT NULL,
    "weight_ct" numeric(6,2) NOT NULL,
    "stone_shape" "text" NOT NULL,
    "stone_color" "text" NOT NULL,
    "stone_clarity" "text" NOT NULL,
    "cut_grade" "text",
    "polish_grade" "text",
    "symmetry_grade" "text",
    "fluorescence_level" "text",
    "asking_price_usd" numeric(12,2) NOT NULL,
    "price_per_ct_usd" numeric(12,2) NOT NULL,
    "is_lab_created" boolean DEFAULT false,
    "is_treated" boolean DEFAULT false,
    "availability_status" "text" DEFAULT 'available'::"text" NOT NULL,
    "cert_lab" "text",
    "cert_number" "text",
    "image_link" "text",
    "video_link" "text",
    "vendor_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."demo_feed_inventory" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."diamonds" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "feed" "text" DEFAULT 'nivoda'::"text" NOT NULL,
    "supplier_stone_id" "text" NOT NULL,
    "offer_id" "text" NOT NULL,
    "shape" "text" NOT NULL,
    "carats" numeric(6,2),
    "color" "text",
    "clarity" "text",
    "cut" "text",
    "polish" "text",
    "symmetry" "text",
    "fluorescence" "text",
    "lab_grown" boolean DEFAULT false,
    "treated" boolean DEFAULT false,
    "fancy_color" "text",
    "markup_ratio" numeric(5,4),
    "rating" integer,
    "availability" "text" NOT NULL,
    "raw_availability" "text",
    "hold_id" "text",
    "image_url" "text",
    "video_url" "text",
    "certificate_lab" "text",
    "certificate_number" "text",
    "certificate_pdf_url" "text",
    "measurements" "jsonb",
    "attributes" "jsonb",
    "supplier_name" "text",
    "supplier_legal_name" "text",
    "status" "text" DEFAULT 'active'::"text",
    "source_updated_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "deleted_at" timestamp with time zone,
    "price_model_price" numeric(12,2) NOT NULL,
    "price_per_carat" numeric(12,2) NOT NULL,
    "feed_price" numeric(12,2) NOT NULL,
    "diamond_price" numeric(12,2),
    "fancy_color" "text",
    "fancy_intensity" "text",
    "fancy_overtone" "text",
    "fluorescence_intensity" "text",
    "ratio" numeric(5,3),
    CONSTRAINT "diamonds_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 10)))
);


ALTER TABLE "public"."diamonds" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."error_logs" (
    "id" bigint NOT NULL,
    "service" character varying(50) NOT NULL,
    "error_message" "text" NOT NULL,
    "stack_trace" "text",
    "context" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."error_logs" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."error_logs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."error_logs_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."error_logs_id_seq" OWNED BY "public"."error_logs"."id";



CREATE TABLE IF NOT EXISTS "public"."hold_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "diamond_id" "uuid",
    "feed" "text" NOT NULL,
    "feed_hold_id" "text",
    "offer_id" "text" NOT NULL,
    "status" "text" NOT NULL,
    "denied" boolean DEFAULT false,
    "hold_until" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."hold_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."partition_progress" (
    "run_id" "uuid" NOT NULL,
    "partition_id" "text" NOT NULL,
    "next_offset" integer DEFAULT 0 NOT NULL,
    "completed" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "failed" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."partition_progress" OWNER TO "postgres";


COMMENT ON TABLE "public"."partition_progress" IS 'Tracks pagination progress for each worker partition to enable continuation pattern. Each partition processes one page per message.';



COMMENT ON COLUMN "public"."partition_progress"."next_offset" IS 'The offset for the next page to fetch. Updated atomically after each page is processed.';



COMMENT ON COLUMN "public"."partition_progress"."completed" IS 'True when all pages in this partition have been processed.';



COMMENT ON COLUMN "public"."partition_progress"."failed" IS 'True when this partition has encountered a failure. Set atomically to prevent double-counting.';



CREATE TABLE IF NOT EXISTS "public"."pricing_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "priority" integer DEFAULT 100 NOT NULL,
    "stone_type" "text",
    "price_min" numeric(12,2),
    "price_max" numeric(12,2),
    "feed" "text",
    "margin_modifier" numeric(5,2) NOT NULL DEFAULT 0,
    "rating" integer,
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "pricing_rules_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 10))),
    CONSTRAINT "pricing_rules_stone_type_check" CHECK (("stone_type" IS NULL OR "stone_type" IN ('natural', 'lab', 'fancy'))),
    CONSTRAINT "pricing_rules_price_range_check" CHECK (("price_min" IS NULL OR "price_max" IS NULL OR "price_min" <= "price_max"))
);


ALTER TABLE "public"."pricing_rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."purchase_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "diamond_id" "uuid",
    "feed" "text" NOT NULL,
    "feed_order_id" "text",
    "offer_id" "text" NOT NULL,
    "idempotency_key" "text" NOT NULL,
    "status" "text" NOT NULL,
    "reference" "text",
    "comments" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."purchase_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rate_limit" (
    "key" "text" NOT NULL,
    "window_start" timestamp with time zone DEFAULT "now"() NOT NULL,
    "request_count" integer DEFAULT 0 NOT NULL,
    "last_request_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."rate_limit" OWNER TO "postgres";


COMMENT ON TABLE "public"."rate_limit" IS 'Global rate limiting for external API calls using fixed window token bucket';



COMMENT ON COLUMN "public"."rate_limit"."window_start" IS 'Start of the current 1-second rate limit window';



COMMENT ON COLUMN "public"."rate_limit"."request_count" IS 'Number of requests made in the current window';



CREATE TABLE IF NOT EXISTS "public"."raw_diamonds_demo" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "run_id" "uuid" NOT NULL,
    "supplier_stone_id" "text" NOT NULL,
    "offer_id" "text" NOT NULL,
    "source_updated_at" timestamp with time zone,
    "payload" "jsonb" NOT NULL,
    "payload_hash" "text" NOT NULL,
    "consolidated" boolean DEFAULT false,
    "consolidation_status" "text" DEFAULT 'pending'::"text",
    "claimed_at" timestamp with time zone,
    "claimed_by" "text",
    "consolidated_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."raw_diamonds_demo" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."raw_diamonds_nivoda" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "run_id" "uuid" NOT NULL,
    "supplier_stone_id" "text" NOT NULL,
    "offer_id" "text" NOT NULL,
    "source_updated_at" timestamp with time zone,
    "payload" "jsonb" NOT NULL,
    "payload_hash" "text" NOT NULL,
    "consolidated" boolean DEFAULT false,
    "consolidated_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "consolidation_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "claimed_at" timestamp with time zone,
    "claimed_by" "text"
);


ALTER TABLE "public"."raw_diamonds_nivoda" OWNER TO "postgres";


COMMENT ON COLUMN "public"."raw_diamonds_nivoda"."consolidation_status" IS 'pending | processing | done | failed';



COMMENT ON COLUMN "public"."raw_diamonds_nivoda"."claimed_at" IS 'Timestamp when row was claimed for processing (for stuck claim detection)';



COMMENT ON COLUMN "public"."raw_diamonds_nivoda"."claimed_by" IS 'Instance ID of consolidator that claimed this row';



CREATE TABLE IF NOT EXISTS "public"."run_metadata" (
    "run_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "run_type" "text" NOT NULL,
    "expected_workers" integer NOT NULL,
    "completed_workers" integer DEFAULT 0,
    "failed_workers" integer DEFAULT 0,
    "watermark_before" timestamp with time zone,
    "watermark_after" timestamp with time zone,
    "started_at" timestamp with time zone DEFAULT "now"(),
    "completed_at" timestamp with time zone,
    "consolidation_started_at" timestamp with time zone,
    "consolidation_completed_at" timestamp with time zone,
    "consolidation_processed" integer DEFAULT 0,
    "consolidation_errors" integer DEFAULT 0,
    "consolidation_total" integer DEFAULT 0,
    "feed" "text" DEFAULT 'nivoda'::"text" NOT NULL
);


ALTER TABLE "public"."run_metadata" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."worker_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "run_id" "uuid" NOT NULL,
    "partition_id" "text" NOT NULL,
    "worker_id" "uuid" NOT NULL,
    "status" "text" NOT NULL,
    "records_processed" integer DEFAULT 0,
    "error_message" "text",
    "started_at" timestamp with time zone DEFAULT "now"(),
    "completed_at" timestamp with time zone,
    "work_item_payload" "jsonb"
);


ALTER TABLE "public"."worker_runs" OWNER TO "postgres";


ALTER TABLE ONLY "public"."error_logs" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."error_logs_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."api_keys"
    ADD CONSTRAINT "api_keys_key_hash_key" UNIQUE ("key_hash");



ALTER TABLE ONLY "public"."api_keys"
    ADD CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."demo_feed_inventory"
    ADD CONSTRAINT "demo_feed_inventory_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."demo_feed_inventory"
    ADD CONSTRAINT "demo_feed_inventory_stone_id_key" UNIQUE ("stone_id");



ALTER TABLE ONLY "public"."diamonds"
    ADD CONSTRAINT "diamonds_feed_supplier_stone_id_key" UNIQUE ("feed", "supplier_stone_id");



ALTER TABLE ONLY "public"."diamonds"
    ADD CONSTRAINT "diamonds_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."error_logs"
    ADD CONSTRAINT "error_logs_error_message_key" UNIQUE ("error_message");



ALTER TABLE ONLY "public"."error_logs"
    ADD CONSTRAINT "error_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hold_history"
    ADD CONSTRAINT "hold_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."partition_progress"
    ADD CONSTRAINT "partition_progress_pkey" PRIMARY KEY ("run_id", "partition_id");



ALTER TABLE ONLY "public"."pricing_rules"
    ADD CONSTRAINT "pricing_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchase_history"
    ADD CONSTRAINT "purchase_history_idempotency_key_key" UNIQUE ("idempotency_key");



ALTER TABLE ONLY "public"."purchase_history"
    ADD CONSTRAINT "purchase_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rate_limit"
    ADD CONSTRAINT "rate_limit_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."raw_diamonds_demo"
    ADD CONSTRAINT "raw_diamonds_demo_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."raw_diamonds_demo"
    ADD CONSTRAINT "raw_diamonds_demo_supplier_stone_id_key" UNIQUE ("supplier_stone_id");



ALTER TABLE ONLY "public"."raw_diamonds_nivoda"
    ADD CONSTRAINT "raw_diamonds_nivoda_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."raw_diamonds_nivoda"
    ADD CONSTRAINT "raw_diamonds_nivoda_supplier_stone_id_key" UNIQUE ("supplier_stone_id");



ALTER TABLE ONLY "public"."run_metadata"
    ADD CONSTRAINT "run_metadata_pkey" PRIMARY KEY ("run_id");



ALTER TABLE ONLY "public"."worker_runs"
    ADD CONSTRAINT "worker_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."worker_runs"
    ADD CONSTRAINT "worker_runs_run_id_partition_id_key" UNIQUE ("run_id", "partition_id");



CREATE INDEX "diamonds_status_idx" ON "public"."diamonds" USING "btree" ("status");



CREATE INDEX "diamonds_supplier_idx" ON "public"."diamonds" USING "btree" ("feed");



CREATE INDEX "diamonds_supplier_legal_name_idx" ON "public"."diamonds" USING "btree" ("supplier_legal_name");



CREATE INDEX "idx_api_keys_hash" ON "public"."api_keys" USING "btree" ("key_hash") WHERE ("active" = true);



CREATE INDEX "idx_demo_inventory_price" ON "public"."demo_feed_inventory" USING "btree" ("asking_price_usd");



CREATE INDEX "idx_demo_inventory_shape" ON "public"."demo_feed_inventory" USING "btree" ("stone_shape");



CREATE INDEX "idx_demo_inventory_updated" ON "public"."demo_feed_inventory" USING "btree" ("updated_at");



CREATE INDEX "idx_diamonds_availability" ON "public"."diamonds" USING "btree" ("availability") WHERE ("status" = 'active'::"text");



CREATE INDEX "idx_diamonds_carats" ON "public"."diamonds" USING "btree" ("carats") WHERE ("status" = 'active'::"text");



CREATE INDEX "idx_diamonds_created" ON "public"."diamonds" USING "btree" ("created_at" DESC) WHERE ("status" = 'active'::"text");



CREATE INDEX "idx_diamonds_cut" ON "public"."diamonds" USING "btree" ("cut") WHERE ("status" = 'active'::"text");



CREATE INDEX "idx_diamonds_deleted" ON "public"."diamonds" USING "btree" ("deleted_at") WHERE ("status" = 'deleted'::"text");



CREATE INDEX "idx_diamonds_lab_grown" ON "public"."diamonds" USING "btree" ("lab_grown") WHERE ("status" = 'active'::"text");



CREATE INDEX "idx_diamonds_offer" ON "public"."diamonds" USING "btree" ("offer_id");



CREATE INDEX "idx_diamonds_price" ON "public"."diamonds" USING "btree" ("feed_price") WHERE ("status" = 'active'::"text");



CREATE INDEX "idx_diamonds_search" ON "public"."diamonds" USING "btree" ("shape", "carats", "color", "clarity") WHERE ("status" = 'active'::"text");

CREATE INDEX "idx_diamonds_fancy_color" ON "public"."diamonds" USING "btree" ("fancy_color") WHERE ("status" = 'active'::"text" AND "fancy_color" IS NOT NULL);
CREATE INDEX "idx_diamonds_fancy_intensity" ON "public"."diamonds" USING "btree" ("fancy_intensity") WHERE ("status" = 'active'::"text" AND "fancy_intensity" IS NOT NULL);
CREATE INDEX "idx_diamonds_fluorescence_intensity" ON "public"."diamonds" USING "btree" ("fluorescence_intensity") WHERE ("status" = 'active'::"text");
CREATE INDEX "idx_diamonds_ratio" ON "public"."diamonds" USING "btree" ("ratio") WHERE ("status" = 'active'::"text" AND "ratio" IS NOT NULL);
CREATE INDEX "idx_diamonds_polish" ON "public"."diamonds" USING "btree" ("polish") WHERE ("status" = 'active'::"text");
CREATE INDEX "idx_diamonds_symmetry" ON "public"."diamonds" USING "btree" ("symmetry") WHERE ("status" = 'active'::"text");
CREATE INDEX "idx_diamonds_certificate_lab" ON "public"."diamonds" USING "btree" ("certificate_lab") WHERE ("status" = 'active'::"text");
CREATE INDEX "idx_diamonds_measurements_gin" ON "public"."diamonds" USING GIN ("measurements" "jsonb_path_ops") WHERE ("status" = 'active'::"text");
CREATE INDEX "idx_diamonds_attributes_gin" ON "public"."diamonds" USING GIN ("attributes" "jsonb_path_ops") WHERE ("status" = 'active'::"text");



CREATE INDEX "idx_error_logs_created" ON "public"."error_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_error_logs_service_created" ON "public"."error_logs" USING "btree" ("service", "created_at" DESC);



CREATE INDEX "idx_hold_history_diamond_id" ON "public"."hold_history" USING "btree" ("diamond_id", "created_at" DESC);



CREATE INDEX "idx_partition_progress_failed" ON "public"."partition_progress" USING "btree" ("run_id", "failed") WHERE ("failed" = true);



CREATE INDEX "idx_partition_progress_incomplete" ON "public"."partition_progress" USING "btree" ("run_id", "completed") WHERE ("completed" = false);



CREATE INDEX "idx_partition_progress_updated" ON "public"."partition_progress" USING "btree" ("updated_at" DESC);



CREATE INDEX "idx_pricing_rules_active" ON "public"."pricing_rules" USING "btree" ("priority") WHERE ("active" = true);



CREATE INDEX "idx_purchase_history_diamond_id" ON "public"."purchase_history" USING "btree" ("diamond_id");



CREATE INDEX "idx_rate_limit_key" ON "public"."rate_limit" USING "btree" ("key");



CREATE INDEX "idx_raw_demo_claim" ON "public"."raw_diamonds_demo" USING "btree" ("consolidation_status", "created_at") WHERE (NOT "consolidated");



CREATE INDEX "idx_raw_demo_consolidated" ON "public"."raw_diamonds_demo" USING "btree" ("consolidated") WHERE (NOT "consolidated");



CREATE INDEX "idx_raw_demo_run_id" ON "public"."raw_diamonds_demo" USING "btree" ("run_id");



CREATE INDEX "idx_raw_demo_unconsolidated_created" ON "public"."raw_diamonds_demo" USING "btree" ("created_at") WHERE (NOT "consolidated");



CREATE INDEX "idx_raw_nivoda_claim" ON "public"."raw_diamonds_nivoda" USING "btree" ("consolidation_status", "created_at") WHERE ("consolidated" = false);



CREATE INDEX "idx_raw_nivoda_consolidated" ON "public"."raw_diamonds_nivoda" USING "btree" ("consolidated") WHERE (NOT "consolidated");



CREATE INDEX "idx_raw_nivoda_run_id" ON "public"."raw_diamonds_nivoda" USING "btree" ("run_id");



CREATE INDEX "idx_raw_nivoda_unconsolidated_created_at" ON "public"."raw_diamonds_nivoda" USING "btree" ("created_at") WHERE ("consolidated" = false);



CREATE INDEX "idx_run_metadata_consolidation" ON "public"."run_metadata" USING "btree" ("consolidation_completed_at") WHERE (("consolidation_completed_at" IS NOT NULL) AND ("consolidation_errors" > 0));



CREATE INDEX "idx_run_metadata_feed" ON "public"."run_metadata" USING "btree" ("feed");



CREATE INDEX "idx_run_metadata_incomplete" ON "public"."run_metadata" USING "btree" ("started_at" DESC) WHERE ("completed_at" IS NULL);



CREATE INDEX "idx_worker_runs_run_started" ON "public"."worker_runs" USING "btree" ("run_id", "started_at");



CREATE INDEX "idx_worker_runs_status" ON "public"."worker_runs" USING "btree" ("run_id", "status");



CREATE INDEX "partition_progress_completed_idx" ON "public"."partition_progress" USING "btree" ("completed");



CREATE INDEX "partition_progress_failed_idx" ON "public"."partition_progress" USING "btree" ("failed");



CREATE INDEX "partition_progress_run_id_idx" ON "public"."partition_progress" USING "btree" ("run_id");



CREATE INDEX "raw_diamonds_nivoda_consolidated_idx" ON "public"."raw_diamonds_nivoda" USING "btree" ("consolidated");



CREATE INDEX "raw_diamonds_nivoda_created_at_idx" ON "public"."raw_diamonds_nivoda" USING "btree" ("created_at");



CREATE INDEX "run_metadata_started_at_idx" ON "public"."run_metadata" USING "btree" ("started_at");



CREATE INDEX "worker_runs_run_id_idx" ON "public"."worker_runs" USING "btree" ("run_id");



ALTER TABLE ONLY "public"."hold_history"
    ADD CONSTRAINT "hold_history_diamond_id_fkey" FOREIGN KEY ("diamond_id") REFERENCES "public"."diamonds"("id");



ALTER TABLE ONLY "public"."purchase_history"
    ADD CONSTRAINT "purchase_history_diamond_id_fkey" FOREIGN KEY ("diamond_id") REFERENCES "public"."diamonds"("id");



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON TABLE "public"."api_keys" TO "anon";
GRANT ALL ON TABLE "public"."api_keys" TO "authenticated";
GRANT ALL ON TABLE "public"."api_keys" TO "service_role";



GRANT ALL ON TABLE "public"."demo_feed_inventory" TO "anon";
GRANT ALL ON TABLE "public"."demo_feed_inventory" TO "authenticated";
GRANT ALL ON TABLE "public"."demo_feed_inventory" TO "service_role";



GRANT ALL ON TABLE "public"."diamonds" TO "anon";
GRANT ALL ON TABLE "public"."diamonds" TO "authenticated";
GRANT ALL ON TABLE "public"."diamonds" TO "service_role";



GRANT ALL ON TABLE "public"."error_logs" TO "anon";
GRANT ALL ON TABLE "public"."error_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."error_logs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."error_logs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."error_logs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."error_logs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."hold_history" TO "anon";
GRANT ALL ON TABLE "public"."hold_history" TO "authenticated";
GRANT ALL ON TABLE "public"."hold_history" TO "service_role";



GRANT ALL ON TABLE "public"."partition_progress" TO "anon";
GRANT ALL ON TABLE "public"."partition_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."partition_progress" TO "service_role";



GRANT ALL ON TABLE "public"."pricing_rules" TO "anon";
GRANT ALL ON TABLE "public"."pricing_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."pricing_rules" TO "service_role";



GRANT ALL ON TABLE "public"."purchase_history" TO "anon";
GRANT ALL ON TABLE "public"."purchase_history" TO "authenticated";
GRANT ALL ON TABLE "public"."purchase_history" TO "service_role";



GRANT ALL ON TABLE "public"."rate_limit" TO "anon";
GRANT ALL ON TABLE "public"."rate_limit" TO "authenticated";
GRANT ALL ON TABLE "public"."rate_limit" TO "service_role";



GRANT ALL ON TABLE "public"."raw_diamonds_demo" TO "anon";
GRANT ALL ON TABLE "public"."raw_diamonds_demo" TO "authenticated";
GRANT ALL ON TABLE "public"."raw_diamonds_demo" TO "service_role";



GRANT ALL ON TABLE "public"."raw_diamonds_nivoda" TO "anon";
GRANT ALL ON TABLE "public"."raw_diamonds_nivoda" TO "authenticated";
GRANT ALL ON TABLE "public"."raw_diamonds_nivoda" TO "service_role";



GRANT ALL ON TABLE "public"."run_metadata" TO "anon";
GRANT ALL ON TABLE "public"."run_metadata" TO "authenticated";
GRANT ALL ON TABLE "public"."run_metadata" TO "service_role";



GRANT ALL ON TABLE "public"."worker_runs" TO "anon";
GRANT ALL ON TABLE "public"."worker_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."worker_runs" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



CREATE TABLE IF NOT EXISTS exchange_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_currency TEXT NOT NULL,
  target_currency TEXT NOT NULL,
  rate NUMERIC(12,6) NOT NULL,
  rate_date DATE NOT NULL,
  fetched_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(base_currency, target_currency)
);

CREATE INDEX IF NOT EXISTS idx_exchange_rates_pair
  ON exchange_rates(base_currency, target_currency);


CREATE TABLE IF NOT EXISTS "public"."dataset_versions" (
    "feed" "text" NOT NULL,
    "version" bigint NOT NULL DEFAULT 1,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "dataset_versions_pkey" PRIMARY KEY ("feed")
);

ALTER TABLE "public"."dataset_versions" OWNER TO "postgres";

COMMENT ON TABLE "public"."dataset_versions" IS 'Monotonic version counter per feed for cache invalidation. Incremented by consolidator after successful completion.';

INSERT INTO "public"."dataset_versions" ("feed", "version") VALUES ('nivoda', 1) ON CONFLICT DO NOTHING;
INSERT INTO "public"."dataset_versions" ("feed", "version") VALUES ('demo', 1) ON CONFLICT DO NOTHING;

GRANT ALL ON TABLE "public"."dataset_versions" TO "anon";
GRANT ALL ON TABLE "public"."dataset_versions" TO "authenticated";
GRANT ALL ON TABLE "public"."dataset_versions" TO "service_role";
