import { create } from "zustand";

// Cross-panel refresh signal: PropertyPanel registers/saves a template via a
// direct tauriApi call (no document mutation, so no documentStore action
// needed - see doc/spec.md §6.4), and bumps this so TemplateLibraryPanel's
// list refetches without the two panels needing to share state directly.
interface UserTemplateRefreshState {
  refreshToken: number;
  bumpRefresh: () => void;
}

export const useUserTemplateRefreshStore = create<UserTemplateRefreshState>((set) => ({
  refreshToken: 0,
  bumpRefresh: () => set((s) => ({ refreshToken: s.refreshToken + 1 })),
}));
