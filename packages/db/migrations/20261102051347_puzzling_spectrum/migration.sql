ALTER TABLE "media_asset" ADD COLUMN "upload_id" text;--> statement-breakpoint
ALTER TABLE "media_asset" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "media_asset" ADD COLUMN "locked_until" timestamp(3) with time zone;--> statement-breakpoint
CREATE INDEX "media_asset_jobs_idx" ON "media_asset" ("status","locked_until");