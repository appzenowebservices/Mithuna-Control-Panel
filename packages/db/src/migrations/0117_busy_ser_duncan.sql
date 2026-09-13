CREATE TABLE "company_skill_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"company_skill_id" uuid NOT NULL,
	"parent_comment_id" uuid,
	"author_agent_id" uuid,
	"author_user_id" text,
	"body" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_skill_stars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"company_skill_id" uuid NOT NULL,
	"agent_id" uuid,
	"user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_skill_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"company_skill_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"label" text,
	"file_inventory" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"author_agent_id" uuid,
	"author_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_workspaces" (
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
CREATE TABLE "external_object_mentions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"source_issue_id" uuid NOT NULL,
	"source_kind" text NOT NULL,
	"source_record_id" uuid,
	"document_key" text,
	"property_key" text,
	"matched_text_redacted" text,
	"sanitized_display_url" text,
	"canonical_identity_hash" text,
	"canonical_identity" jsonb,
	"object_id" uuid,
	"provider_key" text,
	"detector_key" text,
	"object_type" text,
	"confidence" text DEFAULT 'exact' NOT NULL,
	"created_by_plugin_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_objects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"provider_key" text NOT NULL,
	"plugin_id" uuid,
	"object_type" text NOT NULL,
	"external_id" text NOT NULL,
	"sanitized_canonical_url" text,
	"canonical_identity_hash" text,
	"display_key" text,
	"icon_key" text,
	"display_title" text,
	"status_key" text,
	"status_label" text,
	"status_icon_key" text,
	"status_category" text DEFAULT 'unknown' NOT NULL,
	"status_tone" text DEFAULT 'neutral' NOT NULL,
	"liveness" text DEFAULT 'unknown' NOT NULL,
	"is_terminal" boolean DEFAULT false NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"remote_version" text,
	"etag" text,
	"last_resolved_at" timestamp with time zone,
	"last_changed_at" timestamp with time zone,
	"last_error_at" timestamp with time zone,
	"next_refresh_at" timestamp with time zone,
	"last_error_code" text,
	"last_error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_watchdogs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"issue_id" uuid NOT NULL,
	"watchdog_agent_id" uuid NOT NULL,
	"instructions" text,
	"status" text DEFAULT 'active' NOT NULL,
	"watchdog_issue_id" uuid,
	"last_observed_fingerprint" text,
	"last_reviewed_fingerprint" text,
	"last_triggered_at" timestamp with time zone,
	"last_completed_at" timestamp with time zone,
	"trigger_count" integer DEFAULT 0 NOT NULL,
	"created_by_agent_id" uuid,
	"created_by_user_id" text,
	"created_by_run_id" uuid,
	"updated_by_agent_id" uuid,
	"updated_by_user_id" text,
	"updated_by_run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routine_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"routine_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"company_skill_id" uuid NOT NULL,
	"version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"lead_agent_id" uuid,
	"color" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_revisions" DROP CONSTRAINT "document_revisions_company_id_companies_id_fk";
--> statement-breakpoint
ALTER TABLE "documents" DROP CONSTRAINT "documents_company_id_companies_id_fk";
--> statement-breakpoint
ALTER TABLE "environments" DROP CONSTRAINT "environments_company_id_companies_id_fk";
--> statement-breakpoint
DROP INDEX "environments_company_status_idx";--> statement-breakpoint
DROP INDEX "environments_company_driver_idx";--> statement-breakpoint
DROP INDEX "environments_company_name_idx";--> statement-breakpoint
DROP INDEX "plugin_entities_external_idx";--> statement-breakpoint
ALTER TABLE "document_annotation_comments" ALTER COLUMN "issue_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "document_annotation_threads" ALTER COLUMN "issue_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "team_id" uuid;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "error_reason" text;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "natal_birth_date_time" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "natal_latitude" real;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "natal_longitude" real;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "natal_coordinate_system" text DEFAULT 'SIDEREAL';--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "natal_chart_vectors" jsonb;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "natal_chart_raw" jsonb;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "founding_date_time" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "founding_latitude" real;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "founding_longitude" real;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "founding_coordinate_system" text DEFAULT 'SIDEREAL';--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "natal_chart_vectors" jsonb;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "natal_chart_raw" jsonb;--> statement-breakpoint
ALTER TABLE "company_skills" ADD COLUMN "icon_url" text;--> statement-breakpoint
ALTER TABLE "company_skills" ADD COLUMN "color" text;--> statement-breakpoint
ALTER TABLE "company_skills" ADD COLUMN "tagline" text;--> statement-breakpoint
ALTER TABLE "company_skills" ADD COLUMN "author_name" text;--> statement-breakpoint
ALTER TABLE "company_skills" ADD COLUMN "homepage_url" text;--> statement-breakpoint
ALTER TABLE "company_skills" ADD COLUMN "categories" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_skills" ADD COLUMN "sharing_scope" text DEFAULT 'company' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_skills" ADD COLUMN "public_share_token" text;--> statement-breakpoint
ALTER TABLE "company_skills" ADD COLUMN "forked_from_skill_id" uuid;--> statement-breakpoint
ALTER TABLE "company_skills" ADD COLUMN "forked_from_company_id" uuid;--> statement-breakpoint
ALTER TABLE "company_skills" ADD COLUMN "star_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "company_skills" ADD COLUMN "install_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "company_skills" ADD COLUMN "fork_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "company_skills" ADD COLUMN "current_version_id" uuid;--> statement-breakpoint
ALTER TABLE "document_annotation_comments" ADD COLUMN "routine_id" uuid;--> statement-breakpoint
ALTER TABLE "document_annotation_threads" ADD COLUMN "routine_id" uuid;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "source_trust" jsonb;--> statement-breakpoint
ALTER TABLE "environments" ADD COLUMN "env_vars" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "instance_settings" ADD COLUMN "default_environment_id" uuid;--> statement-breakpoint
ALTER TABLE "issue_comments" ADD COLUMN "source_trust" jsonb;--> statement-breakpoint
ALTER TABLE "issue_work_products" ADD COLUMN "source_trust" jsonb;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "source_trust" jsonb;--> statement-breakpoint
ALTER TABLE "plugin_entities" ADD COLUMN "company_id" uuid;--> statement-breakpoint
ALTER TABLE "plugin_job_runs" ADD COLUMN "company_id" uuid;--> statement-breakpoint
ALTER TABLE "plugin_logs" ADD COLUMN "company_id" uuid;--> statement-breakpoint
ALTER TABLE "plugin_webhook_deliveries" ADD COLUMN "company_id" uuid;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "team_id" uuid;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "icon" text;--> statement-breakpoint
ALTER TABLE "workspace_operations" ADD COLUMN "issue_id" uuid;--> statement-breakpoint
ALTER TABLE "company_skill_comments" ADD CONSTRAINT "company_skill_comments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_skill_comments" ADD CONSTRAINT "company_skill_comments_company_skill_id_company_skills_id_fk" FOREIGN KEY ("company_skill_id") REFERENCES "public"."company_skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_skill_comments" ADD CONSTRAINT "company_skill_comments_parent_comment_id_company_skill_comments_id_fk" FOREIGN KEY ("parent_comment_id") REFERENCES "public"."company_skill_comments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_skill_comments" ADD CONSTRAINT "company_skill_comments_author_agent_id_agents_id_fk" FOREIGN KEY ("author_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_skill_stars" ADD CONSTRAINT "company_skill_stars_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_skill_stars" ADD CONSTRAINT "company_skill_stars_company_skill_id_company_skills_id_fk" FOREIGN KEY ("company_skill_id") REFERENCES "public"."company_skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_skill_stars" ADD CONSTRAINT "company_skill_stars_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_skill_versions" ADD CONSTRAINT "company_skill_versions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_skill_versions" ADD CONSTRAINT "company_skill_versions_company_skill_id_company_skills_id_fk" FOREIGN KEY ("company_skill_id") REFERENCES "public"."company_skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_skill_versions" ADD CONSTRAINT "company_skill_versions_author_agent_id_agents_id_fk" FOREIGN KEY ("author_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_workspaces" ADD CONSTRAINT "company_workspaces_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_object_mentions" ADD CONSTRAINT "external_object_mentions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_object_mentions" ADD CONSTRAINT "external_object_mentions_source_issue_id_issues_id_fk" FOREIGN KEY ("source_issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_object_mentions" ADD CONSTRAINT "external_object_mentions_object_id_external_objects_id_fk" FOREIGN KEY ("object_id") REFERENCES "public"."external_objects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_object_mentions" ADD CONSTRAINT "external_object_mentions_created_by_plugin_id_plugins_id_fk" FOREIGN KEY ("created_by_plugin_id") REFERENCES "public"."plugins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_objects" ADD CONSTRAINT "external_objects_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_objects" ADD CONSTRAINT "external_objects_plugin_id_plugins_id_fk" FOREIGN KEY ("plugin_id") REFERENCES "public"."plugins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_watchdogs" ADD CONSTRAINT "issue_watchdogs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_watchdogs" ADD CONSTRAINT "issue_watchdogs_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_watchdogs" ADD CONSTRAINT "issue_watchdogs_watchdog_agent_id_agents_id_fk" FOREIGN KEY ("watchdog_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_watchdogs" ADD CONSTRAINT "issue_watchdogs_watchdog_issue_id_issues_id_fk" FOREIGN KEY ("watchdog_issue_id") REFERENCES "public"."issues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_watchdogs" ADD CONSTRAINT "issue_watchdogs_created_by_agent_id_agents_id_fk" FOREIGN KEY ("created_by_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_watchdogs" ADD CONSTRAINT "issue_watchdogs_created_by_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("created_by_run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_watchdogs" ADD CONSTRAINT "issue_watchdogs_updated_by_agent_id_agents_id_fk" FOREIGN KEY ("updated_by_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_watchdogs" ADD CONSTRAINT "issue_watchdogs_updated_by_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("updated_by_run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_documents" ADD CONSTRAINT "routine_documents_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_documents" ADD CONSTRAINT "routine_documents_routine_id_routines_id_fk" FOREIGN KEY ("routine_id") REFERENCES "public"."routines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_documents" ADD CONSTRAINT "routine_documents_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_skills" ADD CONSTRAINT "team_skills_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_skills" ADD CONSTRAINT "team_skills_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_skills" ADD CONSTRAINT "team_skills_company_skill_id_company_skills_id_fk" FOREIGN KEY ("company_skill_id") REFERENCES "public"."company_skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_skills" ADD CONSTRAINT "team_skills_version_id_company_skill_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."company_skill_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_lead_agent_id_agents_id_fk" FOREIGN KEY ("lead_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "company_skill_comments_company_skill_created_idx" ON "company_skill_comments" USING btree ("company_id","company_skill_id","created_at");--> statement-breakpoint
CREATE INDEX "company_skill_comments_parent_idx" ON "company_skill_comments" USING btree ("parent_comment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "company_skill_stars_skill_agent_idx" ON "company_skill_stars" USING btree ("company_skill_id","agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "company_skill_stars_skill_user_idx" ON "company_skill_stars" USING btree ("company_skill_id","user_id");--> statement-breakpoint
CREATE INDEX "company_skill_stars_company_skill_created_idx" ON "company_skill_stars" USING btree ("company_id","company_skill_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "company_skill_versions_skill_revision_idx" ON "company_skill_versions" USING btree ("company_skill_id","revision_number");--> statement-breakpoint
CREATE INDEX "company_skill_versions_company_skill_created_idx" ON "company_skill_versions" USING btree ("company_id","company_skill_id","created_at");--> statement-breakpoint
CREATE INDEX "company_workspaces_company_idx" ON "company_workspaces" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "company_workspaces_company_primary_idx" ON "company_workspaces" USING btree ("company_id","is_primary");--> statement-breakpoint
CREATE INDEX "company_workspaces_company_source_type_idx" ON "company_workspaces" USING btree ("company_id","source_type");--> statement-breakpoint
CREATE INDEX "company_workspaces_company_shared_key_idx" ON "company_workspaces" USING btree ("company_id","shared_workspace_key");--> statement-breakpoint
CREATE UNIQUE INDEX "company_workspaces_company_repo_ref_idx" ON "company_workspaces" USING btree ("company_id","repo_url","repo_ref");--> statement-breakpoint
CREATE INDEX "external_object_mentions_company_source_issue_idx" ON "external_object_mentions" USING btree ("company_id","source_issue_id");--> statement-breakpoint
CREATE INDEX "external_object_mentions_company_object_idx" ON "external_object_mentions" USING btree ("company_id","object_id");--> statement-breakpoint
CREATE INDEX "external_object_mentions_company_provider_idx" ON "external_object_mentions" USING btree ("company_id","provider_key","object_type");--> statement-breakpoint
CREATE UNIQUE INDEX "external_object_mentions_company_source_record_uq" ON "external_object_mentions" USING btree ("company_id","source_issue_id","source_kind","source_record_id","document_key","property_key","canonical_identity_hash") WHERE "external_object_mentions"."source_record_id" is not null and "external_object_mentions"."canonical_identity_hash" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "external_object_mentions_company_source_null_record_uq" ON "external_object_mentions" USING btree ("company_id","source_issue_id","source_kind","document_key","property_key","canonical_identity_hash") WHERE "external_object_mentions"."source_record_id" is null and "external_object_mentions"."canonical_identity_hash" is not null;--> statement-breakpoint
CREATE INDEX "external_objects_company_provider_object_idx" ON "external_objects" USING btree ("company_id","provider_key","object_type");--> statement-breakpoint
CREATE INDEX "external_objects_company_provider_status_idx" ON "external_objects" USING btree ("company_id","provider_key","status_category");--> statement-breakpoint
CREATE INDEX "external_objects_company_refresh_idx" ON "external_objects" USING btree ("company_id","next_refresh_at");--> statement-breakpoint
CREATE UNIQUE INDEX "external_objects_company_external_id_uq" ON "external_objects" USING btree ("company_id","provider_key","object_type","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "external_objects_company_identity_uq" ON "external_objects" USING btree ("company_id","provider_key","object_type","canonical_identity_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "issue_watchdogs_company_issue_uq" ON "issue_watchdogs" USING btree ("company_id","issue_id");--> statement-breakpoint
CREATE INDEX "issue_watchdogs_company_status_idx" ON "issue_watchdogs" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "issue_watchdogs_company_agent_idx" ON "issue_watchdogs" USING btree ("company_id","watchdog_agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "issue_watchdogs_company_watchdog_issue_uq" ON "issue_watchdogs" USING btree ("company_id","watchdog_issue_id") WHERE "issue_watchdogs"."watchdog_issue_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "routine_documents_company_routine_key_uq" ON "routine_documents" USING btree ("company_id","routine_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "routine_documents_document_uq" ON "routine_documents" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "routine_documents_company_routine_updated_idx" ON "routine_documents" USING btree ("company_id","routine_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "team_skills_company_team_skill_idx" ON "team_skills" USING btree ("company_id","team_id","company_skill_id");--> statement-breakpoint
CREATE INDEX "team_skills_company_team_idx" ON "team_skills" USING btree ("company_id","team_id");--> statement-breakpoint
CREATE INDEX "team_skills_company_skill_idx" ON "team_skills" USING btree ("company_id","company_skill_id");--> statement-breakpoint
CREATE INDEX "team_skills_company_version_idx" ON "team_skills" USING btree ("company_id","version_id");--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_skills" ADD CONSTRAINT "company_skills_forked_from_skill_id_company_skills_id_fk" FOREIGN KEY ("forked_from_skill_id") REFERENCES "public"."company_skills"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_skills" ADD CONSTRAINT "company_skills_forked_from_company_id_companies_id_fk" FOREIGN KEY ("forked_from_company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_skills" ADD CONSTRAINT "company_skills_current_version_id_company_skill_versions_id_fk" FOREIGN KEY ("current_version_id") REFERENCES "public"."company_skill_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_annotation_comments" ADD CONSTRAINT "document_annotation_comments_routine_id_routines_id_fk" FOREIGN KEY ("routine_id") REFERENCES "public"."routines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_annotation_threads" ADD CONSTRAINT "document_annotation_threads_routine_id_routines_id_fk" FOREIGN KEY ("routine_id") REFERENCES "public"."routines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_revisions" ADD CONSTRAINT "document_revisions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instance_settings" ADD CONSTRAINT "instance_settings_default_environment_id_environments_id_fk" FOREIGN KEY ("default_environment_id") REFERENCES "public"."environments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plugin_entities" ADD CONSTRAINT "plugin_entities_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plugin_job_runs" ADD CONSTRAINT "plugin_job_runs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plugin_logs" ADD CONSTRAINT "plugin_logs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plugin_webhook_deliveries" ADD CONSTRAINT "plugin_webhook_deliveries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_operations" ADD CONSTRAINT "workspace_operations_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agents_company_team_idx" ON "agents" USING btree ("company_id","team_id");--> statement-breakpoint
CREATE INDEX "company_skills_company_categories_idx" ON "company_skills" USING gin ("categories");--> statement-breakpoint
CREATE INDEX "company_skills_company_sharing_scope_idx" ON "company_skills" USING btree ("company_id","sharing_scope");--> statement-breakpoint
CREATE INDEX "company_skills_company_current_version_idx" ON "company_skills" USING btree ("company_id","current_version_id");--> statement-breakpoint
CREATE INDEX "company_skills_company_forked_from_idx" ON "company_skills" USING btree ("company_id","forked_from_skill_id");--> statement-breakpoint
CREATE INDEX "document_annotation_comments_company_routine_created_at_idx" ON "document_annotation_comments" USING btree ("company_id","routine_id","created_at");--> statement-breakpoint
CREATE INDEX "document_annotation_threads_company_routine_status_idx" ON "document_annotation_threads" USING btree ("company_id","routine_id","status");--> statement-breakpoint
CREATE INDEX "environments_status_idx" ON "environments" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "environments_local_driver_idx" ON "environments" USING btree ("driver") WHERE "environments"."driver" = 'local';--> statement-breakpoint
CREATE UNIQUE INDEX "environments_managed_sandbox_idx" ON "environments" USING btree ("driver") WHERE "environments"."driver" = 'sandbox' AND ("environments"."metadata" ->> 'managedByPaperclip')::boolean = true;--> statement-breakpoint
CREATE UNIQUE INDEX "environments_name_idx" ON "environments" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "issues_active_task_watchdog_uq" ON "issues" USING btree ("company_id","origin_kind","origin_id") WHERE "issues"."origin_kind" = 'task_watchdog'
          and "issues"."origin_id" is not null
          and "issues"."hidden_at" is null
          and "issues"."status" not in ('done', 'cancelled');--> statement-breakpoint
CREATE INDEX "plugin_entities_company_idx" ON "plugin_entities" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "plugin_job_runs_company_idx" ON "plugin_job_runs" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "plugin_logs_company_idx" ON "plugin_logs" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "plugin_webhook_deliveries_company_idx" ON "plugin_webhook_deliveries" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "projects_company_team_idx" ON "projects" USING btree ("company_id","team_id");--> statement-breakpoint
CREATE INDEX "workspace_operations_company_workspace_issue_started_idx" ON "workspace_operations" USING btree ("company_id","execution_workspace_id","issue_id","started_at");--> statement-breakpoint
ALTER TABLE "environments" DROP COLUMN "company_id";--> statement-breakpoint
ALTER TABLE "plugin_entities" ADD CONSTRAINT "plugin_entities_external_idx" UNIQUE NULLS NOT DISTINCT("company_id","plugin_id","entity_type","external_id");--> statement-breakpoint
ALTER TABLE "document_annotation_comments" ADD CONSTRAINT "document_annotation_comments_exactly_one_owner_chk" CHECK (num_nonnulls("document_annotation_comments"."issue_id", "document_annotation_comments"."routine_id") = 1);--> statement-breakpoint
ALTER TABLE "document_annotation_threads" ADD CONSTRAINT "document_annotation_threads_exactly_one_owner_chk" CHECK (num_nonnulls("document_annotation_threads"."issue_id", "document_annotation_threads"."routine_id") = 1);