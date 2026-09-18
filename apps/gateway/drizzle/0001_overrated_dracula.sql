ALTER TABLE "llm_requests" ADD COLUMN "served_model" varchar(100);--> statement-breakpoint
UPDATE "llm_requests" SET "served_model" = "model" WHERE "served_model" IS NULL;--> statement-breakpoint
ALTER TABLE "llm_requests" ALTER COLUMN "served_model" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "models" ADD COLUMN "fallback_model_id" varchar(100);
