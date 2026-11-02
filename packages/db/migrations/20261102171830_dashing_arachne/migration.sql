CREATE TABLE "certificate" (
	"id" varchar(16) PRIMARY KEY,
	"org_id" varchar(16) NOT NULL,
	"user_id" varchar(16) NOT NULL,
	"content_id" varchar(16) NOT NULL,
	"name" text NOT NULL,
	"title" text NOT NULL,
	"issued_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "certificate_person_content" UNIQUE("user_id","content_id")
);
--> statement-breakpoint
ALTER TABLE "certificate" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "certificate" ADD CONSTRAINT "certificate_org_id_organization_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "certificate" ADD CONSTRAINT "certificate_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "certificate" ADD CONSTRAINT "certificate_content_id_content_item_id_fkey" FOREIGN KEY ("content_id") REFERENCES "content_item"("id") ON DELETE CASCADE;--> statement-breakpoint
CREATE POLICY "certificate_tenant" ON "certificate" AS PERMISSIVE FOR ALL TO "ekra_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "certificate" TO ekra_app;
