CREATE TABLE "admin_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"admin_tg_id" text NOT NULL,
	"action" text NOT NULL,
	"details" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"tg_id" text NOT NULL,
	"role" text DEFAULT 'admin' NOT NULL,
	"name" text,
	"permissions" jsonb,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "admin_users_tg_id_unique" UNIQUE("tg_id")
);
--> statement-breakpoint
CREATE TABLE "analytics_integrations" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"webhook_url" text NOT NULL,
	"events" jsonb DEFAULT '["*"]'::jsonb,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "api_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"token" text NOT NULL,
	"permissions" jsonb DEFAULT '["read_leads"]'::jsonb,
	"created_by" text,
	"is_active" boolean DEFAULT true,
	"last_used_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "api_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"trader_id" text,
	"country" text,
	"sumdep" numeric,
	"tg_id" text,
	"tg_username" text,
	"click_id" text,
	"partner" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "message_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"fields" jsonb DEFAULT '["type","trader_id","country","sumdep","tg_id","tg_username","partner","click_id"]'::jsonb,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "telegram_chats" (
	"id" serial PRIMARY KEY NOT NULL,
	"chat_id" text NOT NULL,
	"title" text,
	"type" text,
	"is_active" boolean DEFAULT true,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "telegram_chats_chat_id_unique" UNIQUE("chat_id")
);
--> statement-breakpoint
CREATE TABLE "telegram_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"partner" text NOT NULL,
	"conversion_type" text,
	"target_chat_id" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
