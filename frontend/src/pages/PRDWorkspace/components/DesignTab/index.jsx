/**
 * DesignTab Component
 *
 * Handles UI prototype image generation, page management, and design history.
 * Features:
 * - Split layout with page list sidebar and maximized image preview
 * - Global style presets with visual thumbnail selection for ToB management systems
 * - Proper API integration for design generation
 */
import { useCallback, useRef, useMemo } from 'react'
import { useDesignStore } from '../../../../stores'
import { generateDesigns, generateSinglePageDesign, saveDesignSettings } from '../../../../services/api'

// ---------------------------------------------------------------------------
// Style Presets for ToB Management Systems
// ---------------------------------------------------------------------------
const STYLE_PRESETS = [
  {
    id: 'classic-blue',
    name: '经典蓝白',
    desc: '蓝色顶部导航 + 白色侧边栏，经典企业管理风格',
    colors: { topNav: '#1890ff', sideNav: '#ffffff', sideBorder: '#e8e8e8', content: '#f0f2f5', accent: '#1890ff' },
    globalStyle: {
      designStyle: 'Clean corporate Ant Design style with consistent spacing, flat design, blue and white theme, professional enterprise management system',
      colorScheme: 'Primary blue (#1890ff) top navigation bar with white text, white left sidebar with light gray (#e8e8e8) borders, light gray (#f0f2f5) content background, white content cards with subtle shadow',
      layoutRequirements: 'Fixed blue header navigation bar at top spanning full width with logo on left, global search in center, notifications and user avatar dropdown on right. Left vertical white sidebar (220px wide) with collapsible menu groups, icons, and active state highlight. Main scrollable content area on the right with breadcrumb navigation at top.',
      fontStyle: 'Clean sans-serif typography (PingFang SC / Microsoft YaHei), 14px base size, consistent heading hierarchy',
      customNotes: '',
    },
  },
  {
    id: 'dark-sidebar',
    name: '深色侧边栏',
    desc: '白色顶部 + 深色侧边栏，现代管理后台风格',
    colors: { topNav: '#ffffff', sideNav: '#001529', sideBorder: 'transparent', content: '#f0f2f5', accent: '#1890ff' },
    globalStyle: {
      designStyle: 'Modern enterprise admin dashboard with dark sidebar navigation, Ant Design Pro style, clean and professional',
      colorScheme: 'White top header bar with subtle bottom border, dark navy (#001529) left sidebar with light text and blue (#1890ff) active highlights, light gray (#f0f2f5) main content background, white cards',
      layoutRequirements: 'White top header bar with logo area on left, global search, notifications bell, and user profile on right. Dark navy left sidebar (240px wide) with application logo at top, grouped menu items with icons, collapsible sub-menus, and blue active indicator. Main content area with breadcrumbs and page title.',
      fontStyle: 'Clean sans-serif typography, 14px base, sidebar text in light gray/white, content in dark gray',
      customNotes: '',
    },
  },
  {
    id: 'minimal-gray',
    name: '极简灰白',
    desc: '浅色顶部 + 浅灰侧边栏，极简清爽风格',
    colors: { topNav: '#fafafa', sideNav: '#f5f5f5', sideBorder: '#e8e8e8', content: '#ffffff', accent: '#722ed1' },
    globalStyle: {
      designStyle: 'Minimalist clean design with lots of whitespace, subtle borders, elegant and modern SaaS application style',
      colorScheme: 'Very light gray (#fafafa) top header, light gray (#f5f5f5) left sidebar, pure white (#ffffff) content area, purple (#722ed1) accent color for active states and buttons, minimal use of color',
      layoutRequirements: 'Slim top header bar with minimalist logo, sparse navigation icons, user avatar. Light gray left sidebar with clean text-only menu items (no heavy icons), subtle hover effects, thin active indicator bar. Spacious white content area with generous padding.',
      fontStyle: 'Elegant thin sans-serif fonts, ample line spacing, muted text colors for secondary content',
      customNotes: '',
    },
  },
  {
    id: 'tech-dark',
    name: '科技深蓝',
    desc: '深蓝色调，科技感数据管理平台风格',
    colors: { topNav: '#002140', sideNav: '#001529', sideBorder: 'transparent', content: '#f0f2f5', accent: '#13c2c2' },
    globalStyle: {
      designStyle: 'Technology-focused dark theme enterprise platform, data-driven dashboard style, modern and sophisticated with cyan/teal accents',
      colorScheme: 'Dark blue (#002140) top header with light text, dark navy (#001529) left sidebar, light gray (#f0f2f5) content background with white cards, teal/cyan (#13c2c2) accent color for active states, buttons, and data highlights',
      layoutRequirements: 'Dark blue top header with tech-style logo, global search with dark input, notification badges, user dropdown. Dark navy sidebar with grouped navigation, icon indicators, teal active highlight, subtle section dividers. Main content area with stat cards, data tables, and chart placeholders.',
      fontStyle: 'Modern sans-serif, medium weight headings, monospaced numbers for data displays',
      customNotes: '',
    },
  },
  {
    id: 'fresh-green',
    name: '清新绿色',
    desc: '白色主调 + 绿色强调，清新专业风格',
    colors: { topNav: '#ffffff', sideNav: '#f6ffed', sideBorder: '#d9f7be', content: '#fafafa', accent: '#52c41a' },
    globalStyle: {
      designStyle: 'Fresh and professional design with green nature-inspired accents, clean enterprise application style, friendly and approachable',
      colorScheme: 'White (#ffffff) top header with green (#52c41a) logo accent, very light green (#f6ffed) left sidebar with green active highlights and light green (#d9f7be) borders, off-white (#fafafa) content background, white cards with subtle shadows',
      layoutRequirements: 'White top header with green-accented logo, clean navigation links, search bar, user avatar. Light green left sidebar with tree-style navigation menu, green dot active indicators, icon + text menu items. Main content area with card-based layout.',
      fontStyle: 'Rounded sans-serif fonts, warm and friendly typography, clear heading hierarchy with green accents',
      customNotes: '',
    },
  },
  {
    id: 'custom',
    name: '自定义',
    desc: '手动输入设计风格和配色方案',
    colors: { topNav: '#e0e0e0', sideNav: '#e8e8e8', sideBorder: '#d0d0d0', content: '#f5f5f5', accent: '#666666' },
    globalStyle: null, // means use the manual input fields
  },
]

