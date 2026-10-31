CREATE TABLE "two_factor" (
	"id" varchar(16) PRIMARY KEY,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"user_id" varchar(16) NOT NULL,
	"verified" boolean DEFAULT true,
	"failed_verification_count" integer DEFAULT 0,
	"locked_until" timestamp(3) with time zone
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "two_factor_enabled" boolean DEFAULT false;--> statement-breakpoint
CREATE INDEX "two_factor_secret_idx" ON "two_factor" ("secret");--> statement-breakpoint
CREATE INDEX "two_factor_user_id_idx" ON "two_factor" ("user_id");--> statement-breakpoint
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;