ALTER TABLE "projects" ADD COLUMN "team_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "projects" ADD CONSTRAINT "projects_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_company_team_idx" ON "projects" ("company_id", "team_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"company_skill_id" uuid NOT NULL,
	"version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "team_skills" ADD CONSTRAINT "team_skills_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "team_skills" ADD CONSTRAINT "team_skills_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "team_skills" ADD CONSTRAINT "team_skills_company_skill_id_company_skills_id_fk" FOREIGN KEY ("company_skill_id") REFERENCES "public"."company_skills"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "team_skills" ADD CONSTRAINT "team_skills_version_id_company_skill_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."company_skill_versions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "team_skills_company_team_skill_idx" ON "team_skills" ("company_id", "team_id", "company_skill_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_skills_company_team_idx" ON "team_skills" ("company_id", "team_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_skills_company_skill_idx" ON "team_skills" ("company_id", "company_skill_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_skills_company_version_idx" ON "team_skills" ("company_id", "version_id");
