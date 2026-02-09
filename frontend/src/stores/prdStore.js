import { create } from 'zustand'

/**
 * PRD Store - 管理 PRD 相关状态
 */
export const usePrdStore = create((set, get) => ({
  // Content
  content: '',
  isEditing: false,
  editContent: '',
  isSaving: false,

  // Chat
  messages: [],
  input: '',
  streaming: false,
  status: '',

  // Version history
  versions: [],
  showVersions: false,
  loadingVersion: false,
  selectedRevisionVersion: null,

  // Section selection for targeted revision
  selectedSection: null, // { title: string, level: number }

  // Chat message deletion
  deletingMessages: false,

  // UI
  showDesignPrompt: false,
  exporting: false,

  // Resizable split position
  splitPosition: null,

  // Setters
  setContent: (content) => set({ content }),
  setIsEditing: (isEditing) => set({ isEditing }),
  setEditContent: (editContent) => set({ editContent }),
  setIsSaving: (isSaving) => set({ isSaving }),
  setMessages: (messages) => set({ messages }),
  setInput: (input) => set({ input }),
  setStreaming: (streaming) => set({ streaming }),
  setStatus: (status) => set({ status }),
  setVersions: (versions) => set({ versions }),
  setShowVersions: (showVersions) => set({ showVersions }),
  setLoadingVersion: (loadingVersion) => set({ loadingVersion }),
  setSelectedRevisionVersion: (version) => set({ selectedRevisionVersion: version }),
  setSelectedSection: (section) => set({ selectedSection: section }),
  setDeletingMessages: (deleting) => set({ deletingMessages: deleting }),
  setShowDesignPrompt: (show) => set({ showDesignPrompt: show }),
  setExporting: (exporting) => set({ exporting }),
  setSplitPosition: (pos) => set({ splitPosition: pos }),

  // Actions
  appendMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),

  updateMessage: (index, updates) =>
    set((state) => {
      const messages = [...state.messages]
      if (messages[index]) {
        messages[index] = { ...messages[index], ...updates }
      }
      return { messages }
    }),

  removeMessagesFromIndex: (index) =>
    set((state) => ({
      messages: state.messages.slice(0, index),
    })),

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
      isEditing: false,
      editContent: '',
      isSaving: false,
      messages: [],
      input: '',
      streaming: false,
      status: '',
      versions: [],
      showVersions: false,
      loadingVersion: false,
      selectedRevisionVersion: null,
      selectedSection: null,
      deletingMessages: false,
      showDesignPrompt: false,
      exporting: false,
      splitPosition: null,
    }),
}))
