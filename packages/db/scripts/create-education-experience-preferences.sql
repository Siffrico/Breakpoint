CREATE TABLE IF NOT EXISTS "becoming_education_experience_preference" (
  "user_id" text PRIMARY KEY NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "version" integer DEFAULT 1 NOT NULL,
  "customization_json" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone
);
