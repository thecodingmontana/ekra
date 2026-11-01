CREATE TABLE "content_version" (
	"id" varchar(16) PRIMARY KEY,
	"org_id" varchar(16) NOT NULL,
	"content_id" varchar(16) NOT NULL,
	"title" text NOT NULL,
	"doc" jsonb NOT NULL,
	"body_text" text NOT NULL,
	"author_id" varchar(16),
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_version" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "content_item" ADD COLUMN "doc" jsonb;--> statement-breakpoint
ALTER TABLE "content_item" ADD COLUMN "body_text" text;--> statement-breakpoint
CREATE INDEX "content_version_content_idx" ON "content_version" ("content_id","updated_at");--> statement-breakpoint
ALTER TABLE "content_version" ADD CONSTRAINT "content_version_org_id_organization_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "content_version" ADD CONSTRAINT "content_version_content_id_content_item_id_fkey" FOREIGN KEY ("content_id") REFERENCES "content_item"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "content_version" ADD CONSTRAINT "content_version_author_id_user_id_fkey" FOREIGN KEY ("author_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
CREATE POLICY "content_version_tenant" ON "content_version" AS PERMISSIVE FOR ALL TO "ekra_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "content_version" TO ekra_app;
