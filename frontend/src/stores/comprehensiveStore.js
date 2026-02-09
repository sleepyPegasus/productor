import { create } from 'zustand'

/**
 * Comprehensive Store - 管理综合导出相关状态
 */
export const useComprehensiveStore = create((set, get) => ({
  // Content
  content: '',
  generating: false,
  status: '',
  error: null,

  // Editing
  isEditing: false,
  editContent: '',
  isSaving: false,

  // Export
  exporting: false,
  exportFormat: 'docx',

  // Version history
  versions: [],
  showVersions: false,
  loadingVersion: false,
  selectedVersion: null,

  // Setters
  setContent: (content) => set({ content }),
  setGenerating: (generating) => set({ generating }),
  setStatus: (status) => set({ status }),
  setError: (error) => set({ error }),
  setIsEditing: (isEditing) => set({ isEditing }),
  setEditContent: (editContent) => set({ editContent }),
  setIsSaving: (isSaving) => set({ isSaving }),
  setExporting: (exporting) => set({ exporting }),
  setExportFormat: (format) => set({ exportFormat: format }),
  setVersions: (versions) => set({ versions }),
  setShowVersions: (show) => set({ showVersions: show }),
  setLoadingVersion: (loading) => set({ loadingVersion: loading }),
  setSelectedVersion: (version) => set({ selectedVersion: version }),

  // Actions
  startEditing: () =>
    set((state) => ({
      isEditing: true,
      editContent: state.content,
    })),

  cancelEditing: () =>
    set({
      isEditing: false,
      editContent: '',
    }),

  saveEdit: () =>
    set((state) => ({
      content: state.editContent,
      isEditing: false,
      editContent: '',
    })),

  reset: () =>
    set({
      content: '',
      generating: false,
      status: '',
      error: null,
      isEditing: false,
      editContent: '',
      isSaving: false,
      exporting: false,
      exportFormat: 'docx',
      versions: [],
      showVersions: false,
      loadingVersion: false,
      selectedVersion: null,
    }),
}))
