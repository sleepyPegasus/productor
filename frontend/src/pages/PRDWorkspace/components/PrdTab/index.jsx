/**
 * PrdTab Component
 *
 * Handles PRD content display, editing, chat interface, and version history.
 */
import { useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { usePrdStore } from '../../../../stores'

export default function PrdTab({ projectId, canEdit }) {
  // Store states
  const {
    content,
    isEditing,
    editContent,
    isSaving,
    messages,
    input,
    streaming,
    status,
    versions,
    showVersions,
    loadingVersion,
    selectedSection,
    splitPosition,
    setContent,
    setIsEditing,
    setEditContent,
    setInput,
    setShowVersions,
    startEditing,
    cancelEditing,
  } = usePrdStore()

  // Refs
  const chatEndRef = useRef(null)
  const prdEndRef = useRef(null)
  const isDraggingRef = useRef(false)
  const containerRef = useRef(null)

  // Auto-scroll effects
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, status])

  useEffect(() => {
    if (streaming) {
      prdEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [content, streaming])

  // Resizable split handlers
  const handleMouseDown = (e) => {
    e.preventDefault()
    isDraggingRef.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const handleMouseMove = (moveEvent) => {
      if (!isDraggingRef.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const pos = moveEvent.clientX - rect.left
      const minLeft = 300
      const minRight = 320
      const clamped = Math.max(minLeft, Math.min(pos, rect.width - minRight))
      // setSplitPosition(clamped) - would need to add this to store
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
  }

  return (
    <div
      ref={containerRef}
      className="prd-tab"
      style={{
        display: 'flex',
        height: '100%',
        position: 'relative',
      }}
    >
      {/* PRD Content Panel */}
      <div
        className="prd-panel"
        style={{
          width: splitPosition || '50%',
          minWidth: 300,
          overflow: 'auto',
          padding: '16px',
          borderRight: '1px solid #e0e0e0',
        }}
      >
        <div className="prd-header" style={{ marginBottom: 16 }}>
          <h3>PRD 文档</h3>
          {canEdit && !isEditing && (
            <button onClick={startEditing}>编辑</button>
          )}
          {isEditing && (
            <>
              <button onClick={cancelEditing}>取消</button>
              <button disabled={isSaving}>保存</button>
            </>
          )}
        </div>

        {isEditing ? (
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            style={{ width: '100%', minHeight: 400 }}
          />
        ) : (
          <div className="prd-content">
            {content ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {content}
              </ReactMarkdown>
            ) : (
              <div className="empty-state">暂无 PRD 内容，请在右侧聊天中生成</div>
            )}
            <div ref={prdEndRef} />
          </div>
        )}
      </div>

      {/* Resizer */}
      <div
        className="resizer"
        onMouseDown={handleMouseDown}
        style={{
          width: 8,
          cursor: 'col-resize',
          background: '#f0f0f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ width: 2, height: 32, background: '#ccc' }} />
      </div>

      {/* Chat Panel */}
      <div
        className="chat-panel"
        style={{
          flex: 1,
          minWidth: 320,
          display: 'flex',
          flexDirection: 'column',
          padding: '16px',
        }}
      >
        <div className="chat-messages" style={{ flex: 1, overflow: 'auto' }}>
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`message ${msg.role}`}
              style={{
                marginBottom: 12,
                padding: 12,
                borderRadius: 8,
                background: msg.role === 'user' ? '#e3f2fd' : '#f5f5f5',
              }}
            >
              <div className="message-content">{msg.content}</div>
              <div className="message-time" style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
                {new Date(msg.timestamp).toLocaleTimeString()}
              </div>
            </div>
          ))}
          {status && (
            <div className="status-message" style={{ color: '#666', fontStyle: 'italic' }}>
              {status}
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {canEdit && (
          <div className="chat-input" style={{ marginTop: 16 }}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="输入需求描述或修改意见..."
              rows={3}
              style={{ width: '100%', resize: 'none' }}
            />
            <button disabled={!input.trim() || streaming} style={{ marginTop: 8 }}>
              {streaming ? '生成中...' : '发送'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
