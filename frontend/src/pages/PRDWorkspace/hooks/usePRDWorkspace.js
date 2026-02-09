/**
 * usePRDWorkspace Hook
 *
 * Extracts and organizes the main business logic from PRDWorkspace component.
 * This hook manages project loading, tab switching, and coordinates between
 * PRD, Design, and Comprehensive functionalities.
 */
import { useEffect, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import {
  getProject,
  getChatHistory,
  fetchProjectPermissions,
  getPrdVersions,
  getDesignVersions,
  getComprehensiveVersions,
} from '../../../services/api'
import { useProjectStore } from '../../../stores'
import { usePrdStore } from '../../../stores'
import { useDesignStore } from '../../../stores'
import { useComprehensiveStore } from '../../../stores'

export function usePRDWorkspace(user) {
  const { id } = useParams()

  // Project store
  const {
    project,
    setProject,
    userPermission,
    setUserPermission,
    activeTab,
    setActiveTab,
    setLoading,
    setError,
  } = useProjectStore()

  // PRD store
  const {
    setContent: setPrdContent,
    setMessages,
    setVersions: setPrdVersions,
  } = usePrdStore()

  // Design store
  const {
    setImages: setDesignImages,
    setPagesList,
    setGlobalStyle,
    setVersions: setDesignVersions,
  } = useDesignStore()

  // Comprehensive store
  const {
    setContent: setComprehensiveContent,
    setVersions: setComprehensiveVersions,
    setSelectedVersion,
  } = useComprehensiveStore()

  // Refs for abort controllers
  const abortRef = useRef(null)
  const designAbortRef = useRef(null)
  const comprehensiveAbortRef = useRef(null)

  // Load project and chat history
  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const [proj, chat] = await Promise.all([
          getProject(id),
          getChatHistory(id),
        ])

        if (cancelled) return

        setProject(proj)
        setPrdContent(proj.prd_content || '')
        setMessages(chat)

        // Determine user permission
        if (user?.is_admin || proj.owner_id === user?.id) {
          setUserPermission('owner')
        } else {
          try {
            const perms = await fetchProjectPermissions(id)
            const myPerm = perms.find((p) => p.user_id === user?.id)
            setUserPermission(myPerm ? myPerm.permission : 'view')
          } catch {
            setUserPermission('view')
          }
        }

        // Parse design images
        if (proj.design_images) {
          try {
            const images = JSON.parse(proj.design_images)
            if (Array.isArray(images)) setDesignImages(images)
          } catch { /* ignore */ }
        }

        // Parse pages plan
        if (proj.pages_plan) {
          try {
            const plan = JSON.parse(proj.pages_plan)
            if (plan.pages && Array.isArray(plan.pages)) {
              setPagesList(plan.pages)
            }
            if (plan.globalStyle) {
              setGlobalStyle(plan.globalStyle)
            }
          } catch { /* ignore */ }
        }

        // Parse comprehensive content
        if (proj.comprehensive_content) {
          setComprehensiveContent(proj.comprehensive_content)
        }

        // Preload all version lists
        Promise.all([
          getPrdVersions(proj.id).then(setPrdVersions).catch(() => {}),
          getDesignVersions(proj.id).then(setDesignVersions).catch(() => {}),
          getComprehensiveVersions(proj.id).then((versions) => {
            setComprehensiveVersions(versions)
            if (versions.length > 0) {
              setSelectedVersion(versions[versions.length - 1].version)
            }
          }).catch(() => {}),
        ])
      } catch (err) {
        if (!cancelled) {
          setError('项目加载失败')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    load()
    return () => { cancelled = true }
  }, [id, user])

  // Cleanup abort controllers on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.()
      designAbortRef.current?.()
      comprehensiveAbortRef.current?.()
    }
  }, [])

  const handleTabChange = useCallback((tab) => {
    setActiveTab(tab)
  }, [setActiveTab])

  return {
    projectId: id,
    abortRef,
    designAbortRef,
    comprehensiveAbortRef,
    handleTabChange,
  }
}
