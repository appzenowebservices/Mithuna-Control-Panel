ALTER TABLE "agents" ADD COLUMN "team_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "agents" ADD CONSTRAINT "agents_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agents_company_team_idx" ON "agents" ("company_id", "team_id");