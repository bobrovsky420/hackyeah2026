CREATE TABLE "contact_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"route_id" text,
	"need_id" text,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"requester" jsonb NOT NULL,
	"message" text NOT NULL,
	"screening" jsonb NOT NULL,
	"consent" jsonb NOT NULL,
	"moderation_status" text NOT NULL,
	"moderation_reviewer" text,
	"moderation_decided_at" timestamp with time zone,
	"moderation_reason_pl" text,
	"status" text NOT NULL,
	"note_pl" text
);
--> statement-breakpoint
CREATE TABLE "content_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"reason" text NOT NULL,
	"comment" text,
	"moderation_status" text NOT NULL,
	"moderation_reviewer" text,
	"moderation_decided_at" timestamp with time zone,
	"moderation_reason_pl" text
);
--> statement-breakpoint
CREATE TABLE "event_counters" (
	"name" text PRIMARY KEY NOT NULL,
	"count" bigint NOT NULL,
	"since" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"seq" bigserial PRIMARY KEY NOT NULL,
	"route_id" text NOT NULL,
	"value" text NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generated_briefs" (
	"need_id" text PRIMARY KEY NOT NULL,
	"generated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderation_log" (
	"seq" bigserial PRIMARY KEY NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"reviewer" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"action" text NOT NULL,
	"status" text,
	"reason_pl" text,
	"note_pl" text
);
--> statement-breakpoint
CREATE TABLE "needs" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"route_id" text,
	"problem_text" text NOT NULL,
	"summary_pl" text,
	"place_terc" text,
	"role" text,
	"target_groups" text[] DEFAULT '{}'::text[] NOT NULL,
	"domains" text[] DEFAULT '{}'::text[] NOT NULL,
	"reporter" jsonb NOT NULL,
	"consent_store" boolean NOT NULL,
	"consent_publish" boolean NOT NULL,
	"consent_contact" boolean NOT NULL,
	"consent_text_version" text NOT NULL,
	"consent_at" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"moderation_status" text NOT NULL,
	"moderation_reviewer" text,
	"moderation_decided_at" timestamp with time zone,
	"moderation_reason_pl" text,
	"cluster_id" text,
	"nearest_matches" jsonb NOT NULL,
	"brief_id" text,
	"note_pl" text,
	"example" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "readiness" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"display_name" text NOT NULL,
	"is_organisation" boolean NOT NULL,
	"place_terc" text,
	"topics" text[] DEFAULT '{}'::text[] NOT NULL,
	"channel" jsonb NOT NULL,
	"consent_display_name" boolean NOT NULL,
	"consent" jsonb NOT NULL,
	"verification_status" text NOT NULL,
	"verification_reviewer" text,
	"verification_decided_at" timestamp with time zone,
	"retention_until" date NOT NULL,
	"note_pl" text,
	"example" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routes" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"mode" text NOT NULL,
	"place_terc" text,
	"route" jsonb NOT NULL,
	"decline_reviewed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "screening_log" (
	"seq" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"kind" text NOT NULL,
	"category" text NOT NULL,
	"confidence" double precision NOT NULL,
	"outcome" text NOT NULL,
	"sensitive_topics" text[] DEFAULT '{}'::text[] NOT NULL,
	"redaction_count" integer NOT NULL,
	"rules_fired" text[] DEFAULT '{}'::text[] NOT NULL,
	"prompt_version" text,
	"text_sha256" text NOT NULL,
	"text" text,
	"text_until" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "contact_requests_created_at_idx" ON "contact_requests" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "contact_requests_status_idx" ON "contact_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "contact_requests_moderation_status_idx" ON "contact_requests" USING btree ("moderation_status");--> statement-breakpoint
CREATE INDEX "content_reports_created_at_idx" ON "content_reports" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "content_reports_moderation_status_idx" ON "content_reports" USING btree ("moderation_status");--> statement-breakpoint
CREATE INDEX "feedback_route_id_idx" ON "feedback" USING btree ("route_id");--> statement-breakpoint
CREATE INDEX "moderation_log_ts_idx" ON "moderation_log" USING btree ("ts");--> statement-breakpoint
CREATE INDEX "needs_created_at_idx" ON "needs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "needs_status_idx" ON "needs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "needs_moderation_status_idx" ON "needs" USING btree ("moderation_status");--> statement-breakpoint
CREATE INDEX "needs_place_terc_idx" ON "needs" USING btree ("place_terc");--> statement-breakpoint
CREATE INDEX "needs_target_groups_idx" ON "needs" USING gin ("target_groups");--> statement-breakpoint
CREATE INDEX "readiness_created_at_idx" ON "readiness" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "readiness_verification_status_idx" ON "readiness" USING btree ("verification_status");--> statement-breakpoint
CREATE INDEX "readiness_place_terc_idx" ON "readiness" USING btree ("place_terc");--> statement-breakpoint
CREATE INDEX "routes_created_at_idx" ON "routes" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "routes_mode_idx" ON "routes" USING btree ("mode");--> statement-breakpoint
CREATE INDEX "routes_place_terc_idx" ON "routes" USING btree ("place_terc");--> statement-breakpoint
CREATE INDEX "screening_log_at_idx" ON "screening_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "screening_log_text_until_idx" ON "screening_log" USING btree ("text_until");