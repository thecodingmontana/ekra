CREATE TYPE "lesson_kind" AS ENUM('video', 'page');--> statement-breakpoint
CREATE TYPE "media_kind" AS ENUM('image', 'video');--> statement-breakpoint
CREATE TYPE "media_status" AS ENUM('uploading', 'processing', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "course_section" (
	"id" varchar(16) PRIMARY KEY,
	"org_id" varchar(16) NOT NULL,
	"course_id" varchar(16) NOT NULL,
	"title" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "course_section" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "lesson" (
	"id" varchar(16) PRIMARY KEY,
	"org_id" varchar(16) NOT NULL,
	"course_id" varchar(16) NOT NULL,
	"section_id" varchar(16) NOT NULL,
	"kind" "lesson_kind" NOT NULL,
	"title" text NOT NULL,
	"position" integer NOT NULL,
	"doc" jsonb,
	"body_text" text,
	"body_updated_at" timestamp(3) with time zone,
	"media_id" varchar(16),
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lesson" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "lesson_progress" (
	"org_id" varchar(16) NOT NULL,
	"user_id" varchar(16),
	"lesson_id" varchar(16),
	"course_id" varchar(16) NOT NULL,
	"position_seconds" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp(3) with time zone,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_progress_pkey" PRIMARY KEY("user_id","lesson_id")
);
--> statement-breakpoint
ALTER TABLE "lesson_progress" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "media_asset" ADD COLUMN "kind" "media_kind" DEFAULT 'image'::"media_kind" NOT NULL;--> statement-breakpoint
ALTER TABLE "media_asset" ADD COLUMN "status" "media_status" DEFAULT 'ready'::"media_status" NOT NULL;--> statement-breakpoint
ALTER TABLE "media_asset" ADD COLUMN "duration_seconds" integer;--> statement-breakpoint
ALTER TABLE "media_asset" ADD COLUMN "original_key" text;--> statement-breakpoint
ALTER TABLE "media_asset" ADD COLUMN "error" text;--> statement-breakpoint
ALTER TABLE "media_asset" ADD COLUMN "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "media_asset" ALTER COLUMN "width" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "media_asset" ALTER COLUMN "height" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "media_asset" ALTER COLUMN "placeholder" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "media_asset" ALTER COLUMN "files" SET DEFAULT '[]';--> statement-breakpoint
CREATE INDEX "course_section_course_idx" ON "course_section" ("course_id","position");--> statement-breakpoint
CREATE INDEX "lesson_section_idx" ON "lesson" ("section_id","position");--> statement-breakpoint
CREATE INDEX "lesson_course_idx" ON "lesson" ("course_id");--> statement-breakpoint
CREATE INDEX "lesson_progress_course_idx" ON "lesson_progress" ("user_id","course_id");--> statement-breakpoint
ALTER TABLE "course_section" ADD CONSTRAINT "course_section_org_id_organization_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "course_section" ADD CONSTRAINT "course_section_course_id_content_item_id_fkey" FOREIGN KEY ("course_id") REFERENCES "content_item"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "lesson" ADD CONSTRAINT "lesson_org_id_organization_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "lesson" ADD CONSTRAINT "lesson_course_id_content_item_id_fkey" FOREIGN KEY ("course_id") REFERENCES "content_item"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "lesson" ADD CONSTRAINT "lesson_section_id_course_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "course_section"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "lesson" ADD CONSTRAINT "lesson_media_id_media_asset_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media_asset"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_org_id_organization_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_lesson_id_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lesson"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_course_id_content_item_id_fkey" FOREIGN KEY ("course_id") REFERENCES "content_item"("id") ON DELETE CASCADE;--> statement-breakpoint
CREATE POLICY "course_section_tenant" ON "course_section" AS PERMISSIVE FOR ALL TO "ekra_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "lesson_tenant" ON "lesson" AS PERMISSIVE FOR ALL TO "ekra_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "lesson_progress_tenant" ON "lesson_progress" AS PERMISSIVE FOR ALL TO "ekra_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "course_section", "lesson", "lesson_progress" TO ekra_app;
