CREATE TYPE "organization_kind" AS ENUM('company', 'creator');--> statement-breakpoint
CREATE TABLE "organization" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"name" varchar(120) NOT NULL,
	"slug" varchar(48) NOT NULL UNIQUE,
	"kind" "organization_kind" DEFAULT 'company'::"organization_kind" NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
);
