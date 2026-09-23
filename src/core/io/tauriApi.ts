import { invoke } from "@tauri-apps/api/core";
import type { ProjectFile } from "../model/project";
import type { Shape } from "../model/shape";
import type { UserTemplate } from "../model/userTemplate";
import { deserializeProjectFile, serializeProjectFile } from "./projectFile";

// Mirrors src-tauri/src/error.rs's AppError serialization (see doc/spec.md
// §11): { kind, message }. `message` is for logs only - user-facing text
// comes from errorMessageFor()'s per-kind Japanese mapping.
export interface AppErrorPayload {
  kind: string;
  message: string;
}

export class TauriApiError extends Error {
  kind: string;
  constructor(payload: AppErrorPayload) {
    super(payload.message);
    this.kind = payload.kind;
  }
}

function isAppErrorPayload(value: unknown): value is AppErrorPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { kind?: unknown }).kind === "string" &&
    typeof (value as { message?: unknown }).message === "string"
  );
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (err) {
    if (isAppErrorPayload(err)) throw new TauriApiError(err);
    throw err;
  }
}

const ERROR_MESSAGES: Record<string, string> = {
  io: "ファイルの読み書きに失敗しました。",
  serde: "プロジェクトファイルの形式が不正です。",
  other: "予期しないエラーが発生しました。",
};

// Returns the Japanese message to show the user, or null if the error is not
// worth surfacing (e.g. the user simply cancelled a file dialog).
export function errorMessageFor(err: unknown): string | null {
  if (err instanceof TauriApiError) {
    if (err.kind === "dialog_cancelled") return null;
    return ERROR_MESSAGES[err.kind] ?? ERROR_MESSAGES.other;
  }
  return ERROR_MESSAGES.other;
}

export interface OpenResult {
  path: string;
  projectFile: ProjectFile;
}

async function toOpenResult(raw: { path: string; document: unknown }): Promise<OpenResult> {
  return { path: raw.path, projectFile: deserializeProjectFile(raw.document) };
}

export async function projectOpen(): Promise<OpenResult> {
  return toOpenResult(await call("project_open"));
}

export async function projectOpenPath(path: string): Promise<OpenResult> {
  return toOpenResult(await call("project_open_path", { path }));
}

export function projectSave(path: string, projectFile: ProjectFile): Promise<void> {
  return call<void>("project_save", { path, document: serializeProjectFile(projectFile) });
}

export function projectSaveAs(projectFile: ProjectFile): Promise<{ path: string }> {
  return call<{ path: string }>("project_save_as", { document: serializeProjectFile(projectFile) });
}

export function getRecentFiles(): Promise<string[]> {
  return call<string[]>("get_recent_files");
}

export function getUserTemplates(): Promise<UserTemplate[]> {
  return call<UserTemplate[]>("get_user_templates");
}

export function saveUserTemplate(template: UserTemplate): Promise<UserTemplate> {
  return call<UserTemplate>("save_user_template", { template });
}

export function deleteUserTemplate(id: string): Promise<void> {
  return call<void>("delete_user_template", { id });
}

// Each export command shows its own native save dialog (doc/spec.md §8) and
// returns the chosen path.
export function exportSvg(svgText: string): Promise<string> {
  return call<string>("export_svg", { svgText });
}

export function exportPng(svgText: string, scale: number): Promise<string> {
  return call<string>("export_png", { svgText, scale });
}

export function exportEmfToFile(shapes: Shape[]): Promise<string> {
  return call<string>("export_emf_to_file", { shapes });
}

export function exportEmfToClipboard(shapes: Shape[]): Promise<void> {
  return call<void>("export_emf_to_clipboard", { shapes });
}
