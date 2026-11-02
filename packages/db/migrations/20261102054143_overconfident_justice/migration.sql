CREATE TYPE "enrollment_source" AS ENUM('assigned', 'self');--> statement-breakpoint
CREATE TABLE "content_completion" (
	"org_id" varchar(16) NOT NULL,
	"user_id" varchar(16),
	"content_id" varchar(16),
	"completed_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_completion_pkey" PRIMARY KEY("user_id","content_id")
);
--> statement-breakpoint
ALTER TABLE "content_completion" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "enrollment" (
	"id" varchar(16) PRIMARY KEY,
	"org_id" varchar(16) NOT NULL,
	"content_id" varchar(16) NOT NULL,
	"user_id" varchar(16) NOT NULL,
	"source" "enrollment_source" DEFAULT 'assigned'::"enrollment_source" NOT NULL,
	"assigned_by" varchar(16),
	"start_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"due_at" timestamp(3) with time zone,
	"reminded_at" timestamp(3) with time zone,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enrollment_person_content" UNIQUE("content_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "enrollment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "path_stage" (
	"id" varchar(16) PRIMARY KEY,
	"org_id" varchar(16) NOT NULL,
	"path_id" varchar(16) NOT NULL,
	"title" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "path_stage" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "path_step" (
	"id" varchar(16) PRIMARY KEY,
	"org_id" varchar(16) NOT NULL,
	"path_id" varchar(16) NOT NULL,
	"stage_id" varchar(16) NOT NULL,
	"content_id" varchar(16) NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "path_step_once" UNIQUE("path_id","content_id")
);
--> statement-breakpoint
ALTER TABLE "path_step" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "enrollment_user_idx" ON "enrollment" ("user_id");--> statement-breakpoint
CREATE INDEX "path_stage_path_idx" ON "path_stage" ("path_id","position");--> statement-breakpoint
CREATE INDEX "path_step_stage_idx" ON "path_step" ("stage_id","position");--> statement-breakpoint
ALTER TABLE "content_completion" ADD CONSTRAINT "content_completion_org_id_organization_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "content_completion" ADD CONSTRAINT "content_completion_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "content_completion" ADD CONSTRAINT "content_completion_content_id_content_item_id_fkey" FOREIGN KEY ("content_id") REFERENCES "content_item"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "enrollment" ADD CONSTRAINT "enrollment_org_id_organization_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "enrollment" ADD CONSTRAINT "enrollment_content_id_content_item_id_fkey" FOREIGN KEY ("content_id") REFERENCES "content_item"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "enrollment" ADD CONSTRAINT "enrollment_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "enrollment" ADD CONSTRAINT "enrollment_assigned_by_user_id_fkey" FOREIGN KEY ("assigned_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "path_stage" ADD CONSTRAINT "path_stage_org_id_organization_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "path_stage" ADD CONSTRAINT "path_stage_path_id_content_item_id_fkey" FOREIGN KEY ("path_id") REFERENCES "content_item"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "path_step" ADD CONSTRAINT "path_step_org_id_organization_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "path_step" ADD CONSTRAINT "path_step_path_id_content_item_id_fkey" FOREIGN KEY ("path_id") REFERENCES "content_item"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "path_step" ADD CONSTRAINT "path_step_stage_id_path_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "path_stage"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "path_step" ADD CONSTRAINT "path_step_content_id_content_item_id_fkey" FOREIGN KEY ("content_id") REFERENCES "content_item"("id") ON DELETE CASCADE;--> statement-breakpoint
CREATE POLICY "content_completion_tenant" ON "content_completion" AS PERMISSIVE FOR ALL TO "ekra_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "enrollment_tenant" ON "enrollment" AS PERMISSIVE FOR ALL TO "ekra_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "path_stage_tenant" ON "path_stage" AS PERMISSIVE FOR ALL TO "ekra_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "path_step_tenant" ON "path_step" AS PERMISSIVE FOR ALL TO "ekra_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "enrollment", "content_completion", "path_stage", "path_step" TO ekra_app;
