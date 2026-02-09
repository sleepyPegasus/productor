import { create } from 'zustand'

/**
 * Design Store - 管理设计图相关状态
 */
export const useDesignStore = create((set, get) => ({
  // Images
  images: [],
  generating: false,
  status: '',
  error: null,

  // Pages
  pagesList: [],
  selectedPageId: null,
  generatingPageId: null,
  currentSlideIndex: 0,

  // Page filter (for archive/delete)
  pageFilter: 'active', // 'all' | 'active' | 'archived' | 'deleted'

  // Version history
  versions: [],
  showVersions: false,
  loadingVersion: false,

  // Edit & config modals
  editingPage: null,
  editForm: { name: '', description: '', keyElements: '' },
  imageConfigPage: null,
  pageImageConfigs: {},

  // Add custom page modal
  showAddPageModal: false,
  addPageForm: { name: '', description: '', keyElements: '', layoutDescription: '' },

  // Global UI style settings
  showGlobalStyleModal: false,
  selectedPresetId: null,
  globalStyle: { designStyle: '', colorScheme: '', layoutRequirements: '', fontStyle: '', customNotes: '' },

  // Resizable split panel
  splitWidth: 360,

  // Setters
  setImages: (images) => set({ images }),
  setGenerating: (generating) => set({ generating }),
  setStatus: (status) => set({ status }),
  setError: (error) => set({ error }),
  setPagesList: (pages) => set({ pagesList: pages }),
  setSelectedPageId: (id) => set({ selectedPageId: id }),
  setGeneratingPageId: (id) => set({ generatingPageId: id }),
  setCurrentSlideIndex: (index) => set({ currentSlideIndex: index }),
  setPageFilter: (filter) => set({ pageFilter: filter }),
  setVersions: (versions) => set({ versions }),
  setShowVersions: (show) => set({ showVersions: show }),
  setLoadingVersion: (loading) => set({ loadingVersion: loading }),
  setEditingPage: (page) => set({ editingPage: page }),
  setEditForm: (form) => set({ editForm: form }),
  setImageConfigPage: (page) => set({ imageConfigPage: page }),
  setPageImageConfigs: (configs) => set({ pageImageConfigs: configs }),
  setShowAddPageModal: (show) => set({ showAddPageModal: show }),
  setAddPageForm: (form) => set({ addPageForm: form }),
  setShowGlobalStyleModal: (show) => set({ showGlobalStyleModal: show }),
  setSelectedPresetId: (id) => set({ selectedPresetId: id }),
  setGlobalStyle: (style) => set({ globalStyle: style }),
  setSplitWidth: (width) => set({ splitWidth: width }),

  // Actions
  updatePageConfig: (pageId, config) =>
    set((state) => ({
      pageImageConfigs: {
        ...state.pageImageConfigs,
        [pageId]: { ...state.pageImageConfigs[pageId], ...config },
      },
    })),

  updatePage: (pageId, updates) =>
    set((state) => ({
      pagesList: state.pagesList.map((p) =>
        p.id === pageId ? { ...p, ...updates } : p
      ),
    })),

  addPage: (page) =>
    set((state) => ({
      pagesList: [...state.pagesList, page],
    })),

  removePage: (pageId) =>
    set((state) => ({
      pagesList: state.pagesList.filter((p) => p.id !== pageId),
    })),

  updateImage: (index, updates) =>
    set((state) => {
      const images = [...state.images]
      if (images[index]) {
        images[index] = { ...images[index], ...updates }
      }
      return { images }
    }),

  addImage: (image) =>
    set((state) => ({
      images: [...state.images, image],
    })),

  nextSlide: () =>
    set((state) => ({
      currentSlideIndex: Math.min(
        state.currentSlideIndex + 1,
        state.images.length - 1
      ),
    })),

  prevSlide: () =>
    set((state) => ({
      currentSlideIndex: Math.max(state.currentSlideIndex - 1, 0),
    })),

  resetAddPageForm: () =>
    set({
      addPageForm: { name: '', description: '', keyElements: '', layoutDescription: '' },
    }),

  reset: () =>
    set({
      images: [],
      generating: false,
      status: '',
      error: null,
      pagesList: [],
      selectedPageId: null,
      generatingPageId: null,
      currentSlideIndex: 0,
      pageFilter: 'active',
      versions: [],
      showVersions: false,
      loadingVersion: false,
      editingPage: null,
      editForm: { name: '', description: '', keyElements: '' },
      imageConfigPage: null,
      pageImageConfigs: {},
      showAddPageModal: false,
      addPageForm: { name: '', description: '', keyElements: '', layoutDescription: '' },
      showGlobalStyleModal: false,
      selectedPresetId: null,
      globalStyle: { designStyle: '', colorScheme: '', layoutRequirements: '', fontStyle: '', customNotes: '' },
      splitWidth: 360,
    }),
}))
