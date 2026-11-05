CREATE TABLE "ai_chat" (
	"id" varchar(40) PRIMARY KEY,
	"org_id" varchar(16) NOT NULL,
	"user_id" varchar(16) NOT NULL,
	"title" text DEFAULT 'New chat' NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_chat_person" UNIQUE("org_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "ai_chat" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ai_key" (
	"user_id" varchar(16),
	"provider" varchar(24),
	"cipher" text NOT NULL,
	"hint" varchar(8) NOT NULL,
	"model" varchar(160) DEFAULT '' NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_key_pkey" PRIMARY KEY("user_id","provider")
);
--> statement-breakpoint
CREATE TABLE "ai_message" (
	"id" varchar(16) PRIMARY KEY,
	"org_id" varchar(16) NOT NULL,
	"chat_id" varchar(40) NOT NULL,
	"position" integer NOT NULL,
	"role" varchar(16) NOT NULL,
	"content" jsonb,
	"tool_calls" jsonb,
	"tool_call_id" varchar(120),
	"model" varchar(160),
	"extra" jsonb,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_message" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ai_model" (
	"id" varchar(160) PRIMARY KEY,
	"rank" integer,
	"context" integer,
	"ranked_at" timestamp(3) with time zone,
	"cooldown_until" timestamp(3) with time zone,
	"last_error" text,
	"failures" integer DEFAULT 0 NOT NULL,
	"successes" integer DEFAULT 0 NOT NULL,
	"last_ms" integer,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage" (
	"user_id" varchar(16),
	"day" varchar(10),
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ai_usage_pkey" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
CREATE INDEX "ai_message_chat_idx" ON "ai_message" ("chat_id","position");--> statement-breakpoint
ALTER TABLE "ai_chat" ADD CONSTRAINT "ai_chat_org_id_organization_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "ai_chat" ADD CONSTRAINT "ai_chat_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "ai_key" ADD CONSTRAINT "ai_key_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "ai_message" ADD CONSTRAINT "ai_message_org_id_organization_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "ai_message" ADD CONSTRAINT "ai_message_chat_id_ai_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "ai_chat"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
CREATE POLICY "ai_chat_tenant" ON "ai_chat" AS PERMISSIVE FOR ALL TO "ekra_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "ai_message_tenant" ON "ai_message" AS PERMISSIVE FOR ALL TO "ekra_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
-- chats are read and written inside withOrg (the ekra_app role); the other assistant tables are not tenant data
GRANT SELECT, INSERT, UPDATE, DELETE ON "ai_chat", "ai_message" TO ekra_app;
