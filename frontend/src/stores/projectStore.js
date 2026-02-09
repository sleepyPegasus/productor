import { create } from 'zustand'

/**
 * Project Store - 管理项目级状态和Tab切换
 */
export const useProjectStore = create((set, get) => ({
  // Project data
  project: null,
  userPermission: null, // 'owner', 'edit', 'view'

  // Tab state: 'prd', 'design', or 'comprehensive'
  activeTab: 'prd',

  // UI Loading states
  isLoading: false,
  error: null,

  // Setters
  setProject: (project) => set({ project }),
  setUserPermission: (permission) => set({ userPermission: permission }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),

  // Computed
  get canEdit() {
    const { userPermission } = get()
    // Note: is_admin check should be passed from component or another store
    return userPermission === 'owner' || userPermission === 'edit'
  },

  // Actions
  updateProjectField: (field, value) =>
    set((state) => ({
      project: state.project ? { ...state.project, [field]: value } : null,
    })),

  reset: () =>
    set({
      project: null,
      userPermission: null,
      activeTab: 'prd',
      isLoading: false,
      error: null,
    }),
}))
