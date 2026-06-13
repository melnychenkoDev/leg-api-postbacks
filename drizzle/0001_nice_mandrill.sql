ALTER TABLE "message_settings" ALTER COLUMN "fields" SET DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "wtd_status" text;