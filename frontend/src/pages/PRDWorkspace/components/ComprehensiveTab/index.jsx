/**
 * ComprehensiveTab Component
 *
 * Handles comprehensive document generation and export.
 */
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useComprehensiveStore } from '../../../../stores'

export default function ComprehensiveTab({ projectId, canEdit }) {
  const {
    content,
    generating,
    status,
    isEditing,
    editContent,
    isSaving,
    exporting,
    exportFormat,
    versions,
    showVersions,
    setIsEditing,
    setEditContent,
    setExportFormat,
    setShowVersions,
    startEditing,
    cancelEditing,
  } = useComprehensiveStore()

  return (
    <div className="comprehensive-tab" style={{ padding: 16, height: '100%', overflow: 'auto' }}>
      <div className="comprehensive-header" style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>综合文档</h3>
        <div>
          {canEdit && !isEditing && (
            <>
              <button onClick={startEditing} style={{ marginRight: 8 }}>编辑</button>
              <button disabled={generating} style={{ marginRight: 8 }}>
                {generating ? '生成中...' : '重新生成'}
              </button>
            </>
          )}
          {isEditing && (
            <>
              <button onClick={cancelEditing} style={{ marginRight: 8 }}>取消</button>
              <button disabled={isSaving} style={{ marginRight: 8 }}>
                {isSaving ? '保存中...' : '保存'}
              </button>
            </>
          )}
          <select
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value)}
            style={{ marginRight: 8 }}
          >
            <option value="docx">Word (.docx)</option>
            <option value="pdf">PDF (.pdf)</option>
          </select>
          <button disabled={exporting || !content}>
            {exporting ? '导出中...' : '导出'}
          </button>
          <button onClick={() => setShowVersions(!showVersions)} style={{ marginLeft: 8 }}>
            {showVersions ? '隐藏版本' : '版本历史'}
          </button>
        </div>
      </div>

      {status && (
        <div className="comprehensive-status" style={{ marginBottom: 16, color: '#666', fontStyle: 'italic' }}>
          {status}
        </div>
      )}

      <div className="comprehensive-content" style={{ display: 'flex', gap: 16 }}>
        {/* Main Content */}
        <div style={{ flex: 1 }}>
          {isEditing ? (
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              style={{ width: '100%', minHeight: 600, fontFamily: 'monospace' }}
            />
          ) : content ? (
            <div className="markdown-content" style={{ background: '#fafafa', padding: 24, borderRadius: 8 }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {content}
              </ReactMarkdown>
            </div>
          ) : (
            <div className="empty-state" style={{ textAlign: 'center', padding: 64, color: '#999' }}>
              暂无综合文档内容
              {canEdit && <div style={{ marginTop: 16 }}>点击"重新生成"按钮创建</div>}
            </div>
          )}
        </div>

        {/* Version Sidebar */}
        {showVersions && (
          <div className="version-sidebar" style={{ width: 240, borderLeft: '1px solid #e0e0e0', paddingLeft: 16 }}>
            <h4>版本历史</h4>
            {versions.length === 0 ? (
              <div className="empty-state">暂无历史版本</div>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {versions.map((v) => (
                  <li
                    key={v.version}
                    style={{
                      padding: 8,
                      marginBottom: 4,
                      borderRadius: 4,
                      cursor: 'pointer',
                      background: '#f5f5f5',
                    }}
                  >
                    <div>版本 {v.version}</div>
                    <div style={{ fontSize: 12, color: '#999' }}>
                      {new Date(v.created_at).toLocaleString()}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
