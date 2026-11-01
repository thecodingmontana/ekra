CREATE TABLE "content_favorite" (
	"org_id" varchar(16) NOT NULL,
	"user_id" varchar(16),
	"content_id" varchar(16),
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_favorite_pkey" PRIMARY KEY("user_id","content_id")
);
--> statement-breakpoint
ALTER TABLE "content_favorite" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "content_view" (
	"org_id" varchar(16) NOT NULL,
	"user_id" varchar(16),
	"content_id" varchar(16),
	"viewed_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_view_pkey" PRIMARY KEY("user_id","content_id")
);
--> statement-breakpoint
ALTER TABLE "content_view" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "content_item" ADD COLUMN "parent_id" varchar(16);--> statement-breakpoint
ALTER TABLE "content_item" ADD COLUMN "is_template" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "content_item" ALTER COLUMN "kind" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "content_kind";--> statement-breakpoint
CREATE TYPE "content_kind" AS ENUM('folder', 'page', 'course', 'quiz', 'assignment', 'path', 'wiki');--> statement-breakpoint
ALTER TABLE "content_item" ALTER COLUMN "kind" SET DATA TYPE "content_kind" USING "kind"::"content_kind";--> statement-breakpoint
CREATE INDEX "content_item_parent_idx" ON "content_item" ("parent_id");--> statement-breakpoint
CREATE INDEX "content_view_user_idx" ON "content_view" ("user_id","viewed_at");--> statement-breakpoint
ALTER TABLE "content_favorite" ADD CONSTRAINT "content_favorite_org_id_organization_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "content_favorite" ADD CONSTRAINT "content_favorite_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "content_favorite" ADD CONSTRAINT "content_favorite_content_id_content_item_id_fkey" FOREIGN KEY ("content_id") REFERENCES "content_item"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "content_item" ADD CONSTRAINT "content_item_parent_id_content_item_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "content_item"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "content_view" ADD CONSTRAINT "content_view_org_id_organization_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "content_view" ADD CONSTRAINT "content_view_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "content_view" ADD CONSTRAINT "content_view_content_id_content_item_id_fkey" FOREIGN KEY ("content_id") REFERENCES "content_item"("id") ON DELETE CASCADE;--> statement-breakpoint
CREATE POLICY "content_favorite_tenant" ON "content_favorite" AS PERMISSIVE FOR ALL TO "ekra_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "content_view_tenant" ON "content_view" AS PERMISSIVE FOR ALL TO "ekra_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "content_favorite", "content_view" TO ekra_app;--> statement-breakpoint
-- who made a piece of content, shown in the library; nothing else of the user row
GRANT SELECT ("id", "name", "image") ON "user" TO ekra_app;
