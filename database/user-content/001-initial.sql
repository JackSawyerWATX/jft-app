BEGIN;

-- IDs match the anonymous owners issued by the app's signed session cookies.
-- This table does not introduce login accounts or account recovery.
CREATE TABLE content_owners (
    id uuid PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE shares (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id uuid NOT NULL REFERENCES content_owners(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    kind text NOT NULL DEFAULT 'text' CHECK (kind = 'text'),
    text text NOT NULL CHECK (text ~ '[^[:space:]]' AND char_length(text) <= 10000),
    -- Deliberately no foreign key across databases. Preserve the original reading.
    reflection_id text NOT NULL CHECK (reflection_id ~ '[^[:space:]]'),
    reflection_date date NOT NULL,
    reflection_title text NOT NULL CHECK (reflection_title ~ '[^[:space:]]'),
    reflection_body text NOT NULL CHECK (reflection_body ~ '[^[:space:]]')
);

CREATE INDEX shares_owner_history_idx ON shares (owner_id, created_at DESC, id DESC);

COMMIT;
