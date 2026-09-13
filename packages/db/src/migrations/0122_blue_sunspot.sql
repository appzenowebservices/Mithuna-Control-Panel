CREATE TABLE "hermes_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"session_id" text NOT NULL,
	"snapshot_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hermes_sessions" ADD CONSTRAINT "hermes_sessions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hermes_sessions" ADD CONSTRAINT "hermes_sessions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hermes_sessions_company_agent_session_uniq" ON "hermes_sessions" USING btree ("company_id","agent_id","session_id");--> statement-breakpoint
CREATE INDEX "hermes_sessions_company_agent_updated_idx" ON "hermes_sessions" USING btree ("company_id","agent_id","updated_at");