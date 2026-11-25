CREATE TABLE "company_mcp_tool_inventory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"server_name" text NOT NULL,
	"tools" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company_mcp_tool_inventory" ADD CONSTRAINT "company_mcp_tool_inventory_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "company_mcp_tool_inventory_company_server_idx" ON "company_mcp_tool_inventory" USING btree ("company_id","server_name");--> statement-breakpoint
CREATE INDEX "company_mcp_tool_inventory_company_idx" ON "company_mcp_tool_inventory" USING btree ("company_id");