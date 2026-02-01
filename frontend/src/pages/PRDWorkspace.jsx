import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { exportPRDAsDocx, generatePRD, generateDesigns, getChatHistory, getProject, revisePRD } from '../services/api'
import './PRDWorkspace.css'

export default function PRDWorkspace() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  // Tab state: 'prd' or 'design'
  const initialTab = searchParams.get('tab') === 'design' ? 'design' : 'prd'
  const [activeTab, setActiveTab] = useState(initialTab)

  // PRD tab state
  const [project, setProject] = useState(null)
  const [prdContent, setPrdContent] = useState('')
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [status, setStatus] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)

  // Design tab state
  const [designImages, setDesignImages] = useState([])
  const [designStatus, setDesignStatus] = useState('')
  const [designGenerating, setDesignGenerating] = useState(false)
  const [designError, setDesignError] = useState('')
  const [selectedImage, setSelectedImage] = useState(null)

  const abortRef = useRef(null)
  const designAbortRef = useRef(null)
  const chatEndRef = useRef(null)
  const prdEndRef = useRef(null)
  const textareaRef = useRef(null)

  const handleTabChange = (tab) => {
    setActiveTab(tab)
    setSearchParams(tab === 'design' ? { tab: 'design' } : {})
  }

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
        // Load saved design images
        if (proj.design_images) {
          try {
            const images = JSON.parse(proj.design_images)
            if (Array.isArray(images)) setDesignImages(images)
          } catch {
            // ignore parse error
          }
        }
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

    const abort = streamFn(id, text, {
      onToken(token) {
        tokenBuf += token
        setPrdContent(tokenBuf)
      },
      onStatus(msg) {
        setStatus(msg)
      },
      onRequirement(data) {
        setStatus('需求分析完成')
      },
      onPagesPlan(data) {
        setStatus('页面结构规划完成')
      },
      onPrdComplete(full) {
        setPrdContent(full)
        tokenBuf = full
      },
      onDone() {
        setStreaming(false)
        setStatus('')
        if (tokenBuf) {
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: 'PRD 文档已' + (isRevision ? '更新' : '生成') + '，请在左侧查看。',
              timestamp: new Date().toISOString(),
            },
          ])
        }
        getProject(id).then((p) => setProject(p)).catch(() => {})
      },
      onError(msg) {
        setStreaming(false)
        setStatus('')
        setError(msg || '生成失败，请重试')
      },
    })
    abortRef.current = abort
  }, [id, input, streaming, prdContent])

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

  // Design generation handler
  const handleGenerateDesigns = useCallback(() => {
    if (designGenerating) return
    setDesignError('')
    setDesignGenerating(true)
    setDesignStatus('正在准备生成界面设计图...')
    setDesignImages([])

    const abort = generateDesigns(id, {
      onImage(imageData) {
        setDesignImages((prev) => [...prev, imageData])
      },
      onStatus(msg) {
        setDesignStatus(msg)
      },
      onDone() {
        setDesignGenerating(false)
        setDesignStatus('')
        // Reload project to get persisted data
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

  const handleStopDesign = () => {
    designAbortRef.current?.()
    setDesignGenerating(false)
    setDesignStatus('')
  }

  if (error && !project) {
    return (
      <div className="workspace-error">
        <p>{error}</p>
        <button className="btn-secondary" onClick={() => navigate('/')}>
          返回项目列表
        </button>
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
            <span className="header-meta">
              v{project.version} &middot; {project.status}
            </span>
          )}
        </div>

        {/* Tab navigation */}
        <nav className="workspace-tabs">
          <button
            className={`tab-btn ${activeTab === 'prd' ? 'tab-active' : ''}`}
            onClick={() => handleTabChange('prd')}
          >
            <span className="tab-step">1</span>
            PRD 文档
          </button>
          <button
            className={`tab-btn ${activeTab === 'design' ? 'tab-active' : ''}`}
            onClick={() => handleTabChange('design')}
          >
            <span className="tab-step">2</span>
            产品界面设计
          </button>
        </nav>

        {activeTab === 'prd' && streaming && (
          <div className="header-status">
            <span className="status-dot" />
            {status || '生成中...'}
          </div>
        )}
        {activeTab === 'design' && designGenerating && (
          <div className="header-status">
            <span className="status-dot" />
            {designStatus || '生成中...'}
          </div>
        )}
      </header>

      {/* Tab content */}
      {activeTab === 'prd' && (
        <div className="workspace-body">
          {/* Left: PRD Display */}
          <section className="prd-panel">
            <div className="panel-header">
              <h3>PRD 文档</h3>
              {prdContent && (
                <div className="panel-actions">
                  <button
                    className="btn-small"
                    onClick={() => {
                      navigator.clipboard.writeText(prdContent)
                      setStatus('已复制到剪贴板')
                      setTimeout(() => setStatus(''), 2000)
                    }}
                  >
                    复制
                  </button>
                  <button
                    className="btn-small btn-export"
                    onClick={handleExportDocx}
                    disabled={exporting || streaming}
                  >
                    {exporting ? '导出中...' : '导出 Word'}
                  </button>
                </div>
              )}
            </div>
            <div className="prd-content">
              {prdContent ? (
                <div className="markdown-body">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      img: ({ node, alt, src, ...props }) => (
                        <figure className="prd-image-figure">
                          <img
                            src={src}
                            alt={alt || ''}
                            className="prd-image"
                            loading="lazy"
                            {...props}
                          />
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

          {/* Right: Chat Panel */}
          <section className="chat-panel">
            <div className="panel-header">
              <h3>需求对话</h3>
            </div>

            <div className="chat-messages">
              {messages.length === 0 && !streaming && (
                <div className="chat-welcome">
                  <p className="welcome-title">开始创建 PRD</p>
                  <p className="welcome-hint">
                    描述你的产品需求，例如：
                  </p>
                  <div className="welcome-examples">
                    <button
                      className="example-btn"
                      onClick={() =>
                        setInput(
                          '我想做一个团队任务管理工具，支持看板视图、任务分配、截止日期提醒和团队协作'
                        )
                      }
                    >
                      团队任务管理工具
                    </button>
                    <button
                      className="example-btn"
                      onClick={() =>
                        setInput(
                          '开发一个在线教育平台，包含课程管理、视频播放、作业提交和学习进度追踪'
                        )
                      }
                    >
                      在线教育平台
                    </button>
                    <button
                      className="example-btn"
                      onClick={() =>
                        setInput(
                          '构建一个电商小程序，需要商品展示、购物车、订单管理和微信支付功能'
                        )
                      }
                    >
                      电商小程序
                    </button>
                  </div>
                </div>
              )}

              {messages.map((msg, i) => (
                <div key={i} className={`chat-msg chat-msg-${msg.role}`}>
                  <div className="msg-avatar">
                    {msg.role === 'user' ? '👤' : '🤖'}
                  </div>
                  <div className="msg-bubble">
                    <div className="msg-content">{msg.content}</div>
                    {msg.timestamp && (
                      <div className="msg-time">
                        {new Date(msg.timestamp).toLocaleTimeString('zh-CN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {streaming && status && (
                <div className="chat-msg chat-msg-assistant">
                  <div className="msg-avatar">🤖</div>
                  <div className="msg-bubble">
                    <div className="msg-content msg-status">
                      <span className="status-dot" />
                      {status}
                    </div>
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Input area */}
            <div className="chat-input-area">
              {error && <div className="chat-error">{error}</div>}
              <div className="chat-input-row">
                <textarea
                  ref={textareaRef}
                  className="chat-input"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    prdContent
                      ? '输入修改意见，如：增加数据分析功能...'
                      : '描述你的产品需求...'
                  }
                  rows={3}
                  disabled={streaming}
                />
                <div className="input-actions">
                  {streaming ? (
                    <button className="btn-stop" onClick={handleStop}>
                      停止
                    </button>
                  ) : (
                    <button
                      className="btn-send"
                      onClick={handleSend}
                      disabled={!input.trim()}
                    >
                      发送
                    </button>
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

      {activeTab === 'design' && (
        <div className="design-tab-body">
          {/* Design panel header */}
          <div className="design-header">
            <div className="design-header-left">
              <h3>产品界面设计</h3>
              <span className="design-hint">
                基于 PRD 文档自动生成产品功能界面设计图
              </span>
            </div>
            <div className="design-header-actions">
              {designGenerating ? (
                <button className="btn-stop" onClick={handleStopDesign}>
                  停止生成
                </button>
              ) : (
                <button
                  className="btn-primary"
                  onClick={handleGenerateDesigns}
                  disabled={!prdContent}
                  title={!prdContent ? '请先在步骤1中生成 PRD 文档' : ''}
                >
                  {designImages.length > 0 ? '重新生成设计图' : '生成界面设计图'}
                </button>
              )}
            </div>
          </div>

          {/* Design content */}
          <div className="design-content">
            {designError && (
              <div className="design-error">{designError}</div>
            )}

            {designGenerating && designStatus && (
              <div className="design-progress">
                <span className="status-dot" />
                <span>{designStatus}</span>
              </div>
            )}

            {!prdContent && !designGenerating && designImages.length === 0 && (
              <div className="design-empty">
                <div className="design-empty-icon">🎨</div>
                <p>请先在「PRD 文档」步骤中生成 PRD 文档</p>
                <p className="design-empty-hint">
                  生成 PRD 后，即可在此处生成产品界面设计图
                </p>
                <button
                  className="btn-secondary"
                  onClick={() => handleTabChange('prd')}
                >
                  前往生成 PRD
                </button>
              </div>
            )}

            {prdContent && !designGenerating && designImages.length === 0 && (
              <div className="design-empty">
                <div className="design-empty-icon">🖼️</div>
                <p>PRD 文档已就绪</p>
                <p className="design-empty-hint">
                  点击上方「生成界面设计图」按钮，AI 将根据 PRD 文档自动生成各页面的界面设计
                </p>
              </div>
            )}

            {designImages.length > 0 && (
              <div className="design-gallery">
                {designImages.map((img, idx) => (
                  <div
                    key={img.page_id || idx}
                    className="design-card"
                    onClick={() => setSelectedImage(img)}
                  >
                    <div className="design-card-image">
                      <img
                        src={img.image_url}
                        alt={img.page_name || `页面 ${idx + 1}`}
                        loading="lazy"
                      />
                    </div>
                    <div className="design-card-info">
                      <h4>{img.page_name || `页面 ${idx + 1}`}</h4>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Image preview modal */}
          {selectedImage && (
            <div className="image-modal-overlay" onClick={() => setSelectedImage(null)}>
              <div className="image-modal" onClick={(e) => e.stopPropagation()}>
                <div className="image-modal-header">
                  <h3>{selectedImage.page_name}</h3>
                  <button
                    className="image-modal-close"
                    onClick={() => setSelectedImage(null)}
                  >
                    &times;
                  </button>
                </div>
                <div className="image-modal-body">
                  <img
                    src={selectedImage.image_url}
                    alt={selectedImage.page_name}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
