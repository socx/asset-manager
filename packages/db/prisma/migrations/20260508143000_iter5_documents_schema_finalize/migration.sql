-- Migration: finalize ITER-5 document schema

-- Rename existing columns to new semantic names
ALTER TABLE documents RENAME COLUMN filename TO file_name;
ALTER TABLE documents RENAME COLUMN storage_key TO storage_path;
ALTER TABLE documents RENAME COLUMN size TO file_size_bytes;
ALTER TABLE documents RENAME COLUMN uploaded_by TO uploaded_by_id;
ALTER TABLE documents RENAME COLUMN asset_id TO related_asset_id;

-- New columns required by ITER-5
ALTER TABLE documents ADD COLUMN title text;
ALTER TABLE documents ADD COLUMN document_type_id uuid NULL;
ALTER TABLE documents ADD COLUMN owner_id uuid NULL;
ALTER TABLE documents ADD COLUMN description text NULL;
ALTER TABLE documents ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE documents ADD COLUMN deleted_at timestamptz NULL;

-- Backfill sensible defaults for existing rows
UPDATE documents SET title = file_name WHERE title IS NULL;
UPDATE documents SET owner_id = uploaded_by_id WHERE owner_id IS NULL;

ALTER TABLE documents ALTER COLUMN title SET NOT NULL;

-- Replace old indexes with ITER-5 indexes
DROP INDEX IF EXISTS documents_asset_id_idx;
DROP INDEX IF EXISTS documents_uploaded_by_idx;

CREATE INDEX documents_owner_id_idx ON documents (owner_id);
CREATE INDEX documents_uploaded_by_id_idx ON documents (uploaded_by_id);
CREATE INDEX documents_related_asset_id_idx ON documents (related_asset_id);
CREATE INDEX documents_document_type_id_idx ON documents (document_type_id);
CREATE INDEX documents_deleted_at_idx ON documents (deleted_at);

-- Replace old foreign keys with renamed columns and new refs
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_uploaded_by_fkey;
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_asset_id_fkey;

ALTER TABLE documents
  ADD CONSTRAINT documents_uploaded_by_id_fkey FOREIGN KEY (uploaded_by_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE documents
  ADD CONSTRAINT documents_related_asset_id_fkey FOREIGN KEY (related_asset_id) REFERENCES property_assets(id) ON DELETE CASCADE;
ALTER TABLE documents
  ADD CONSTRAINT documents_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE documents
  ADD CONSTRAINT documents_document_type_id_fkey FOREIGN KEY (document_type_id) REFERENCES lookup_items(id) ON DELETE SET NULL;
