import type { Document } from "../model/document";
import type { ProjectFile } from "../model/project";
import { PROJECT_FORMAT_VERSION, createDocumentTab } from "../model/project";

// Shape of a project file saved before multi-tab support (doc/spec.md §3.3):
// a bare Document, versioned on its own, directly at the file's top level.
interface LegacyDocumentFile {
  formatVersion: number;
  shapes: Document["shapes"];
  layers: Document["layers"];
  structuredBlocks: Document["structuredBlocks"];
  colorThemeId: Document["colorThemeId"];
}

function isLegacyDocumentFile(raw: unknown): raw is LegacyDocumentFile {
  return typeof raw === "object" && raw !== null && !("tabs" in (raw as Record<string, unknown>));
}

// Placeholder for future schema migrations (see doc/spec.md §3.3) - a no-op
// today since PROJECT_FORMAT_VERSION is still 1. Bump the constant and add
// per-version steps here when the schema first changes (applied uniformly to
// every tab's Document, since one formatVersion covers the whole file).
export function migrateProjectFile(file: ProjectFile, fromVersion: number): ProjectFile {
  if (fromVersion >= PROJECT_FORMAT_VERSION) return file;
  return { ...file, formatVersion: PROJECT_FORMAT_VERSION };
}

// The Rust backend passes the file through as opaque JSON (see
// project_file.rs), so serialization is just identity plus migration.
export function serializeProjectFile(file: ProjectFile): unknown {
  return file;
}

export function deserializeProjectFile(raw: unknown): ProjectFile {
  if (isLegacyDocumentFile(raw)) {
    const document: Document = {
      shapes: raw.shapes,
      layers: raw.layers,
      structuredBlocks: raw.structuredBlocks,
      colorThemeId: raw.colorThemeId,
    };
    const tab = createDocumentTab("タブ1", document);
    return { formatVersion: PROJECT_FORMAT_VERSION, tabs: [tab], activeTabId: tab.id };
  }
  const file = raw as ProjectFile;
  return migrateProjectFile(file, file.formatVersion ?? 0);
}
