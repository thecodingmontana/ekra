ALTER TYPE "lesson_kind" ADD VALUE 'quiz';--> statement-breakpoint
ALTER TABLE "content_item" ADD COLUMN "sequential" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "lesson" ADD COLUMN "quiz_id" varchar(16);--> statement-breakpoint
ALTER TABLE "lesson" ADD CONSTRAINT "lesson_quiz_id_content_item_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "content_item"("id") ON DELETE SET NULL;