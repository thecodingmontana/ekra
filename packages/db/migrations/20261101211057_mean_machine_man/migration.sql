-- the role tenant queries run as (SET LOCAL ROLE inside withOrg); no login, so no password to manage
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ekra_app') THEN
		CREATE ROLE ekra_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
	END IF;
END $$;--> statement-breakpoint
GRANT ekra_app TO CURRENT_USER;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO ekra_app;--> statement-breakpoint
CREATE TYPE "content_kind" AS ENUM('course', 'page', 'quiz', 'assignment', 'path');--> statement-breakpoint
CREATE TYPE "content_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TABLE "content_item" (
	"id" varchar(16) PRIMARY KEY,
	"org_id" varchar(16) NOT NULL,
	"kind" "content_kind" NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" "content_status" DEFAULT 'draft'::"content_status" NOT NULL,
	"created_by" varchar(16),
	"archived_at" timestamp(3) with time zone,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_item" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "content_item_org_idx" ON "content_item" ("org_id","updated_at");--> statement-breakpoint
ALTER TABLE "content_item" ADD CONSTRAINT "content_item_org_id_organization_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "content_item" ADD CONSTRAINT "content_item_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
CREATE POLICY "content_item_tenant" ON "content_item" AS PERMISSIVE FOR ALL TO "ekra_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "content_item" TO ekra_app;
