import { v4 as uuidv4 } from "uuid";
import type { Document } from "./document";
import { createEmptyDocument } from "./document";

// A single tab (doc/requirement.md §4.7): one independent canvas/diagram.
export interface DocumentTab {
  id: string; // uuid v4, stable across renames/reorders
  name: string;
  document: Document;
}

// The `.qct` file's top-level shape (doc/spec.md §3.3). Bundles the tabs that
// make up one project; `formatVersion` supersedes the old per-Document field
// since every tab in a file shares the same schema version.
export interface ProjectFile {
  formatVersion: number;
  tabs: DocumentTab[];
  activeTabId: string;
}

// Single source of truth for the current ProjectFile schema version, shared
// with core/io/projectFile.ts's migration logic.
export const PROJECT_FORMAT_VERSION = 1;

export function createDocumentTab(name: string, document: Document = createEmptyDocument()): DocumentTab {
  return { id: uuidv4(), name, document };
}

export function createEmptyProjectFile(): ProjectFile {
  const tab = createDocumentTab("タブ1");
  return { formatVersion: PROJECT_FORMAT_VERSION, tabs: [tab], activeTabId: tab.id };
}
