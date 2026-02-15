-- Dataset versioning for API cache invalidation
-- Each feed has a monotonic version counter that increments after successful consolidation.
-- API caches are keyed by this version, so old entries naturally become cold without explicit invalidation.

CREATE TABLE IF NOT EXISTS "public"."dataset_versions" (
    "feed" "text" NOT NULL,
    "version" bigint NOT NULL DEFAULT 1,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "dataset_versions_pkey" PRIMARY KEY ("feed")
);

ALTER TABLE "public"."dataset_versions" OWNER TO "postgres";

COMMENT ON TABLE "public"."dataset_versions" IS 'Monotonic version counter per feed for cache invalidation. Incremented by consolidator after successful completion.';

-- Seed initial versions for known feeds
INSERT INTO "public"."dataset_versions" ("feed", "version") VALUES ('nivoda', 1) ON CONFLICT DO NOTHING;
INSERT INTO "public"."dataset_versions" ("feed", "version") VALUES ('demo', 1) ON CONFLICT DO NOTHING;

-- Grants
GRANT ALL ON TABLE "public"."dataset_versions" TO "anon";
GRANT ALL ON TABLE "public"."dataset_versions" TO "authenticated";
GRANT ALL ON TABLE "public"."dataset_versions" TO "service_role";
