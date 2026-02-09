/**
 * DesignTab Component
 *
 * Handles UI prototype image generation, page management, and design history.
 */
import { useDesignStore } from '../../../../stores'

export default function DesignTab({ projectId, canEdit }) {
  const {
    images,
    generating,
    status,
    pagesList,
    selectedPageId,
    generatingPageId,
    currentSlideIndex,
    showGlobalStyleModal,
    globalStyle,
    setSelectedPageId,
    setShowGlobalStyleModal,
    setGlobalStyle,
  } = useDesignStore()

  return (
    <div className="design-tab" style={{ padding: 16, height: '100%', overflow: 'auto' }}>
      <div className="design-header" style={{ marginBottom: 16 }}>
        <h3>界面设计图</h3>
        {canEdit && (
          <>
            <button disabled={generating} style={{ marginRight: 8 }}>
              {generating ? '生成中...' : '生成所有页面'}
            </button>
            <button onClick={() => setShowGlobalStyleModal(true)}>
              全局样式设置
            </button>
          </>
        )}
      </div>

      {status && (
        <div className="design-status" style={{ marginBottom: 16, color: '#666' }}>
          {status}
        </div>
      )}

      <div className="design-content" style={{ display: 'flex', gap: 16 }}>
        {/* Page List */}
        <div className="page-list" style={{ width: 280, borderRight: '1px solid #e0e0e0', paddingRight: 16 }}>
          <h4>页面列表</h4>
          {pagesList.length === 0 ? (
            <div className="empty-state">请先生成 PRD 以创建页面结构</div>
          ) : (
            pagesList.map((page) => (
              <div
                key={page.id}
                className={`page-item ${selectedPageId === page.id ? 'selected' : ''}`}
                onClick={() => setSelectedPageId(page.id)}
                style={{
                  padding: 12,
                  marginBottom: 8,
                  borderRadius: 4,
                  cursor: 'pointer',
                  background: selectedPageId === page.id ? '#e3f2fd' : '#f5f5f5',
                }}
              >
                <div className="page-name">{page.name}</div>
                <div className="page-desc" style={{ fontSize: 12, color: '#666' }}>
                  {page.description}
                </div>
                {canEdit && (
                  <button
                    disabled={generatingPageId === page.id}
                    style={{ marginTop: 8, fontSize: 12 }}
                  >
                    {generatingPageId === page.id ? '生成中...' : '生成设计图'}
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        {/* Image Gallery */}
        <div className="image-gallery" style={{ flex: 1 }}>
          {images.length === 0 ? (
            <div className="empty-state">暂无设计图</div>
          ) : (
            <div className="image-slider">
              {images[currentSlideIndex] && (
                <div className="image-item">
                  <img
                    src={images[currentSlideIndex].url}
                    alt={images[currentSlideIndex].page_name}
                    style={{ maxWidth: '100%', borderRadius: 8 }}
                  />
                  <div className="image-info" style={{ marginTop: 8 }}>
                    <strong>{images[currentSlideIndex].page_name}</strong>
                  </div>
                </div>
              )}
              {images.length > 1 && (
                <div className="slider-controls" style={{ marginTop: 16 }}>
                  <button
                    disabled={currentSlideIndex === 0}
                    style={{ marginRight: 8 }}
                  >
                    上一张
                  </button>
                  <span>{currentSlideIndex + 1} / {images.length}</span>
                  <button
                    disabled={currentSlideIndex === images.length - 1}
                    style={{ marginLeft: 8 }}
                  >
                    下一张
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Global Style Modal */}
      {showGlobalStyleModal && (
        <div className="modal-overlay" style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <div className="modal" style={{ background: 'white', padding: 24, borderRadius: 8, width: 480 }}>
            <h4>全局样式设置</h4>
            <div style={{ marginBottom: 12 }}>
              <label>设计风格</label>
              <input
                value={globalStyle.designStyle}
                onChange={(e) => setGlobalStyle({ ...globalStyle, designStyle: e.target.value })}
                placeholder="如：现代简约、 Material Design"
                style={{ width: '100%', marginTop: 4 }}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label>配色方案</label>
              <input
                value={globalStyle.colorScheme}
                onChange={(e) => setGlobalStyle({ ...globalStyle, colorScheme: e.target.value })}
                placeholder="如：蓝白主色调"
                style={{ width: '100%', marginTop: 4 }}
              />
            </div>
            <div style={{ textAlign: 'right', marginTop: 16 }}>
              <button onClick={() => setShowGlobalStyleModal(false)}>关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
