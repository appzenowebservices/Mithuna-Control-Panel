ALTER TABLE "agent_memories" ADD COLUMN "priority" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_memories" ADD COLUMN "pinned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_memories" ADD COLUMN "supersedes" uuid;--> statement-breakpoint
ALTER TABLE "agent_memories" ADD CONSTRAINT "agent_memories_supersedes_agent_memories_id_fk" FOREIGN KEY ("supersedes") REFERENCES "public"."agent_memories"("id") ON DELETE set null ON UPDATE no action;