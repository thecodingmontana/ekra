CREATE TYPE "quiz_question_kind" AS ENUM('multiple_choice', 'fill_blank', 'hotspot');--> statement-breakpoint
CREATE TYPE "quiz_show_answers" AS ENUM('never', 'after_each', 'at_end');--> statement-breakpoint
CREATE TABLE "quiz" (
	"content_id" varchar(16) PRIMARY KEY,
	"org_id" varchar(16) NOT NULL,
	"pass_percent" integer,
	"time_limit_seconds" integer,
	"max_attempts" integer,
	"pool_size" integer,
	"shuffle_questions" boolean DEFAULT false NOT NULL,
	"shuffle_options" boolean DEFAULT true NOT NULL,
	"show_answers" "quiz_show_answers" DEFAULT 'at_end'::"quiz_show_answers" NOT NULL,
	"pass_message" text,
	"fail_message" text,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quiz" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "quiz_attempt" (
	"id" varchar(16) PRIMARY KEY,
	"org_id" varchar(16) NOT NULL,
	"quiz_id" varchar(16) NOT NULL,
	"user_id" varchar(16) NOT NULL,
	"question_ids" text[] NOT NULL,
	"answers" jsonb DEFAULT '{}' NOT NULL,
	"started_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"deadline" timestamp(3) with time zone,
	"submitted_at" timestamp(3) with time zone,
	"score" integer,
	"max_score" integer,
	"passed" boolean
);
--> statement-breakpoint
ALTER TABLE "quiz_attempt" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "quiz_question" (
	"id" varchar(16) PRIMARY KEY,
	"org_id" varchar(16) NOT NULL,
	"quiz_id" varchar(16) NOT NULL,
	"position" integer NOT NULL,
	"kind" "quiz_question_kind" NOT NULL,
	"prompt" text NOT NULL,
	"image" text,
	"payload" jsonb NOT NULL,
	"points" integer DEFAULT 1 NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"explanation" text,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quiz_question" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "quiz_attempt_user_idx" ON "quiz_attempt" ("quiz_id","user_id");--> statement-breakpoint
CREATE INDEX "quiz_question_quiz_idx" ON "quiz_question" ("quiz_id","position");--> statement-breakpoint
ALTER TABLE "quiz" ADD CONSTRAINT "quiz_content_id_content_item_id_fkey" FOREIGN KEY ("content_id") REFERENCES "content_item"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "quiz" ADD CONSTRAINT "quiz_org_id_organization_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "quiz_attempt" ADD CONSTRAINT "quiz_attempt_org_id_organization_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "quiz_attempt" ADD CONSTRAINT "quiz_attempt_quiz_id_content_item_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "content_item"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "quiz_attempt" ADD CONSTRAINT "quiz_attempt_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "quiz_question" ADD CONSTRAINT "quiz_question_org_id_organization_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "quiz_question" ADD CONSTRAINT "quiz_question_quiz_id_content_item_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "content_item"("id") ON DELETE CASCADE;--> statement-breakpoint
CREATE POLICY "quiz_tenant" ON "quiz" AS PERMISSIVE FOR ALL TO "ekra_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "quiz_attempt_tenant" ON "quiz_attempt" AS PERMISSIVE FOR ALL TO "ekra_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "quiz_question_tenant" ON "quiz_question" AS PERMISSIVE FOR ALL TO "ekra_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "quiz", "quiz_question", "quiz_attempt" TO ekra_app;
