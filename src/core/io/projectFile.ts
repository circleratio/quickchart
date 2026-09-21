import type { Document } from "../model/document";

const CURRENT_FORMAT_VERSION = 1;

// Placeholder for future schema migrations (see doc/spec.md §3.3) - a no-op
// today since CURRENT_FORMAT_VERSION is still 1. Bump the constant and add
// per-version steps here when the schema first changes.
export function migrateDocument(doc: Document, fromVersion: number): Document {
  if (fromVersion >= CURRENT_FORMAT_VERSION) return doc;
  return { ...doc, formatVersion: CURRENT_FORMAT_VERSION };
}

// The Rust backend passes the Document through as opaque JSON (see
// project_file.rs), so serialization is just identity plus migration.
export function serializeDocument(doc: Document): unknown {
  return doc;
}

export function deserializeDocument(raw: unknown): Document {
  const doc = raw as Document;
  return migrateDocument(doc, doc.formatVersion ?? 0);
}
