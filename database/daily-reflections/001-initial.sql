BEGIN;

CREATE TABLE daily_reflections (
    id text PRIMARY KEY CHECK (id ~ '[^[:space:]]'),
    reading_date date NOT NULL UNIQUE,
    title text NOT NULL CHECK (title ~ '[^[:space:]]'),
    body text NOT NULL CHECK (body ~ '[^[:space:]]'),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION set_reflection_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER daily_reflections_updated_at
BEFORE UPDATE ON daily_reflections
FOR EACH ROW EXECUTE FUNCTION set_reflection_updated_at();

COMMIT;
