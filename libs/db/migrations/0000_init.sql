CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingredient_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"alias" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingredients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"canonical_unit" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ingredients_user_id_id_key" UNIQUE("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "pack_sizes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"amount" numeric NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unit_conversions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"unit" text NOT NULL,
	"factor" numeric NOT NULL,
	CONSTRAINT "unit_conversions_ingredient_id_unit_key" UNIQUE("ingredient_id","unit")
);
--> statement-breakpoint
CREATE TABLE "recipe_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"recipe_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"amount" numeric NOT NULL,
	"unit" text NOT NULL,
	"canonical_amount" numeric NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "recipe_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"recipe_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"text" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe_tags" (
	"user_id" text NOT NULL,
	"recipe_id" uuid NOT NULL,
	"tag" text NOT NULL,
	CONSTRAINT "recipe_tags_pkey" PRIMARY KEY("recipe_id","tag")
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"servings" integer NOT NULL,
	"source_url" text,
	"archived_at" timestamp with time zone,
	"imported_from_user_id" text,
	"imported_from_recipe_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipes_user_id_id_key" UNIQUE("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "share_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"recipe_id" uuid NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "share_links_token_key" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "plan_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"week_plan_id" uuid NOT NULL,
	"recipe_id" uuid NOT NULL,
	"servings" integer NOT NULL,
	"day" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_entries_user_id_id_key" UNIQUE("user_id","id"),
	CONSTRAINT "plan_entries_servings_check" CHECK ("plan_entries"."servings" > 0),
	CONSTRAINT "plan_entries_day_check" CHECK ("plan_entries"."day" between 1 and 7)
);
--> statement-breakpoint
CREATE TABLE "week_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"week_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "week_plans_user_id_id_key" UNIQUE("user_id","id"),
	CONSTRAINT "week_plans_user_id_week_key_key" UNIQUE("user_id","week_key")
);
--> statement-breakpoint
CREATE TABLE "list_extras" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"week_plan_id" uuid NOT NULL,
	"text" text NOT NULL,
	"checked" boolean DEFAULT false NOT NULL,
	"client_updated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "list_item_states" (
	"user_id" text NOT NULL,
	"week_plan_id" uuid NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"checked" boolean NOT NULL,
	"client_updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "list_item_states_pkey" PRIMARY KEY("week_plan_id","ingredient_id")
);
--> statement-breakpoint
CREATE TABLE "cook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"plan_entry_id" uuid NOT NULL,
	"cooked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rating" smallint,
	CONSTRAINT "cook_events_rating_check" CHECK ("cook_events"."rating" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "week_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"week_plan_id" uuid NOT NULL,
	"taken_at" timestamp with time zone DEFAULT now() NOT NULL,
	"evaluation" jsonb NOT NULL,
	CONSTRAINT "week_snapshots_week_plan_id_key" UNIQUE("week_plan_id")
);
--> statement-breakpoint
CREATE TABLE "taste_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ingredient_aliases" ADD CONSTRAINT "ingredient_aliases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredient_aliases" ADD CONSTRAINT "ingredient_aliases_ingredient_fk" FOREIGN KEY ("user_id","ingredient_id") REFERENCES "public"."ingredients"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_sizes" ADD CONSTRAINT "pack_sizes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_sizes" ADD CONSTRAINT "pack_sizes_ingredient_fk" FOREIGN KEY ("user_id","ingredient_id") REFERENCES "public"."ingredients"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_conversions" ADD CONSTRAINT "unit_conversions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_conversions" ADD CONSTRAINT "unit_conversions_ingredient_fk" FOREIGN KEY ("user_id","ingredient_id") REFERENCES "public"."ingredients"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_lines" ADD CONSTRAINT "recipe_lines_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_lines" ADD CONSTRAINT "recipe_lines_recipe_fk" FOREIGN KEY ("user_id","recipe_id") REFERENCES "public"."recipes"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_lines" ADD CONSTRAINT "recipe_lines_ingredient_fk" FOREIGN KEY ("user_id","ingredient_id") REFERENCES "public"."ingredients"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_steps" ADD CONSTRAINT "recipe_steps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_steps" ADD CONSTRAINT "recipe_steps_recipe_fk" FOREIGN KEY ("user_id","recipe_id") REFERENCES "public"."recipes"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_tags" ADD CONSTRAINT "recipe_tags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_tags" ADD CONSTRAINT "recipe_tags_recipe_fk" FOREIGN KEY ("user_id","recipe_id") REFERENCES "public"."recipes"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_recipe_fk" FOREIGN KEY ("user_id","recipe_id") REFERENCES "public"."recipes"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_entries" ADD CONSTRAINT "plan_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_entries" ADD CONSTRAINT "plan_entries_week_plan_fk" FOREIGN KEY ("user_id","week_plan_id") REFERENCES "public"."week_plans"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_entries" ADD CONSTRAINT "plan_entries_recipe_fk" FOREIGN KEY ("user_id","recipe_id") REFERENCES "public"."recipes"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week_plans" ADD CONSTRAINT "week_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_extras" ADD CONSTRAINT "list_extras_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_extras" ADD CONSTRAINT "list_extras_week_plan_fk" FOREIGN KEY ("user_id","week_plan_id") REFERENCES "public"."week_plans"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_item_states" ADD CONSTRAINT "list_item_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_item_states" ADD CONSTRAINT "list_item_states_week_plan_fk" FOREIGN KEY ("user_id","week_plan_id") REFERENCES "public"."week_plans"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_item_states" ADD CONSTRAINT "list_item_states_ingredient_fk" FOREIGN KEY ("user_id","ingredient_id") REFERENCES "public"."ingredients"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cook_events" ADD CONSTRAINT "cook_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cook_events" ADD CONSTRAINT "cook_events_plan_entry_fk" FOREIGN KEY ("user_id","plan_entry_id") REFERENCES "public"."plan_entries"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week_snapshots" ADD CONSTRAINT "week_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week_snapshots" ADD CONSTRAINT "week_snapshots_week_plan_fk" FOREIGN KEY ("user_id","week_plan_id") REFERENCES "public"."week_plans"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taste_profiles" ADD CONSTRAINT "taste_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ingredient_aliases_user_id_idx" ON "ingredient_aliases" USING btree ("user_id","ingredient_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ingredient_aliases_ingredient_id_alias_key" ON "ingredient_aliases" USING btree ("ingredient_id",lower("alias"));--> statement-breakpoint
CREATE UNIQUE INDEX "ingredients_user_id_name_key" ON "ingredients" USING btree ("user_id",lower("name"));--> statement-breakpoint
CREATE INDEX "pack_sizes_user_id_idx" ON "pack_sizes" USING btree ("user_id","ingredient_id");--> statement-breakpoint
CREATE INDEX "unit_conversions_user_id_idx" ON "unit_conversions" USING btree ("user_id","ingredient_id");--> statement-breakpoint
CREATE INDEX "recipe_lines_user_id_idx" ON "recipe_lines" USING btree ("user_id","recipe_id");--> statement-breakpoint
CREATE INDEX "recipe_lines_user_id_ingredient_id_idx" ON "recipe_lines" USING btree ("user_id","ingredient_id");--> statement-breakpoint
CREATE INDEX "recipe_steps_user_id_idx" ON "recipe_steps" USING btree ("user_id","recipe_id");--> statement-breakpoint
CREATE INDEX "recipe_tags_user_id_tag_idx" ON "recipe_tags" USING btree ("user_id","tag");--> statement-breakpoint
CREATE INDEX "recipes_user_id_title_idx" ON "recipes" USING btree ("user_id","title");--> statement-breakpoint
CREATE INDEX "share_links_user_id_idx" ON "share_links" USING btree ("user_id","recipe_id");--> statement-breakpoint
CREATE INDEX "plan_entries_user_id_week_plan_id_idx" ON "plan_entries" USING btree ("user_id","week_plan_id");--> statement-breakpoint
CREATE INDEX "plan_entries_user_id_recipe_id_idx" ON "plan_entries" USING btree ("user_id","recipe_id");--> statement-breakpoint
CREATE INDEX "list_extras_user_id_idx" ON "list_extras" USING btree ("user_id","week_plan_id");--> statement-breakpoint
CREATE INDEX "list_item_states_user_id_idx" ON "list_item_states" USING btree ("user_id","week_plan_id");--> statement-breakpoint
CREATE INDEX "cook_events_user_id_cooked_at_idx" ON "cook_events" USING btree ("user_id","cooked_at");--> statement-breakpoint
CREATE INDEX "cook_events_user_id_plan_entry_id_idx" ON "cook_events" USING btree ("user_id","plan_entry_id");--> statement-breakpoint
CREATE INDEX "week_snapshots_user_id_idx" ON "week_snapshots" USING btree ("user_id","taken_at");