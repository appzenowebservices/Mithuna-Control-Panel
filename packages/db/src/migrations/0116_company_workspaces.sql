CREATE TABLE IF NOT EXISTS "company_workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"source_type" text DEFAULT 'local_path' NOT NULL,
	"cwd" text,
	"repo_url" text,
	"repo_ref" text,
	"default_ref" text,
	"visibility" text DEFAULT 'default' NOT NULL,
	"setup_command" text,
	"cleanup_command" text,
	"shared_workspace_key" text,
	"metadata" jsonb,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "company_workspaces" ADD CONSTRAINT "company_workspaces_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_workspaces_company_idx" ON "company_workspaces" ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_workspaces_company_primary_idx" ON "company_workspaces" ("company_id", "is_primary");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_workspaces_company_source_type_idx" ON "company_workspaces" ("company_id", "source_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_workspaces_company_shared_key_idx" ON "company_workspaces" ("company_id", "shared_workspace_key");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "company_workspaces_company_repo_ref_idx" ON "company_workspaces" ("company_id", "repo_url", "repo_ref");
