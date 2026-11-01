CREATE TABLE "media_asset" (
	"id" varchar(16) PRIMARY KEY,
	"org_id" varchar(16) NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"placeholder" text NOT NULL,
	"files" jsonb NOT NULL,
	"created_by" varchar(16),
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media_asset" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "media_asset_org_idx" ON "media_asset" ("org_id");--> statement-breakpoint
ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_org_id_organization_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
CREATE POLICY "media_asset_tenant" ON "media_asset" AS PERMISSIVE FOR ALL TO "ekra_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "media_asset" TO ekra_app;
