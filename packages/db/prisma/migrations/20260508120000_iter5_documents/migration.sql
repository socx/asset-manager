-- Migration: add documents table for ITER-5
CREATE TABLE documents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  filename text NOT NULL,
  storage_key text NOT NULL,
  mime_type text NOT NULL,
  size integer NOT NULL,
  uploaded_by uuid NULL,
  asset_id uuid NULL,
  metadata jsonb NULL,
  is_public boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT documents_pkey PRIMARY KEY (id)
);

CREATE INDEX documents_asset_id_idx ON documents (asset_id);
CREATE INDEX documents_uploaded_by_idx ON documents (uploaded_by);

-- Foreign keys
ALTER TABLE documents
  ADD CONSTRAINT documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE documents
  ADD CONSTRAINT documents_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES property_assets(id) ON DELETE CASCADE;
