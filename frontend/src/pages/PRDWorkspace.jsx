import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { generatePRD, getChatHistory, getProject, revisePRD } from '../services/api'
import './PRDWorkspace.css'

export default function PRDWorkspace() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [project, setProject] = useState(null)
  const [prdContent, setPrdContent] = useState('')
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [status, setStatus] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState('')

  const abortRef = useRef(null)
  const chatEndRef = useRef(null)
  const prdEndRef = useRef(null)
  const textareaRef = useRef(null)

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

    // Add user message to local state
    const userMsg = { role: 'user', content: text, timestamp: new Date().toISOString() }
    setMessages((prev) => [...prev, userMsg])

    // Determine if generating or revising
    const isRevision = !!prdContent
    const streamFn = isRevision ? revisePRD : generatePRD

    // Clear PRD for fresh content streaming
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
        // Add assistant message
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
        // Reload project data
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
        {streaming && (
          <div className="header-status">
            <span className="status-dot" />
            {status || '生成中...'}
          </div>
        )}
      </header>

      {/* Split view */}
      <div className="workspace-body">
        {/* Left: PRD Display */}
        <section className="prd-panel">
          <div className="panel-header">
            <h3>PRD 文档</h3>
            {prdContent && (
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
            )}
          </div>
          <div className="prd-content">
            {prdContent ? (
              <div className="markdown-body">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
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
    </div>
  )
}
