-- 0120_agent_memories: per-agent memory store (Postgres replaces .md memoir files).
--
-- NOTE: the stock `drizzle-kit generate` output for this migration also
-- re-emitted `issue_structured_cards` (0119 was hand-applied, so the drizzle
-- snapshot did not know it). Those statements were REMOVED here — the table
-- already exists live via 0119. Only `agent_memories` below is new.
--
-- pgvector is REQUIRED for the embedding column. Supabase ships it; hosts
-- without it (stock embedded Postgres used by offline tests) skip the whole
-- table and the app falls back to file-backed diary + FTS. Single statement
-- so the migration runner applies it atomically.
DO $agent_memories_migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector') THEN
      RAISE NOTICE 'pgvector unavailable on this host — skipping agent_memories table (vector search disabled; file diary + FTS remain)';
      RETURN;
    END IF;
    CREATE EXTENSION vector;
  END IF;

  CREATE TABLE "agent_memories" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "company_id" uuid NOT NULL,
    "agent_id" uuid NOT NULL,
    "kind" text NOT NULL,
    "house_number" integer,
    "occurred_at" timestamp with time zone,
    "text" text NOT NULL,
    "content_hash" text NOT NULL,
    "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "embedding" vector(768),
    "embedding_model" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  );

  BEGIN
    ALTER TABLE "agent_memories" ADD CONSTRAINT "agent_memories_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
    WHEN duplicate_object THEN null;
  END;
  BEGIN
    ALTER TABLE "agent_memories" ADD CONSTRAINT "agent_memories_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
    WHEN duplicate_object THEN null;
  END;

  CREATE INDEX "agent_memories_company_agent_kind_created_idx" ON "agent_memories" USING btree ("company_id","agent_id","kind","created_at");
  CREATE INDEX "agent_memories_agent_occurred_idx" ON "agent_memories" USING btree ("agent_id","occurred_at");
  CREATE INDEX "agent_memories_agent_hash_idx" ON "agent_memories" USING btree ("agent_id","content_hash");
  -- Cosine-similarity search over memory embeddings (NULL embeddings are simply not indexed).
  CREATE INDEX "agent_memories_embedding_hnsw_idx" ON "agent_memories" USING hnsw ("embedding" vector_cosine_ops);
  -- Lexical fallback when a row was never embedded (core tsvector — no extension needed).
  CREATE INDEX "agent_memories_text_fts_idx" ON "agent_memories" USING gin (to_tsvector('english', "text"));
END
$agent_memories_migration$;