/**
 * Render a mini thumbnail of the layout style with enhanced visual details
 */
function StyleThumbnail({ colors }) {
  const isDarkSidebar = colors.sideNav === '#001529'
  const isDarkTopNav = colors.topNav !== '#ffffff' && colors.topNav !== '#fafafa'
  const menuInactive = isDarkSidebar ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.06)'

  return (
    <div className="style-thumb">
      {/* Top nav bar with logo + search + avatar */}
      <div
        className="style-thumb-topnav"
        style={{
          background: colors.topNav,
          borderBottom: !isDarkTopNav ? '1px solid #e0e0e0' : 'none',
          display: 'flex',
          alignItems: 'center',
          padding: '0 4px',
          gap: 3,
        }}
      >
        <div style={{ width: 12, height: 4, borderRadius: 1, background: isDarkTopNav ? 'rgba(255,255,255,0.7)' : colors.accent, flexShrink: 0 }} />
        <div style={{ flex: 1 }} />
        <div style={{ width: 16, height: 3, borderRadius: 1, background: isDarkTopNav ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.06)', flexShrink: 0 }} />
        <div style={{ flex: 1 }} />
        <div style={{ width: 5, height: 5, borderRadius: '50%', background: isDarkTopNav ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.12)', flexShrink: 0 }} />
      </div>
      <div className="style-thumb-body">
        {/* Side nav with menu items */}
        <div
          className="style-thumb-sidenav"
          style={{
            background: colors.sideNav,
            borderRight: colors.sideBorder !== 'transparent' ? `1px solid ${colors.sideBorder}` : 'none',
          }}
        >
          <div className="style-thumb-menu-item" style={{ background: colors.accent, opacity: 0.8 }} />
          <div className="style-thumb-menu-item" style={{ background: menuInactive }} />
          <div className="style-thumb-menu-item" style={{ background: menuInactive }} />
          <div className="style-thumb-menu-item" style={{ background: menuInactive, opacity: 0.5 }} />
        </div>
        {/* Content area with cards and table-like elements */}
        <div className="style-thumb-content" style={{ background: colors.content }}>
          {/* Stat cards row */}
          <div style={{ display: 'flex', gap: 2, height: '28%' }}>
            <div style={{ flex: 1, background: '#fff', borderRadius: 2, border: '1px solid rgba(0,0,0,0.06)' }} />
            <div style={{ flex: 1, background: '#fff', borderRadius: 2, border: '1px solid rgba(0,0,0,0.06)' }} />
            <div style={{ flex: 1, background: '#fff', borderRadius: 2, border: '1px solid rgba(0,0,0,0.06)' }} />
          </div>
          {/* Table card */}
          <div style={{ flex: 1, background: '#fff', borderRadius: 2, border: '1px solid rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', padding: 2, gap: 1 }}>
            <div style={{ height: 3, background: colors.accent, opacity: 0.15, borderRadius: 1 }} />
            <div style={{ height: 2, background: 'rgba(0,0,0,0.04)', borderRadius: 1 }} />
            <div style={{ height: 2, background: 'rgba(0,0,0,0.04)', borderRadius: 1 }} />
          </div>
        </div>
      </div>
      {/* Color swatches strip */}
      <div className="style-thumb-swatches">
        <span className="style-swatch" style={{ background: colors.topNav, border: colors.topNav === '#ffffff' || colors.topNav === '#fafafa' ? '1px solid #ddd' : 'none' }} />
        <span className="style-swatch" style={{ background: colors.sideNav, border: colors.sideNav === '#ffffff' || colors.sideNav === '#f6ffed' || colors.sideNav === '#f5f5f5' ? '1px solid #ddd' : 'none' }} />
        <span className="style-swatch" style={{ background: colors.accent }} />
        <span className="style-swatch" style={{ background: colors.content, border: '1px solid #ddd' }} />
      </div>
    </div>
  )
}

/**
 * Format globalStyle object into a descriptive string for the API
 */
function formatGlobalStyleString(gs) {
  if (!gs) return ''
  const parts = []
  if (gs.designStyle) parts.push(`Design style: ${gs.designStyle}`)
  if (gs.colorScheme) parts.push(`Color scheme: ${gs.colorScheme}`)
  if (gs.layoutRequirements) parts.push(`Navigation layout: ${gs.layoutRequirements}`)
  if (gs.fontStyle) parts.push(`Typography: ${gs.fontStyle}`)
  if (gs.customNotes) parts.push(gs.customNotes)
  return parts.join('. ')
}

export default function DesignTab({ projectId, canEdit }) {
  const {
    images,
    generating,
    status,
    error,
    pagesList,
    selectedPageId,
    generatingPageId,
    currentSlideIndex,
    showGlobalStyleModal,
    selectedPresetId,
    globalStyle,
    pageImageConfigs,
    setSelectedPageId,
    setShowGlobalStyleModal,
    setSelectedPresetId,
    setGlobalStyle,
    setGenerating,
    setGeneratingPageId,
    setStatus,
    setError,
    setCurrentSlideIndex,
    addImage,
    updatePageConfig,
    nextSlide,
    prevSlide,
  } = useDesignStore()

  const abortRef = useRef(null)

  // Get images for selected page
  const selectedPageImages = useMemo(() => {
    if (!selectedPageId) return images
    return images.filter((img) => img.page_id === selectedPageId)
  }, [images, selectedPageId])

  // Current slide within the active image set
  const activeImages = selectedPageImages.length > 0 ? selectedPageImages : images
  const safeIndex = Math.min(currentSlideIndex, Math.max(0, activeImages.length - 1))
  const currentImage = activeImages[safeIndex]

  // Check if global style is configured
  const hasGlobalStyle = !!(globalStyle.designStyle || globalStyle.colorScheme || globalStyle.layoutRequirements)

  // Handle batch generation
  const handleGenerateAll = useCallback(() => {
    if (generating) return
    setGenerating(true)
    setError(null)
    setStatus('正在准备生成设计图...')

    const globalStyleStr = formatGlobalStyleString(globalStyle)

    abortRef.current = generateDesigns(projectId, {
      onImage: (data) => {
        addImage(data)
        setStatus(`已生成: ${data.page_name}`)
      },
      onStatus: (msg) => setStatus(msg),
      onDone: () => {
        setGenerating(false)
        setStatus('全部设计图生成完成')
      },
      onError: (msg) => {
        setGenerating(false)
        setError(msg)
        setStatus('')
      },
    }, { globalStyle: globalStyleStr })
  }, [projectId, generating, globalStyle, setGenerating, setError, setStatus, addImage])

  // Handle single page generation
  const handleGeneratePage = useCallback((page) => {
    if (generatingPageId) return
    setGeneratingPageId(page.id)
    setError(null)
    setStatus(`正在生成「${page.name}」的设计图...`)

    const config = pageImageConfigs[page.id] || {}
    const globalStyleStr = formatGlobalStyleString(globalStyle)
    // Merge global style into extra requirements
    const extraReqs = [globalStyleStr, config.extraRequirements].filter(Boolean).join('. ')

    abortRef.current = generateSinglePageDesign(projectId, page.id, {
      onImage: (data) => {
        addImage(data)
        setStatus(`「${page.name}」设计图已生成`)
      },
      onStatus: (msg) => setStatus(msg),
      onDone: () => {
        setGeneratingPageId(null)
        setStatus('')
      },
      onError: (msg) => {
        setGeneratingPageId(null)
        setError(msg)
        setStatus('')
      },
    }, {
      resolution: config.resolution || '',
      ratio: config.ratio || '',
      extraRequirements: extraReqs,
      referenceImage: config.referenceImage || '',
    })
  }, [projectId, generatingPageId, globalStyle, pageImageConfigs, setGeneratingPageId, setError, setStatus, addImage])

  // Handle preset selection
  const handleSelectPreset = useCallback((preset) => {
    setSelectedPresetId(preset.id)
    if (preset.globalStyle) {
      setGlobalStyle({ ...preset.globalStyle })
    }
  }, [setSelectedPresetId, setGlobalStyle])

  // Handle applying global style and persist to DB
  const handleApplyGlobalStyle = useCallback(() => {
    setShowGlobalStyleModal(false)
    // Save design settings to database
    saveDesignSettings(projectId, {
      selectedPresetId,
      globalStyle,
      pageImageConfigs,
    }).catch((err) => console.warn('Failed to save design settings:', err))
  }, [projectId, setShowGlobalStyleModal, selectedPresetId, globalStyle, pageImageConfigs])

  // Check if page has generated image
  const pageHasImage = useCallback((pageId) => {
    return images.some((img) => img.page_id === pageId)
  }, [images])

  return (
    <div className="design-tab-body">
      {/* Global style indicator bar */}
      {hasGlobalStyle && (
        <div className="global-style-indicator" onClick={() => setShowGlobalStyleModal(true)}>
          <span className="global-style-dot" />
          <span className="global-style-text">
            已设置全局样式: {globalStyle.designStyle ? globalStyle.designStyle.substring(0, 40) : '已配置'}
            {globalStyle.designStyle && globalStyle.designStyle.length > 40 ? '...' : ''}
          </span>
          {selectedPresetId && selectedPresetId !== 'custom' && (
            <span className="global-style-tag">
              {STYLE_PRESETS.find((p) => p.id === selectedPresetId)?.name}
            </span>
          )}
        </div>
      )}

      {/* Error/Status bar */}
      {error && <div className="design-error-inline">{error}</div>}
      {status && !error && generating && (
        <div className="design-progress-inline">
          <span className="status-dot" />
          {status}
        </div>
      )}

      {/* Main split layout */}
      {pagesList.length === 0 ? (
        <div className="design-empty">
          <div className="design-empty-icon">🎨</div>
          <p>暂无页面结构</p>
          <p className="design-empty-hint">请先在 PRD 文档中生成需求分析，系统将自动创建页面结构</p>
        </div>
      ) : (
        <div className="design-split-layout">
          {/* Left: Page List Sidebar */}
          <div className="design-page-list" style={{ width: 280, minWidth: 220 }}>
            <div className="design-page-list-header">
              <h3>页面列表</h3>
              <span className="page-count">{pagesList.length} 页</span>
            </div>

            <div className="design-page-items">
              {pagesList.filter((p) => p.category !== 'archived' && p.category !== 'deleted').map((page, idx) => (
                <div
                  key={page.id}
                  className={`design-page-item ${selectedPageId === page.id ? 'design-page-item-active' : ''}`}
                  onClick={() => {
                    setSelectedPageId(page.id)
                    // Jump to this page's image if exists
                    const imgIdx = activeImages.findIndex((img) => img.page_id === page.id)
                    if (imgIdx >= 0) setCurrentSlideIndex(imgIdx)
                  }}
                >
                  <div className="design-page-item-header">
                    <span className="design-page-number">{idx + 1}</span>
                    <h4 className="design-page-name">{page.name}</h4>
                    {pageHasImage(page.id) && <span className="design-page-done-badge">已生成</span>}
                  </div>
                  {page.description && (
                    <p className="design-page-desc">{page.description}</p>
                  )}
                  {canEdit && (
                    <div className="design-page-btn-row">
                      <button
                        className={`btn-page-action btn-generate-inline ${generatingPageId === page.id ? 'btn-generating' : ''}`}
                        disabled={generatingPageId === page.id || generating}
                        onClick={(e) => { e.stopPropagation(); handleGeneratePage(page) }}
                      >
                        {generatingPageId === page.id ? '生成中...' : '生成设计图'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Footer with action buttons */}
            {canEdit && (
              <div className="design-page-list-footer">
                <button
                  className={`btn-small btn-full ${hasGlobalStyle ? 'btn-global-style-active' : 'btn-global-style'}`}
                  onClick={() => setShowGlobalStyleModal(true)}
                >
                  {hasGlobalStyle ? '修改全局样式' : '设置全局样式'}
                </button>
                <button
                  className="btn-small btn-full"
                  style={{ marginTop: 8 }}
                  disabled={generating}
                  onClick={handleGenerateAll}
                >
                  {generating ? '生成中...' : '批量生成所有页面'}
                </button>
              </div>
            )}
          </div>

          {/* Right: Preview Panel - Maximized */}
          <div className="design-preview-panel">
            {activeImages.length === 0 ? (
              <div className="design-preview-empty">
                <div style={{ fontSize: 48, marginBottom: 16 }}>🖼️</div>
                <p style={{ fontSize: 16, color: 'var(--text)', marginBottom: 8 }}>暂无设计图</p>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                  {canEdit ? '选择页面后点击「生成设计图」开始' : '设计图生成后将在此显示'}
                </p>
              </div>
            ) : (
              <div className="design-slideshow">
                {/* Image container - takes maximum space */}
                <div className="slide-container">
                  <div className="slide-image-wrapper">
                    {currentImage && (
                      <img
                        src={currentImage.image_url || currentImage.url}
                        alt={currentImage.page_name}
                      />
                    )}
                  </div>
                  {/* Minimal info bar - only page name */}
                  {currentImage && (
                    <div className="slide-info" style={{ padding: '10px 24px' }}>
                      <h3 style={{ fontSize: 14, margin: 0 }}>{currentImage.page_name}</h3>
                    </div>
                  )}
                </div>

                {/* Slide controls */}
                {activeImages.length > 1 && (
                  <>
                    <div className="slide-controls">
                      <button
                        className="slide-nav-btn"
                        disabled={safeIndex === 0}
                        onClick={() => setCurrentSlideIndex(Math.max(0, safeIndex - 1))}
                      >
                        ◀ 上一页
                      </button>
                      <span className="slide-counter">{safeIndex + 1} / {activeImages.length}</span>
                      <button
                        className="slide-nav-btn"
                        disabled={safeIndex === activeImages.length - 1}
                        onClick={() => setCurrentSlideIndex(Math.min(activeImages.length - 1, safeIndex + 1))}
                      >
                        下一页 ▶
                      </button>
                    </div>

                    {/* Thumbnail strip */}
                    <div className="slide-thumbnails">
                      {activeImages.map((img, i) => (
                        <div
                          key={img.page_id + '-' + i}
                          className={`slide-thumbnail ${i === safeIndex ? 'slide-thumbnail-active' : ''}`}
                          onClick={() => setCurrentSlideIndex(i)}
                        >
                          <img src={img.image_url || img.url} alt={img.page_name} />
                          <span className="slide-thumbnail-label">{img.page_name}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Global Style Modal with Presets */}
      {showGlobalStyleModal && (
        <div className="modal-overlay" onClick={() => setShowGlobalStyleModal(false)}>
          <div className="modal modal-extra-wide" onClick={(e) => e.stopPropagation()}>
            <h2>全局界面风格设置</h2>
            <p className="modal-desc">
              选择一种预设风格或自定义设置，后续生成的所有页面设计图将保持统一的设计风格。
              适用于 ToB 管理系统（含顶部导航栏和侧边导航栏）。
            </p>

            {/* Style Preset Grid */}
            <div className="style-presets-grid">
              {STYLE_PRESETS.map((preset) => (
                <div
                  key={preset.id}
                  className={`style-preset-card ${selectedPresetId === preset.id ? 'style-preset-active' : ''}`}
                  onClick={() => handleSelectPreset(preset)}
                >
                  <StyleThumbnail colors={preset.colors} />
                  <div className="style-preset-info">
                    <div className="style-preset-name">{preset.name}</div>
                    <div className="style-preset-desc">{preset.desc}</div>
                  </div>
                  {selectedPresetId === preset.id && (
                    <div className="style-preset-check">✓</div>
                  )}
                </div>
              ))}
            </div>

            {/* Custom fields - shown when 'custom' preset is selected or for fine-tuning */}
            {selectedPresetId === 'custom' && (
              <div className="modal-form" style={{ marginTop: 16 }}>
                <label className="form-label">
                  设计风格
                  <input
                    className="form-input"
                    value={globalStyle.designStyle}
                    onChange={(e) => setGlobalStyle({ ...globalStyle, designStyle: e.target.value })}
                    placeholder="如: Modern corporate Ant Design style, clean and professional"
                  />
                </label>
                <label className="form-label">
                  配色方案
                  <input
                    className="form-input"
                    value={globalStyle.colorScheme}
                    onChange={(e) => setGlobalStyle({ ...globalStyle, colorScheme: e.target.value })}
                    placeholder="如: Blue (#1890ff) header, white sidebar, light gray content"
                  />
                </label>
                <label className="form-label">
                  导航布局
                  <textarea
                    className="form-textarea"
                    rows={3}
                    value={globalStyle.layoutRequirements}
                    onChange={(e) => setGlobalStyle({ ...globalStyle, layoutRequirements: e.target.value })}
                    placeholder="如: Top header with logo + search + user profile. Left sidebar with collapsible menu. Main content area on right."
                  />
                </label>
                <label className="form-label">
                  字体风格
                  <input
                    className="form-input"
                    value={globalStyle.fontStyle}
                    onChange={(e) => setGlobalStyle({ ...globalStyle, fontStyle: e.target.value })}
                    placeholder="如: Clean sans-serif, 14px base, consistent hierarchy"
                  />
                </label>
              </div>
            )}

            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowGlobalStyleModal(false)}>
                取消
              </button>
              <button className="btn-primary" onClick={handleApplyGlobalStyle}>
                应用风格
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
