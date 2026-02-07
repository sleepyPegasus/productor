import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  exportPRDAsDocx, exportComprehensive, generatePRD, generateDesigns,
  generateSinglePageDesign, generateComprehensive, getChatHistory, getProject, revisePRD,
  updatePrdContent, updateComprehensiveContent,
  getPrdVersions, getPrdVersionContent,
  getDesignVersions, getDesignVersionImages,
  getComprehensiveVersions, getComprehensiveVersionContent,
} from '../services/api'
import './PRDWorkspace.css'

export default function PRDWorkspace() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  // Tab state: 'prd', 'design', or 'comprehensive'
  const initialTab = searchParams.get('tab') || 'prd'
  const [activeTab, setActiveTab] = useState(initialTab === 'design' ? 'design' : initialTab === 'comprehensive' ? 'comprehensive' : 'prd')

  // PRD tab state
  const [project, setProject] = useState(null)
  const [prdContent, setPrdContent] = useState('')
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [status, setStatus] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)

  // PRD editing state
  const [isEditingPrd, setIsEditingPrd] = useState(false)
  const [editPrdContent, setEditPrdContent] = useState('')
  const [savingPrd, setSavingPrd] = useState(false)

  // PRD version history
  const [prdVersions, setPrdVersions] = useState([])
  const [showPrdVersions, setShowPrdVersions] = useState(false)
  const [loadingVersion, setLoadingVersion] = useState(false)

  // Version selection for chat revision
  const [selectedRevisionVersion, setSelectedRevisionVersion] = useState(null)

  // Resizable PRD/Chat split
  const [prdChatSplitPos, setPrdChatSplitPos] = useState(null) // null = default
  const isPrdChatDragging = useRef(false)
  const prdChatContainerRef = useRef(null)

  // Design tab state
  const [designImages, setDesignImages] = useState([])
  const [designStatus, setDesignStatus] = useState('')
  const [designGenerating, setDesignGenerating] = useState(false)
  const [designError, setDesignError] = useState('')
  const [pagesList, setPagesList] = useState([])
  const [selectedPageId, setSelectedPageId] = useState(null)
  const [generatingPageId, setGeneratingPageId] = useState(null)
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0)

  // Design version history
  const [designVersions, setDesignVersions] = useState([])
  const [showDesignVersions, setShowDesignVersions] = useState(false)
  const [loadingDesignVersion, setLoadingDesignVersion] = useState(false)

  // Edit & config modals
  const [editingPage, setEditingPage] = useState(null)
  const [editForm, setEditForm] = useState({ name: '', description: '', keyElements: '' })
  const [imageConfigPage, setImageConfigPage] = useState(null)
  const [pageImageConfigs, setPageImageConfigs] = useState({})

  // Comprehensive export state
  const [comprehensiveExporting, setComprehensiveExporting] = useState(false)
  const [comprehensiveFormat, setComprehensiveFormat] = useState('docx')

  // Comprehensive AI integration state
  const [comprehensiveContent, setComprehensiveContent] = useState('')
  const [comprehensiveGenerating, setComprehensiveGenerating] = useState(false)
  const [comprehensiveStatus, setComprehensiveStatus] = useState('')
  const [comprehensiveError, setComprehensiveError] = useState('')

  // Comprehensive editing state
  const [isEditingComprehensive, setIsEditingComprehensive] = useState(false)
  const [editComprehensiveContent, setEditComprehensiveContent] = useState('')
  const [savingComprehensive, setSavingComprehensive] = useState(false)

  // Comprehensive version history
  const [comprehensiveVersions, setComprehensiveVersions] = useState([])
  const [showComprehensiveVersions, setShowComprehensiveVersions] = useState(false)
  const [loadingComprehensiveVersion, setLoadingComprehensiveVersion] = useState(false)

  // Resizable split panel (design tab)
  const [splitWidth, setSplitWidth] = useState(360)
  const isDraggingRef = useRef(false)
  const splitContainerRef = useRef(null)

  const abortRef = useRef(null)
  const designAbortRef = useRef(null)
  const comprehensiveAbortRef = useRef(null)
  const chatEndRef = useRef(null)
  const prdEndRef = useRef(null)
  const comprehensiveEndRef = useRef(null)
  const textareaRef = useRef(null)

  const handleTabChange = (tab) => {
    setActiveTab(tab)
    if (tab === 'design') setSearchParams({ tab: 'design' })
    else if (tab === 'comprehensive') setSearchParams({ tab: 'comprehensive' })
    else setSearchParams({})
  }

  // Comprehensive version selection state
  const [selectedComprehensiveVersion, setSelectedComprehensiveVersion] = useState(null)

  // Load project and chat history
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [proj, chat] = await Promise.all([
          getProject(id),
          getChatHistory(id),
        ])
        if (cancelled) return
        setProject(proj)
        setPrdContent(proj.prd_content || '')
        setMessages(chat)
        if (proj.design_images) {
          try {
            const images = JSON.parse(proj.design_images)
            if (Array.isArray(images)) setDesignImages(images)
          } catch { /* ignore */ }
        }
        if (proj.pages_plan) {
          try {
            const plan = JSON.parse(proj.pages_plan)
            if (plan.pages && Array.isArray(plan.pages)) {
              setPagesList(plan.pages)
            }
          } catch { /* ignore */ }
        }
        if (proj.comprehensive_content) {
          setComprehensiveContent(proj.comprehensive_content)
        }

        // Preload all version lists
        Promise.all([
          getPrdVersions(proj.id).then(setPrdVersions).catch(() => {}),
          getDesignVersions(proj.id).then(setDesignVersions).catch(() => {}),
          getComprehensiveVersions(proj.id).then((versions) => {
            setComprehensiveVersions(versions)
            // Default to latest comprehensive version
            if (versions.length > 0) {
              setSelectedComprehensiveVersion(versions[versions.length - 1].version)
            }
          }).catch(() => {}),
        ])
      } catch {
        setError('项目加载失败')
      }
    }
    load()
    return () => { cancelled = true }
  }, [id])

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, status])

  // Auto-scroll PRD when streaming
  useEffect(() => {
    if (streaming) {
      prdEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [prdContent, streaming])

  // Auto-scroll comprehensive content when generating
  useEffect(() => {
    if (comprehensiveGenerating) {
      comprehensiveEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [comprehensiveContent, comprehensiveGenerating])

  // Refresh PRD versions when panel opens
  useEffect(() => {
    if (showPrdVersions) {
      getPrdVersions(id).then(setPrdVersions).catch(() => {})
    }
  }, [showPrdVersions, id])

  // Refresh design versions when panel opens
  useEffect(() => {
    if (showDesignVersions) {
      getDesignVersions(id).then(setDesignVersions).catch(() => {})
    }
  }, [showDesignVersions, id])

  // Refresh comprehensive versions when panel opens
  useEffect(() => {
    if (showComprehensiveVersions) {
      getComprehensiveVersions(id).then((versions) => {
        setComprehensiveVersions(versions)
        if (versions.length > 0 && !selectedComprehensiveVersion) {
          setSelectedComprehensiveVersion(versions[versions.length - 1].version)
        }
      }).catch(() => {})
    }
  }, [showComprehensiveVersions, id])

  const handleSend = useCallback(() => {
    const text = input.trim()
    if (!text || streaming) return

    setInput('')
    setError('')
    setStreaming(true)
    setStatus('')

    const userMsg = { role: 'user', content: text, timestamp: new Date().toISOString() }
    setMessages((prev) => [...prev, userMsg])

    const isRevision = !!prdContent
    const streamFn = isRevision ? revisePRD : generatePRD

    let tokenBuf = ''
    setPrdContent('')

    if (isRevision) {
      // revisePRD has version parameter
      const abort = streamFn(id, text, {
        onToken(token) {
          tokenBuf += token
          setPrdContent(tokenBuf)
        },
        onStatus(msg) { setStatus(msg) },
        onRequirement() { setStatus('需求分析完成') },
        onPagesPlan(data) {
          setStatus('页面结构规划完成')
          if (data?.pages && Array.isArray(data.pages)) setPagesList(data.pages)
        },
        onPrdComplete(full) {
          setPrdContent(full)
          tokenBuf = full
        },
        onDone() {
          setStreaming(false)
          setStatus('')
          setSelectedRevisionVersion(null)
          if (tokenBuf) {
            setMessages((prev) => [...prev, {
              role: 'assistant',
              content: 'PRD 文档已更新，请在左侧查看。',
              timestamp: new Date().toISOString(),
            }])
          }
          getProject(id).then((p) => {
            setProject(p)
            if (p.pages_plan) {
              try {
                const plan = JSON.parse(p.pages_plan)
                if (plan.pages && Array.isArray(plan.pages)) setPagesList(plan.pages)
              } catch { /* ignore */ }
            }
          }).catch(() => {})
        },
        onError(msg) {
          setStreaming(false)
          setStatus('')
          setError(msg || '生成失败，请重试')
        },
      }, selectedRevisionVersion)
      abortRef.current = abort
    } else {
      const abort = streamFn(id, text, {
        onToken(token) {
          tokenBuf += token
          setPrdContent(tokenBuf)
        },
        onStatus(msg) { setStatus(msg) },
        onRequirement() { setStatus('需求分析完成') },
        onPagesPlan(data) {
          setStatus('页面结构规划完成')
          if (data?.pages && Array.isArray(data.pages)) setPagesList(data.pages)
        },
        onPrdComplete(full) {
          setPrdContent(full)
          tokenBuf = full
        },
        onDone() {
          setStreaming(false)
          setStatus('')
          if (tokenBuf) {
            setMessages((prev) => [...prev, {
              role: 'assistant',
              content: 'PRD 文档已生成，请在左侧查看。',
              timestamp: new Date().toISOString(),
            }])
          }
          getProject(id).then((p) => {
            setProject(p)
            if (p.pages_plan) {
              try {
                const plan = JSON.parse(p.pages_plan)
                if (plan.pages && Array.isArray(plan.pages)) setPagesList(plan.pages)
              } catch { /* ignore */ }
            }
          }).catch(() => {})
        },
        onError(msg) {
          setStreaming(false)
          setStatus('')
          setError(msg || '生成失败，请重试')
        },
      })
      abortRef.current = abort
    }
  }, [id, input, streaming, prdContent, selectedRevisionVersion])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleStop = () => {
    abortRef.current?.()
    setStreaming(false)
    setStatus('')
  }

  const handleExportDocx = async () => {
    if (exporting || !prdContent) return
    setExporting(true)
    setError('')
    try {
      await exportPRDAsDocx(id, project?.name || 'PRD')
    } catch (err) {
      setError(err.message || '导出失败')
    } finally {
      setExporting(false)
    }
  }

  // PRD editing handlers
  const handleStartEditPrd = () => {
    setEditPrdContent(prdContent)
    setIsEditingPrd(true)
  }

  const handleCancelEditPrd = () => {
    setIsEditingPrd(false)
    setEditPrdContent('')
  }

  const handleSavePrd = async () => {
    if (savingPrd || !editPrdContent.trim()) return
    setSavingPrd(true)
    try {
      const updated = await updatePrdContent(id, editPrdContent)
      setPrdContent(editPrdContent)
      setIsEditingPrd(false)
      setProject(updated)
      setStatus('PRD 已保存')
      setTimeout(() => setStatus(''), 2000)
    } catch (err) {
      setError(err.message || '保存失败')
    } finally {
      setSavingPrd(false)
    }
  }

  // PRD version history handlers
  const handleLoadPrdVersion = async (version) => {
    setLoadingVersion(true)
    try {
      const data = await getPrdVersionContent(id, version)
      setPrdContent(data.content)
      setShowPrdVersions(false)
      setStatus(`已加载版本 ${version}`)
      setTimeout(() => setStatus(''), 2000)
    } catch {
      setError('加载版本失败')
    } finally {
      setLoadingVersion(false)
    }
  }

  // Resizable PRD/Chat split handlers
  const handlePrdChatMouseDown = useCallback((e) => {
    e.preventDefault()
    isPrdChatDragging.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const handleMouseMove = (moveEvent) => {
      if (!isPrdChatDragging.current || !prdChatContainerRef.current) return
      const rect = prdChatContainerRef.current.getBoundingClientRect()
      const pos = moveEvent.clientX - rect.left
      const minLeft = 300
      const minRight = 320
      const clamped = Math.max(minLeft, Math.min(pos, rect.width - minRight))
      setPrdChatSplitPos(clamped)
    }

    const handleMouseUp = () => {
      isPrdChatDragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [])

  // Generate all designs handler
  const handleGenerateAllDesigns = useCallback(() => {
    if (designGenerating) return
    setDesignError('')
    setDesignGenerating(true)
    setDesignStatus('正在准备生成所有界面设计图...')
    setDesignImages([])

    const abort = generateDesigns(id, {
      onImage(imageData) {
        setDesignImages((prev) => [...prev, imageData])
      },
      onStatus(msg) { setDesignStatus(msg) },
      onDone() {
        setDesignGenerating(false)
        setDesignStatus('')
        getProject(id).then((p) => setProject(p)).catch(() => {})
      },
      onError(msg) {
        setDesignGenerating(false)
        setDesignStatus('')
        setDesignError(msg || '设计图生成失败，请重试')
      },
    })
    designAbortRef.current = abort
  }, [id, designGenerating])

  // Generate single page design
  const handleGeneratePageDesign = useCallback((pageId) => {
    if (generatingPageId) return
    setDesignError('')
    setGeneratingPageId(pageId)

    const pageConfig = pageImageConfigs[pageId] || {}
    // Merge project defaults with page-specific config (page-specific takes priority)
    const imageConfig = {
      resolution: pageConfig.resolution || project?.default_image_resolution || '',
      ratio: pageConfig.ratio || project?.default_image_ratio || '',
      extraRequirements: pageConfig.extraRequirements || '',
    }

    const abort = generateSinglePageDesign(id, pageId, {
      onImage(imageData) {
        setDesignImages((prev) => {
          const filtered = prev.filter((img) => img.page_id !== imageData.page_id)
          return [...filtered, imageData]
        })
      },
      onStatus(msg) { setDesignStatus(msg) },
      onDone() {
        setGeneratingPageId(null)
        setDesignStatus('')
        getProject(id).then((p) => setProject(p)).catch(() => {})
      },
      onError(msg) {
        setGeneratingPageId(null)
        setDesignStatus('')
        setDesignError(msg || '设计图生成失败，请重试')
      },
    }, imageConfig)
    designAbortRef.current = abort
  }, [id, generatingPageId, pageImageConfigs])

  const handleStopDesign = () => {
    designAbortRef.current?.()
    setDesignGenerating(false)
    setGeneratingPageId(null)
    setDesignStatus('')
  }

  // Edit page content handlers
  const handleOpenEditPage = (page, e) => {
    e.stopPropagation()
    setEditForm({
      name: page.name || '',
      description: page.description || '',
      keyElements: (page.keyElements || []).join(', '),
    })
    setEditingPage(page)
  }

  const handleSaveEditPage = () => {
    if (!editingPage) return
    const updatedPages = pagesList.map((p) => {
      if (p.id === editingPage.id) {
        return {
          ...p,
          name: editForm.name,
          description: editForm.description,
          keyElements: editForm.keyElements.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
        }
      }
      return p
    })
    setPagesList(updatedPages)
    setEditingPage(null)
  }

  // Image config handlers
  const handleOpenImageConfig = (pageId, e) => {
    e.stopPropagation()
    setImageConfigPage(pageId)
  }

  const handleSaveImageConfig = (pageId, config) => {
    setPageImageConfigs((prev) => ({ ...prev, [pageId]: config }))
    setImageConfigPage(null)
  }

  // Design version handlers
  const handleLoadDesignVersion = async (version) => {
    setLoadingDesignVersion(true)
    try {
      const data = await getDesignVersionImages(id, version)
      setDesignImages(data.images || [])
      setShowDesignVersions(false)
      setDesignStatus(`已加载设计版本 ${version}`)
      setTimeout(() => setDesignStatus(''), 2000)
    } catch {
      setDesignError('加载设计版本失败')
    } finally {
      setLoadingDesignVersion(false)
    }
  }

  // Comprehensive AI generation handler
  const handleComprehensiveGenerate = () => {
    if (comprehensiveGenerating) return
    setComprehensiveGenerating(true)
    setComprehensiveError('')
    setComprehensiveStatus('')
    setComprehensiveContent('')

    let tokenBuf = ''
    const abort = generateComprehensive(id, {
      onToken(token) {
        tokenBuf += token
        setComprehensiveContent(tokenBuf)
      },
      onStatus(msg) { setComprehensiveStatus(msg) },
      onComprehensiveReset() {
        tokenBuf = ''
        setComprehensiveContent('')
      },
      onComprehensiveComplete(full) {
        setComprehensiveContent(full)
        tokenBuf = full
      },
      onDone() {
        setComprehensiveGenerating(false)
        setComprehensiveStatus('')
        getProject(id).then((p) => {
          if (p) setProject(p)
        }).catch(() => {})
        // Refresh comprehensive versions and select the latest
        getComprehensiveVersions(id).then((versions) => {
          setComprehensiveVersions(versions)
          if (versions.length > 0) {
            setSelectedComprehensiveVersion(versions[versions.length - 1].version)
          }
        }).catch(() => {})
      },
      onError(msg) {
        setComprehensiveGenerating(false)
        setComprehensiveError(msg || 'AI 内容整合失败')
        setComprehensiveStatus('')
      },
    })
    comprehensiveAbortRef.current = abort
  }

  // Comprehensive editing handlers
  const handleStartEditComprehensive = () => {
    setIsEditingComprehensive(true)
    setEditComprehensiveContent(comprehensiveContent)
  }

  const handleCancelEditComprehensive = () => {
    setIsEditingComprehensive(false)
    setEditComprehensiveContent('')
  }

  const handleSaveComprehensive = async () => {
    if (savingComprehensive) return
    setSavingComprehensive(true)
    try {
      await updateComprehensiveContent(id, editComprehensiveContent)
      setComprehensiveContent(editComprehensiveContent)
      setIsEditingComprehensive(false)
      setEditComprehensiveContent('')
    } catch (err) {
      setComprehensiveError(err.message || '保存失败')
    } finally {
      setSavingComprehensive(false)
    }
  }

  // Comprehensive version loading
  const handleLoadComprehensiveVersion = async (version) => {
    setLoadingComprehensiveVersion(true)
    try {
      const data = await getComprehensiveVersionContent(id, version)
      setComprehensiveContent(data.content || '')
      setSelectedComprehensiveVersion(version)
      setShowComprehensiveVersions(false)
      setComprehensiveStatus(`已加载综合方案版本 ${version}`)
      setTimeout(() => setComprehensiveStatus(''), 2000)
    } catch {
      setComprehensiveError('加载综合方案版本失败')
    } finally {
      setLoadingComprehensiveVersion(false)
    }
  }

  // Comprehensive export handler (exports selected version)
  const handleComprehensiveExportSelected = async () => {
    if (comprehensiveExporting || !selectedComprehensiveVersion) return
    setComprehensiveExporting(true)
    setComprehensiveError('')
    try {
      await exportComprehensive(id, project?.name || '产品方案', comprehensiveFormat)
    } catch (err) {
      setComprehensiveError(err.message || '导出失败')
    } finally {
      setComprehensiveExporting(false)
    }
  }

  // Resizable split panel handlers (design tab)
  const handleSplitMouseDown = useCallback((e) => {
    e.preventDefault()
    isDraggingRef.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const handleMouseMove = (moveEvent) => {
      if (!isDraggingRef.current || !splitContainerRef.current) return
      const rect = splitContainerRef.current.getBoundingClientRect()
      const newWidth = Math.max(260, Math.min(moveEvent.clientX - rect.left, rect.width - 300))
      setSplitWidth(newWidth)
    }

    const handleMouseUp = () => {
      isDraggingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [])

  // Image config presets
  const RESOLUTION_OPTIONS = [
    { label: '3840 x 2160 (4K UHD)', value: '3840x2160' },
    { label: '2560 x 1440 (2K QHD)', value: '2560x1440' },
    { label: '1920 x 1080 (Full HD)', value: '1920x1080' },
    { label: '1440 x 900 (WXGA+)', value: '1440x900' },
    { label: '1366 x 768 (HD)', value: '1366x768' },
    { label: '1280 x 720 (HD 720p)', value: '1280x720' },
    { label: '1024 x 768 (XGA)', value: '1024x768' },
    { label: '768 x 1024 (iPad)', value: '768x1024' },
    { label: '390 x 844 (iPhone 14)', value: '390x844' },
    { label: '375 x 812 (iPhone X)', value: '375x812' },
    { label: '414 x 896 (iPhone 11)', value: '414x896' },
  ]

  const RATIO_OPTIONS = [
    { label: '16:9 (宽屏)', value: '16:9' },
    { label: '4:3 (标准)', value: '4:3' },
    { label: '3:2 (经典)', value: '3:2' },
    { label: '1:1 (正方形)', value: '1:1' },
    { label: '9:16 (手机竖屏)', value: '9:16' },
    { label: '3:4 (平板竖屏)', value: '3:4' },
  ]

  const getPageImage = (pageId) => designImages.find((img) => img.page_id === pageId)
  const getSelectedPage = () => selectedPageId ? pagesList.find((p) => p.id === selectedPageId) : null

  const pagesWithImages = pagesList.filter((p) => getPageImage(p.id))
  const handlePrevSlide = () => setCurrentSlideIndex((prev) => Math.max(0, prev - 1))
  const handleNextSlide = () => setCurrentSlideIndex((prev) => Math.min(pagesWithImages.length - 1, prev + 1))

  // Download design image helper
  const handleDownloadImage = async (imageUrl, fileName) => {
    try {
      if (imageUrl.startsWith('data:')) {
        // Base64 data URL
        const a = document.createElement('a')
        a.href = imageUrl
        a.download = fileName
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
      } else {
        // HTTP URL - fetch and download
        const res = await fetch(imageUrl)
        const blob = await res.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = fileName
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        window.URL.revokeObjectURL(url)
      }
    } catch {
      setDesignError('下载图片失败')
    }
  }

  const handleDownloadAllImages = async () => {
    for (const page of pagesWithImages) {
      const img = getPageImage(page.id)
      if (img?.image_url) {
        const ext = img.image_url.startsWith('data:image/png') ? 'png' : 'jpg'
        await handleDownloadImage(img.image_url, `${project?.name || 'design'}_${page.name}.${ext}`)
      }
    }
  }

  const formatVersionTime = (iso) => {
    if (!iso) return '-'
    const d = new Date(iso)
    return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  const VERSION_ACTION_LABELS = {
    generated: '生成',
    revised: '修改',
    manual_edit: '手动编辑',
    auto_save: '自动保存',
    batch_generated: '批量生成',
    single_page_generated: '单页生成',
    ai_generated: 'AI 整合',
  }

  // Pre-process comprehensive content: extract long data URIs so remark can parse them
  const { processedContent: comprehensiveDisplayContent, imageMap: comprehensiveImageMap } = useMemo(() => {
    if (!comprehensiveContent) return { processedContent: '', imageMap: {} }
    const map = {}
    let counter = 0
    const processed = comprehensiveContent.replace(
      /!\[([^\]]*)\]\((data:[^)]{256,})\)/g,
      (_, alt, dataUri) => {
        const key = `__img_placeholder_${counter++}__`
        map[key] = dataUri
        return `![${alt}](${key})`
      }
    )
    return { processedContent: processed, imageMap: map }
  }, [comprehensiveContent])

  // Memoize comprehensive markdown to avoid expensive re-renders on unrelated state changes
  const comprehensiveMarkdown = useMemo(() => {
    if (!comprehensiveDisplayContent) return null
    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          img: ({ node, alt, src, ...props }) => {
            const resolvedSrc = comprehensiveImageMap[src] || src
            return (
              <figure className="prd-image-figure">
                <img src={resolvedSrc} alt={alt || ''} className="prd-image" loading="lazy" {...props} />
                {alt && <figcaption className="prd-image-caption">{alt}</figcaption>}
              </figure>
            )
          },
        }}
      >
        {comprehensiveDisplayContent}
      </ReactMarkdown>
    )
  }, [comprehensiveDisplayContent, comprehensiveImageMap])

  if (error && !project) {
    return (
      <div className="workspace-error">
        <p>{error}</p>
        <button className="btn-secondary" onClick={() => navigate('/')}>返回项目列表</button>
      </div>
    )
  }

  return (
    <div className="workspace">
      {/* Top bar */}
      <header className="workspace-header">
        <button className="btn-back" onClick={() => navigate('/')}>
          &larr; 返回
        </button>
        <div className="header-info">
          <h2>{project?.name || '加载中...'}</h2>
          {project && (
            <span className="header-meta">v{project.version} &middot; {project.status}</span>
          )}
        </div>

        {/* Tab navigation */}
        <nav className="workspace-tabs">
          <button className={`tab-btn ${activeTab === 'prd' ? 'tab-active' : ''}`} onClick={() => handleTabChange('prd')}>
            <span className="tab-step">1</span>PRD 文档
          </button>
          <button className={`tab-btn ${activeTab === 'design' ? 'tab-active' : ''}`} onClick={() => handleTabChange('design')}>
            <span className="tab-step">2</span>产品界面设计
          </button>
          <button className={`tab-btn ${activeTab === 'comprehensive' ? 'tab-active' : ''}`} onClick={() => handleTabChange('comprehensive')}>
            <span className="tab-step">3</span>综合方案
          </button>
        </nav>

        {activeTab === 'prd' && streaming && (
          <div className="header-status"><span className="status-dot" />{status || '生成中...'}</div>
        )}
        {activeTab === 'design' && (designGenerating || generatingPageId) && (
          <div className="header-status"><span className="status-dot" />{designStatus || '生成中...'}</div>
        )}
        {activeTab === 'comprehensive' && comprehensiveGenerating && (
          <div className="header-status"><span className="status-dot" />{comprehensiveStatus || 'AI 整合中...'}</div>
        )}
      </header>

      {/* ===== PRD Tab ===== */}
      {activeTab === 'prd' && (
        <div className="workspace-body" ref={prdChatContainerRef}>
          {/* Left: PRD Display */}
          <section
            className="prd-panel"
            style={prdChatSplitPos ? { width: prdChatSplitPos, flex: 'none' } : undefined}
          >
            <div className="panel-header">
              <h3>PRD 文档</h3>
              <div className="panel-actions">
                {prdContent && !isEditingPrd && (
                  <>
                    <button className="btn-small" onClick={handleStartEditPrd}>编辑</button>
                    <button className="btn-small" onClick={() => setShowPrdVersions(!showPrdVersions)}>
                      {showPrdVersions ? '关闭历史' : '版本历史'}
                    </button>
                    <button className="btn-small" onClick={() => {
                      navigator.clipboard.writeText(prdContent)
                      setStatus('已复制到剪贴板')
                      setTimeout(() => setStatus(''), 2000)
                    }}>复制</button>
                    <button className="btn-small btn-export" onClick={handleExportDocx} disabled={exporting || streaming}>
                      {exporting ? '导出中...' : '导出 Word'}
                    </button>
                  </>
                )}
                {isEditingPrd && (
                  <>
                    <button className="btn-small btn-export" onClick={handleSavePrd} disabled={savingPrd}>
                      {savingPrd ? '保存中...' : '保存'}
                    </button>
                    <button className="btn-small" onClick={handleCancelEditPrd}>取消</button>
                  </>
                )}
              </div>
            </div>

            {/* Version history panel */}
            {showPrdVersions && (
              <div className="version-history-panel">
                <div className="version-history-header">
                  <h4>版本历史</h4>
                  <button className="btn-close-small" onClick={() => setShowPrdVersions(false)}>&times;</button>
                </div>
                <div className="version-history-list">
                  {prdVersions.length === 0 && <div className="version-empty">暂无版本记录</div>}
                  {prdVersions.map((v) => (
                    <div key={v.version} className="version-item" onClick={() => handleLoadPrdVersion(v.version)}>
                      <span className="version-badge">v{v.version}</span>
                      <span className="version-action">{VERSION_ACTION_LABELS[v.action] || v.action}</span>
                      <span className="version-time">{formatVersionTime(v.timestamp)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="prd-content">
              {isEditingPrd ? (
                <textarea
                  className="prd-editor"
                  value={editPrdContent}
                  onChange={(e) => setEditPrdContent(e.target.value)}
                  placeholder="编辑 PRD 内容（Markdown 格式）..."
                />
              ) : prdContent ? (
                <div className="markdown-body">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      img: ({ node, alt, src, ...props }) => (
                        <figure className="prd-image-figure">
                          <img src={src} alt={alt || ''} className="prd-image" loading="lazy" {...props} />
                          {alt && <figcaption className="prd-image-caption">{alt}</figcaption>}
                        </figure>
                      ),
                    }}
                  >
                    {prdContent}
                  </ReactMarkdown>
                  <div ref={prdEndRef} />
                </div>
              ) : (
                <div className="prd-empty">
                  <p>在右侧输入产品需求，AI 将为你生成 PRD 文档</p>
                </div>
              )}
            </div>
          </section>

          {/* Resizable drag handle for PRD/Chat */}
          <div className="prd-chat-split-handle" onMouseDown={handlePrdChatMouseDown}>
            <div className="split-handle-bar" />
          </div>

          {/* Right: Chat Panel */}
          <section className="chat-panel" style={prdChatSplitPos ? { flex: 1 } : undefined}>
            <div className="panel-header">
              <h3>需求对话</h3>
              {prdContent && prdVersions.length > 0 && (
                <div className="version-selector">
                  <select
                    className="version-select"
                    value={selectedRevisionVersion ?? ''}
                    onChange={(e) => setSelectedRevisionVersion(e.target.value ? parseInt(e.target.value) : null)}
                  >
                    <option value="">基于当前版本修改</option>
                    {prdVersions.map((v) => (
                      <option key={v.version} value={v.version}>
                        基于 v{v.version} ({VERSION_ACTION_LABELS[v.action] || v.action}) 修改
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="chat-messages">
              {messages.length === 0 && !streaming && (
                <div className="chat-welcome">
                  <p className="welcome-title">开始创建 PRD</p>
                  <p className="welcome-hint">描述你的产品需求，例如：</p>
                  <div className="welcome-examples">
                    <button className="example-btn" onClick={() => setInput('我想做一个团队任务管理工具，支持看板视图、任务分配、截止日期提醒和团队协作')}>
                      团队任务管理工具
                    </button>
                    <button className="example-btn" onClick={() => setInput('开发一个在线教育平台，包含课程管理、视频播放、作业提交和学习进度追踪')}>
                      在线教育平台
                    </button>
                    <button className="example-btn" onClick={() => setInput('构建一个电商小程序，需要商品展示、购物车、订单管理和微信支付功能')}>
                      电商小程序
                    </button>
                  </div>
                </div>
              )}

              {messages.map((msg, i) => (
                <div key={i} className={`chat-msg chat-msg-${msg.role}`}>
                  <div className="msg-avatar">{msg.role === 'user' ? '👤' : '🤖'}</div>
                  <div className="msg-bubble">
                    <div className="msg-content">{msg.content}</div>
                    {msg.timestamp && (
                      <div className="msg-time">
                        {new Date(msg.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {streaming && status && (
                <div className="chat-msg chat-msg-assistant">
                  <div className="msg-avatar">🤖</div>
                  <div className="msg-bubble">
                    <div className="msg-content msg-status"><span className="status-dot" />{status}</div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input area */}
            <div className="chat-input-area">
              {error && <div className="chat-error">{error}</div>}
              {selectedRevisionVersion && (
                <div className="revision-version-hint">
                  将基于版本 v{selectedRevisionVersion} 进行修改
                </div>
              )}
              <div className="chat-input-row">
                <textarea
                  ref={textareaRef}
                  className="chat-input"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={prdContent ? '输入修改意见，如：增加数据分析功能...' : '描述你的产品需求...'}
                  rows={3}
                  disabled={streaming}
                />
                <div className="input-actions">
                  {streaming ? (
                    <button className="btn-stop" onClick={handleStop}>停止</button>
                  ) : (
                    <button className="btn-send" onClick={handleSend} disabled={!input.trim()}>发送</button>
                  )}
                </div>
              </div>
              <div className="input-hint">
                {prdContent ? 'Enter 发送修改意见 · Shift+Enter 换行' : 'Enter 发送 · Shift+Enter 换行'}
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ===== Design Tab ===== */}
      {activeTab === 'design' && (
        <div className="design-tab-body">
          {!prdContent && pagesList.length === 0 && (
            <div className="design-content">
              <div className="design-empty">
                <div className="design-empty-icon">🎨</div>
                <p>请先在「PRD 文档」步骤中生成 PRD 文档</p>
                <p className="design-empty-hint">生成 PRD 后，即可在此处查看页面结构并生成产品界面设计图</p>
                <button className="btn-secondary" onClick={() => handleTabChange('prd')}>前往生成 PRD</button>
              </div>
            </div>
          )}

          {(prdContent || pagesList.length > 0) && (
            <div className="design-split-layout" ref={splitContainerRef}>
              {/* Left sidebar: Page list */}
              <aside className="design-page-list" style={{ width: splitWidth, minWidth: 260 }}>
                <div className="design-page-list-header">
                  <h3>页面列表</h3>
                  <div className="design-page-list-actions">
                    <button
                      className="btn-small"
                      onClick={() => setShowDesignVersions(!showDesignVersions)}
                      title="设计版本历史"
                    >
                      {showDesignVersions ? '关闭' : '版本'}
                    </button>
                    <span className="page-count">{pagesList.length} 个页面</span>
                  </div>
                </div>

                {/* Design version history panel */}
                {showDesignVersions && (
                  <div className="version-history-panel">
                    <div className="version-history-header">
                      <h4>设计版本历史</h4>
                      <button className="btn-close-small" onClick={() => setShowDesignVersions(false)}>&times;</button>
                    </div>
                    <div className="version-history-list">
                      {designVersions.length === 0 && <div className="version-empty">暂无版本记录</div>}
                      {designVersions.map((v) => (
                        <div key={v.version} className="version-item" onClick={() => handleLoadDesignVersion(v.version)}>
                          <span className="version-badge">v{v.version}</span>
                          <span className="version-action">{VERSION_ACTION_LABELS[v.action] || v.action}</span>
                          <span className="version-meta">{v.image_count} 张</span>
                          <span className="version-time">{formatVersionTime(v.timestamp)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {designError && <div className="design-error-inline">{designError}</div>}
                {(designGenerating || generatingPageId) && designStatus && (
                  <div className="design-progress-inline"><span className="status-dot" /><span>{designStatus}</span></div>
                )}

                <div className="design-page-items">
                  {pagesList.length === 0 && (
                    <div className="design-page-empty"><p>页面结构暂未生成</p><p>请先在 PRD 文档中完成需求描述</p></div>
                  )}
                  {pagesList.map((page, idx) => {
                    const image = getPageImage(page.id)
                    const isSelected = selectedPageId === page.id
                    const isGenerating = generatingPageId === page.id
                    const pageConfig = pageImageConfigs[page.id]
                    return (
                      <div
                        key={page.id}
                        className={`design-page-item ${isSelected ? 'design-page-item-active' : ''}`}
                        onClick={() => setSelectedPageId(page.id)}
                      >
                        <div className="design-page-item-header">
                          <span className="design-page-number">{idx + 1}</span>
                          <h4 className="design-page-name">{page.name}</h4>
                          {image && <span className="design-page-done-badge">已生成</span>}
                        </div>
                        <p className="design-page-desc">{page.description || '暂无描述'}</p>
                        {page.keyElements && page.keyElements.length > 0 && (
                          <div className="design-page-elements">
                            {page.keyElements.slice(0, 4).map((el, i) => (
                              <span key={i} className="design-element-tag">{el}</span>
                            ))}
                            {page.keyElements.length > 4 && (
                              <span className="design-element-tag design-element-more">+{page.keyElements.length - 4}</span>
                            )}
                          </div>
                        )}
                        {pageConfig && (
                          <div className="design-page-config-tags">
                            {pageConfig.resolution && <span className="config-tag">{pageConfig.resolution}</span>}
                            {pageConfig.ratio && <span className="config-tag">{pageConfig.ratio}</span>}
                            {pageConfig.extraRequirements && <span className="config-tag" title={pageConfig.extraRequirements}>+其他要求</span>}
                          </div>
                        )}
                        <div className="design-page-btn-row">
                          <button className="btn-page-action btn-edit-content" onClick={(e) => handleOpenEditPage(page, e)}>编辑内容</button>
                          <button className="btn-page-action btn-image-config" onClick={(e) => handleOpenImageConfig(page.id, e)}>图片配置</button>
                          <button
                            className={`btn-page-action btn-generate-inline ${isGenerating ? 'btn-generating' : ''}`}
                            onClick={(e) => { e.stopPropagation(); if (!isGenerating && !designGenerating) handleGeneratePageDesign(page.id) }}
                            disabled={isGenerating || designGenerating}
                          >
                            {isGenerating ? '生成中...' : image ? '重新生成' : '生成设计图'}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {pagesList.length > 0 && (
                  <div className="design-page-list-footer">
                    {designGenerating ? (
                      <button className="btn-stop btn-full" onClick={handleStopDesign}>停止生成</button>
                    ) : (
                      <button className="btn-primary btn-full" onClick={handleGenerateAllDesigns} disabled={generatingPageId !== null}>
                        {designImages.length > 0 ? '重新生成所有设计图' : '一键生成所有设计图'}
                      </button>
                    )}
                  </div>
                )}
              </aside>

              {/* Resizable drag handle */}
              <div className="design-split-handle" onMouseDown={handleSplitMouseDown}>
                <div className="split-handle-bar" />
              </div>

              {/* Right panel: Preview */}
              <main className="design-preview-panel">
                {!selectedPageId && pagesWithImages.length === 0 && (
                  <div className="design-preview-empty">
                    <div className="design-empty-icon">🖼️</div>
                    <p>选择左侧页面并点击「生成设计图」</p>
                    <p className="design-empty-hint">生成的设计图将在此处以 PPT 风格展示</p>
                  </div>
                )}

                {pagesWithImages.length > 0 && !selectedPageId && (
                  <div className="design-slideshow">
                    <div className="slide-container">
                      <div className="slide-image-wrapper">
                        <img src={getPageImage(pagesWithImages[currentSlideIndex]?.id)?.image_url} alt={pagesWithImages[currentSlideIndex]?.name} />
                      </div>
                      <div className="slide-info">
                        <h3>{pagesWithImages[currentSlideIndex]?.name}</h3>
                        <p>{pagesWithImages[currentSlideIndex]?.description}</p>
                      </div>
                    </div>
                    <div className="slide-controls">
                      <button className="slide-nav-btn" onClick={handlePrevSlide} disabled={currentSlideIndex === 0}>&#8592; 上一页</button>
                      <span className="slide-counter">{currentSlideIndex + 1} / {pagesWithImages.length}</span>
                      <button className="slide-nav-btn" onClick={handleNextSlide} disabled={currentSlideIndex === pagesWithImages.length - 1}>下一页 &#8594;</button>
                      <button
                        className="slide-nav-btn slide-download-btn"
                        onClick={() => {
                          const page = pagesWithImages[currentSlideIndex]
                          const img = getPageImage(page?.id)
                          if (img?.image_url) {
                            const ext = img.image_url.startsWith('data:image/png') ? 'png' : 'jpg'
                            handleDownloadImage(img.image_url, `${project?.name || 'design'}_${page.name}.${ext}`)
                          }
                        }}
                        title="下载当前设计图"
                      >
                        &#11015; 下载
                      </button>
                      <button
                        className="slide-nav-btn slide-download-btn"
                        onClick={handleDownloadAllImages}
                        title="下载所有设计图"
                      >
                        &#11015; 全部下载
                      </button>
                    </div>
                    <div className="slide-thumbnails">
                      {pagesWithImages.map((page, idx) => {
                        const img = getPageImage(page.id)
                        return (
                          <div key={page.id} className={`slide-thumbnail ${idx === currentSlideIndex ? 'slide-thumbnail-active' : ''}`} onClick={() => setCurrentSlideIndex(idx)}>
                            <img src={img?.image_url} alt={page.name} />
                            <span className="slide-thumbnail-label">{page.name}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {selectedPageId && (
                  <div className="design-page-detail">
                    <div className="design-page-detail-header">
                      <button className="btn-back-small" onClick={() => setSelectedPageId(null)}>&#8592; 返回总览</button>
                      <h3>{getSelectedPage()?.name}</h3>
                      {getPageImage(selectedPageId) && (
                        <button
                          className="btn-small btn-download-design"
                          onClick={() => {
                            const img = getPageImage(selectedPageId)
                            const page = getSelectedPage()
                            if (img?.image_url) {
                              const ext = img.image_url.startsWith('data:image/png') ? 'png' : 'jpg'
                              handleDownloadImage(img.image_url, `${project?.name || 'design'}_${page?.name || 'page'}.${ext}`)
                            }
                          }}
                          title="下载设计图"
                        >
                          &#11015; 下载设计图
                        </button>
                      )}
                    </div>
                    {getPageImage(selectedPageId) ? (
                      <div className="design-page-detail-image">
                        <div className="slide-image-wrapper">
                          <img src={getPageImage(selectedPageId)?.image_url} alt={getSelectedPage()?.name} />
                        </div>
                        <div className="slide-info">
                          <p>{getSelectedPage()?.description}</p>
                          {getSelectedPage()?.layoutDescription && (
                            <p className="layout-desc"><strong>布局：</strong>{getSelectedPage()?.layoutDescription}</p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="design-preview-empty">
                        <div className="design-empty-icon">🖼️</div>
                        <p>该页面尚未生成设计图</p>
                        <p className="design-empty-hint">{getSelectedPage()?.description}</p>
                        <button className="btn-primary" onClick={() => handleGeneratePageDesign(selectedPageId)} disabled={generatingPageId !== null || designGenerating}>
                          {generatingPageId === selectedPageId ? '生成中...' : '生成设计图'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </main>
            </div>
          )}

          {/* Edit Content Modal */}
          {editingPage && (
            <div className="modal-overlay" onClick={() => setEditingPage(null)}>
              <div className="modal modal-extra-wide" onClick={(e) => e.stopPropagation()}>
                <h2>编辑页面内容</h2>
                <div className="modal-form">
                  <label className="form-label">
                    页面名称
                    <input type="text" className="form-input" value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
                  </label>
                  <label className="form-label">
                    页面描述
                    <textarea className="form-textarea" rows={4} value={editForm.description} onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))} />
                  </label>
                  <label className="form-label">
                    关键元素（逗号分隔）
                    <input type="text" className="form-input" value={editForm.keyElements} onChange={(e) => setEditForm((f) => ({ ...f, keyElements: e.target.value }))} placeholder="如：导航栏, 搜索框, 商品列表" />
                  </label>
                </div>
                <div className="modal-actions">
                  <button className="btn-secondary" onClick={() => setEditingPage(null)}>取消</button>
                  <button className="btn-primary" onClick={handleSaveEditPage}>保存</button>
                </div>
              </div>
            </div>
          )}

          {/* Image Config Modal */}
          {imageConfigPage && (
            <div className="modal-overlay" onClick={() => setImageConfigPage(null)}>
              <div className="modal" onClick={(e) => e.stopPropagation()}>
                <h2>图片生成配置</h2>
                <div className="modal-form">
                  <label className="form-label">
                    图片分辨率
                    <select className="form-select" value={pageImageConfigs[imageConfigPage]?.resolution || ''} onChange={(e) => {
                      const val = e.target.value
                      setPageImageConfigs((prev) => ({ ...prev, [imageConfigPage]: { ...prev[imageConfigPage], resolution: val } }))
                    }}>
                      <option value="">{project?.default_image_resolution ? `项目默认 (${project.default_image_resolution})` : '默认'}</option>
                      {RESOLUTION_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                  </label>
                  <label className="form-label">
                    图片比例
                    <select className="form-select" value={pageImageConfigs[imageConfigPage]?.ratio || ''} onChange={(e) => {
                      const val = e.target.value
                      setPageImageConfigs((prev) => ({ ...prev, [imageConfigPage]: { ...prev[imageConfigPage], ratio: val } }))
                    }}>
                      <option value="">{project?.default_image_ratio ? `项目默认 (${project.default_image_ratio})` : '默认'}</option>
                      {RATIO_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                  </label>
                  <label className="form-label">
                    其他要求
                    <textarea
                      className="form-textarea"
                      rows={3}
                      placeholder="输入对图片的其他要求，如：使用深色主题、突出品牌色、增加数据图表元素..."
                      value={pageImageConfigs[imageConfigPage]?.extraRequirements || ''}
                      onChange={(e) => {
                        const val = e.target.value
                        setPageImageConfigs((prev) => ({ ...prev, [imageConfigPage]: { ...prev[imageConfigPage], extraRequirements: val } }))
                      }}
                    />
                  </label>
                </div>
                <div className="modal-actions">
                  <button className="btn-secondary" onClick={() => setImageConfigPage(null)}>取消</button>
                  <button className="btn-primary" onClick={() => handleSaveImageConfig(imageConfigPage, pageImageConfigs[imageConfigPage] || {})}>确定</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== Comprehensive Tab ===== */}
      {activeTab === 'comprehensive' && (
        <div className="comprehensive-tab-body">
          {!prdContent ? (
            <div className="design-content">
              <div className="design-empty">
                <div className="design-empty-icon">📑</div>
                <p>请先生成 PRD 文档和产品界面设计</p>
                <p className="design-empty-hint">综合方案将合并 PRD 文档和产品界面设计图，通过 AI 整合生成图文并茂的产品方案</p>
                <button className="btn-secondary" onClick={() => handleTabChange('prd')}>前往生成 PRD</button>
              </div>
            </div>
          ) : (
            <div className="comprehensive-layout">
              {/* Left: Content display/edit area */}
              <section className="comprehensive-main">
                {/* Toolbar */}
                <div className="comprehensive-toolbar">
                  <div className="comprehensive-toolbar-left">
                    <h3>综合产品方案</h3>
                    {comprehensiveGenerating && (
                      <span className="comprehensive-streaming-badge">{comprehensiveStatus || 'AI 整合中...'}</span>
                    )}
                    {!comprehensiveGenerating && comprehensiveStatus && (
                      <span className="comprehensive-streaming-badge">{comprehensiveStatus}</span>
                    )}
                  </div>
                  <div className="comprehensive-toolbar-actions">
                    {comprehensiveContent && !isEditingComprehensive && (
                      <>
                        <button className="btn-secondary btn-sm" onClick={handleStartEditComprehensive}>编辑</button>
                        <button className="btn-secondary btn-sm" onClick={() => setShowComprehensiveVersions(!showComprehensiveVersions)}>
                          历史版本
                        </button>
                      </>
                    )}
                    {isEditingComprehensive && (
                      <>
                        <button className="btn-secondary btn-sm" onClick={handleCancelEditComprehensive} disabled={savingComprehensive}>取消</button>
                        <button className="btn-primary btn-sm" onClick={handleSaveComprehensive} disabled={savingComprehensive}>
                          {savingComprehensive ? '保存中...' : '保存'}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Version history dropdown */}
                {showComprehensiveVersions && (
                  <div className="version-dropdown">
                    <div className="version-dropdown-header">
                      <span>综合方案历史版本</span>
                      <button className="btn-text" onClick={() => setShowComprehensiveVersions(false)}>关闭</button>
                    </div>
                    {comprehensiveVersions.length === 0 ? (
                      <div className="version-empty">暂无历史版本</div>
                    ) : (
                      <div className="version-list">
                        {comprehensiveVersions.map((v) => (
                          <div className={`version-item ${selectedComprehensiveVersion === v.version ? 'version-item-active' : ''}`} key={v.version}>
                            <div className="version-info">
                              <span className="version-num">v{v.version}</span>
                              <span className="version-action">{VERSION_ACTION_LABELS[v.action] || v.action}</span>
                              <span className="version-time">{formatVersionTime(v.timestamp)}</span>
                            </div>
                            <button
                              className="btn-text btn-sm"
                              onClick={() => handleLoadComprehensiveVersion(v.version)}
                              disabled={loadingComprehensiveVersion}
                            >
                              加载
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Content area */}
                <div className="comprehensive-content-area">
                  {!comprehensiveContent && !comprehensiveGenerating ? (
                    <div className="comprehensive-empty-content">
                      <p>点击右侧「生成综合方案」按钮，通过大语言模型将 PRD 文档和产品界面设计信息整合为一份综合产品方案。</p>
                    </div>
                  ) : isEditingComprehensive ? (
                    <textarea
                      className="comprehensive-editor"
                      value={editComprehensiveContent}
                      onChange={(e) => setEditComprehensiveContent(e.target.value)}
                    />
                  ) : (
                    <div className="comprehensive-preview prd-markdown">
                      {comprehensiveMarkdown}
                      <div ref={comprehensiveEndRef} />
                    </div>
                  )}
                </div>

                {comprehensiveError && <div className="chat-error comprehensive-error-bar">{comprehensiveError}</div>}
              </section>

              {/* Right: Summary & Export panel */}
              <aside className="comprehensive-sidebar">
                <div className="comprehensive-card">
                  <h4>方案状态</h4>
                  <div className="comprehensive-summary">
                    <div className="summary-item">
                      <span className="summary-label">PRD 文档</span>
                      <span className="summary-value summary-ok">已生成 (v{project?.version})</span>
                    </div>
                    <div className="summary-item">
                      <span className="summary-label">界面设计</span>
                      <span className={`summary-value ${designImages.length > 0 ? 'summary-ok' : 'summary-warn'}`}>
                        {designImages.length > 0 ? `${designImages.length} 张设计图` : '未生成'}
                      </span>
                    </div>
                    <div className="summary-item">
                      <span className="summary-label">AI 整合</span>
                      <span className={`summary-value ${comprehensiveContent ? 'summary-ok' : 'summary-warn'}`}>
                        {comprehensiveContent ? '已完成' : '待整合'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="comprehensive-card">
                  <h4>生成方案</h4>
                  <button
                    className="btn-primary btn-full"
                    onClick={handleComprehensiveGenerate}
                    disabled={comprehensiveGenerating}
                  >
                    {comprehensiveGenerating ? 'AI 整合中...' : comprehensiveContent ? '重新生成综合方案' : '生成综合方案'}
                  </button>
                </div>

                {comprehensiveVersions.length > 0 && (
                  <div className="comprehensive-card">
                    <h4>选择方案版本</h4>
                    <div className="comprehensive-version-selector">
                      <select
                        className="form-select"
                        value={selectedComprehensiveVersion ?? ''}
                        onChange={(e) => {
                          const ver = e.target.value ? parseInt(e.target.value) : null
                          setSelectedComprehensiveVersion(ver)
                          if (ver) handleLoadComprehensiveVersion(ver)
                        }}
                      >
                        <option value="">请选择版本</option>
                        {comprehensiveVersions.map((v) => (
                          <option key={v.version} value={v.version}>
                            v{v.version} - {VERSION_ACTION_LABELS[v.action] || v.action} ({formatVersionTime(v.timestamp)})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                <div className="comprehensive-card">
                  <h4>导出方案</h4>
                  <div className="comprehensive-format">
                    <div className="format-options format-options-vertical">
                      <label className={`format-option ${comprehensiveFormat === 'docx' ? 'format-active' : ''}`}>
                        <input type="radio" name="format" value="docx" checked={comprehensiveFormat === 'docx'} onChange={() => setComprehensiveFormat('docx')} />
                        <div className="format-info">
                          <span className="format-icon">📝</span>
                          <span className="format-name">Word (.docx)</span>
                          <span className="format-desc">适合编辑和打印</span>
                        </div>
                      </label>
                      <label className={`format-option ${comprehensiveFormat === 'pptx' ? 'format-active' : ''}`}>
                        <input type="radio" name="format" value="pptx" checked={comprehensiveFormat === 'pptx'} onChange={() => setComprehensiveFormat('pptx')} />
                        <div className="format-info">
                          <span className="format-icon">📊</span>
                          <span className="format-name">PPT (.pptx)</span>
                          <span className="format-desc">适合演示和汇报</span>
                        </div>
                      </label>
                      <label className={`format-option ${comprehensiveFormat === 'pdf' ? 'format-active' : ''}`}>
                        <input type="radio" name="format" value="pdf" checked={comprehensiveFormat === 'pdf'} onChange={() => setComprehensiveFormat('pdf')} />
                        <div className="format-info">
                          <span className="format-icon">📄</span>
                          <span className="format-name">PDF</span>
                          <span className="format-desc">适合分享和归档</span>
                        </div>
                      </label>
                    </div>
                  </div>

                  <button
                    className="btn-primary btn-full"
                    onClick={handleComprehensiveExportSelected}
                    disabled={comprehensiveExporting || !selectedComprehensiveVersion}
                    title={!selectedComprehensiveVersion ? '请先选择一个综合方案版本' : ''}
                  >
                    {comprehensiveExporting ? '正在导出...' : !selectedComprehensiveVersion ? '请先选择版本' : '导出综合方案'}
                  </button>
                </div>
              </aside>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
