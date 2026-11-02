ALTER TABLE "content_item" ADD COLUMN "tags" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "content_item" ADD COLUMN "cover" text;--> statement-breakpoint
CREATE INDEX "content_item_tags_idx" ON "content_item" USING gin ("tags");