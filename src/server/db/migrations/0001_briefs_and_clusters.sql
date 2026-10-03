CREATE TABLE "briefs" (
	"id" text PRIMARY KEY NOT NULL,
	"need_id" text NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	"brief" jsonb NOT NULL,
	"sections" jsonb NOT NULL,
	"markdown" text NOT NULL,
	CONSTRAINT "briefs_need_id_unique" UNIQUE("need_id")
);
--> statement-breakpoint
CREATE TABLE "need_clusters" (
	"id" text PRIMARY KEY NOT NULL,
	"name_pl" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "briefs_generated_at_idx" ON "briefs" USING btree ("generated_at");