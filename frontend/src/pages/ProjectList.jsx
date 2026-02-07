import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchProjects, createProject, updateProject, deleteProject, exportPRDAsDocx, fetchModels } from '../services/api'
import SearchableSelect from '../components/SearchableSelect'
import './ProjectList.css'

const STATUS_LABELS = {
  created: '新建',
  analyzing: '分析中',
  prototyping: '原型设计中',
  generating: '生成中',
  reviewing: '待评审',
  revising: '修改中',
  approved: '已通过',
  error: '生成失败',
}

const STATUS_COLORS = {
  created: '#94a3b8',
  analyzing: '#f59e0b',
  prototyping: '#f59e0b',
  generating: '#f59e0b',
  reviewing: '#3b82f6',
  revising: '#f59e0b',
  approved: '#22c55e',
  error: '#ef4444',
}

export default function ProjectList() {
  const [projects, setProjects] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editingProject, setEditingProject] = useState(null)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [chatModel, setChatModel] = useState('')
  const [imageModel, setImageModel] = useState('')
  const [chatModels, setChatModels] = useState([])
  const [imageModels, setImageModels] = useState([])
  const [loading, setLoading] = useState(false)
  const [exportingId, setExportingId] = useState(null)
  const navigate = useNavigate()

  const load = async () => {
    try {
      const data = await fetchProjects()
      setProjects(data)
    } catch {
      // silent
    }
  }

  const loadModels = async () => {
    try {
      const data = await fetchModels()
      setChatModels(data.chat_models || [])
      setImageModels(data.image_models || [])
      if (data.chat_models?.length > 0 && !chatModel) {
        setChatModel(data.chat_models[0].id)
      }
      if (data.image_models?.length > 0 && !imageModel) {
        setImageModel(data.image_models[0].id)
      }
    } catch {
      // silent
    }
  }

  useEffect(() => {
    load()
    loadModels()
  }, [])

  const openCreateModal = () => {
    setEditingProject(null)
    setName('')
    setDesc('')
    // Reset to default models
    if (chatModels.length > 0) setChatModel(chatModels[0].id)
    if (imageModels.length > 0) setImageModel(imageModels[0].id)
    setShowModal(true)
  }

  const openEditModal = (e, project) => {
    e.stopPropagation()
    setEditingProject(project)
    setName(project.name)
    setDesc(project.description || '')
    setChatModel(project.chat_model || '')
    setImageModel(project.image_model || '')
    setShowModal(true)
  }

  const handleCreate = async () => {
    if (!name.trim()) return
    setLoading(true)
    try {
      const project = await createProject(name.trim(), desc.trim(), chatModel, imageModel)
      setShowModal(false)
      setName('')
      setDesc('')
      navigate(`/project/${project.id}`)
    } catch {
      alert('创建失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  const handleUpdate = async () => {
    if (!name.trim() || !editingProject) return
    setLoading(true)
    try {
      await updateProject(editingProject.id, {
        name: name.trim(),
        description: desc.trim(),
        chat_model: chatModel,
        image_model: imageModel,
      })
      setShowModal(false)
      setEditingProject(null)
      load()
    } catch {
      alert('更新失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = () => {
    if (editingProject) {
      handleUpdate()
    } else {
      handleCreate()
    }
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setEditingProject(null)
  }

  const handleDelete = async (e, id) => {
    e.stopPropagation()
    if (!window.confirm('确定要删除此项目吗？')) return
    try {
      await deleteProject(id)
      load()
    } catch {
      alert('删除失败')
    }
  }

  const handleViewPRD = (e, projectId) => {
    e.stopPropagation()
    navigate(`/project/${projectId}`)
  }

  const handleDownloadPRD = async (e, projectId, projectName) => {
    e.stopPropagation()
    if (exportingId) return
    setExportingId(projectId)
    try {
      await exportPRDAsDocx(projectId, projectName)
    } catch {
      alert('导出失败，请重试')
    } finally {
      setExportingId(null)
    }
  }

  const handleViewDesign = (e, projectId) => {
    e.stopPropagation()
    navigate(`/project/${projectId}?tab=design`)
  }

  const hasPrd = (p) => !!p.prd_content

  const hasDesigns = (p) => {
    if (!p.design_images) return false
    try {
      const arr = JSON.parse(p.design_images)
      return Array.isArray(arr) && arr.length > 0
    } catch {
      return false
    }
  }

  const formatTime = (iso) => {
    if (!iso) return '-'
    const d = new Date(iso)
    return d.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getModelName = (modelId, models) => {
    const m = models.find((x) => x.id === modelId)
    return m ? m.name : modelId
  }

  return (
    <div className="project-list-page">
      <header className="page-header">
        <div className="header-left">
          <h1>Productor</h1>
          <span className="subtitle">AI 驱动的 PRD 生成工具</span>
        </div>
        <button className="btn-primary" onClick={openCreateModal}>
          + 新建项目
        </button>
      </header>

      <main className="project-grid">
        {projects.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">📋</div>
            <p>暂无项目</p>
            <p className="empty-hint">点击「新建项目」开始创建你的第一个 PRD</p>
          </div>
        )}
        {projects.map((p) => (
          <div
            key={p.id}
            className="project-card"
            onClick={() => navigate(`/project/${p.id}`)}
          >
            <div className="card-header">
              <h3>{p.name}</h3>
              <span
                className="status-badge"
                style={{ background: STATUS_COLORS[p.status] || '#94a3b8' }}
              >
                {STATUS_LABELS[p.status] || p.status}
              </span>
            </div>
            {p.description && <p className="card-desc">{p.description}</p>}

            {/* Model info */}
            {(p.chat_model || p.image_model) && (
              <div className="card-models">
                {p.chat_model && (
                  <span className="model-tag" title="对话模型">
                    {getModelName(p.chat_model, chatModels) || p.chat_model}
                  </span>
                )}
                {p.image_model && (
                  <span className="model-tag model-tag-image" title="文生图模型">
                    {getModelName(p.image_model, imageModels) || p.image_model}
                  </span>
                )}
              </div>
            )}

            {/* Action buttons */}
            <div className="card-actions">
              <button
                className="card-action-btn"
                onClick={(e) => openEditModal(e, p)}
                title="编辑项目信息"
              >
                <span className="action-icon">✏️</span>
                编辑
              </button>
              <button
                className={`card-action-btn ${hasPrd(p) ? '' : 'btn-disabled'}`}
                onClick={(e) => hasPrd(p) && handleViewPRD(e, p.id)}
                disabled={!hasPrd(p)}
                title={hasPrd(p) ? '查看 PRD 文档' : '尚未生成 PRD'}
              >
                <span className="action-icon">📄</span>
                查看 PRD
              </button>
              <button
                className={`card-action-btn ${hasPrd(p) ? '' : 'btn-disabled'}`}
                onClick={(e) => hasPrd(p) && handleDownloadPRD(e, p.id, p.name)}
                disabled={!hasPrd(p) || exportingId === p.id}
                title={hasPrd(p) ? '下载 Word 文档' : '尚未生成 PRD'}
              >
                <span className="action-icon">⬇️</span>
                {exportingId === p.id ? '下载中...' : '下载 PRD'}
              </button>
              <button
                className={`card-action-btn ${hasPrd(p) ? '' : 'btn-disabled'}`}
                onClick={(e) => hasPrd(p) && handleViewDesign(e, p.id)}
                disabled={!hasPrd(p)}
                title={hasPrd(p) ? (hasDesigns(p) ? '查看界面设计' : '前往生成界面设计') : '请先生成 PRD'}
              >
                <span className="action-icon">🎨</span>
                {hasDesigns(p) ? '查看设计' : '界面设计'}
              </button>
            </div>

            <div className="card-footer">
              <span className="card-meta">
                v{p.version} &middot; {formatTime(p.updated_at)}
              </span>
              <button
                className="btn-icon btn-danger"
                onClick={(e) => handleDelete(e, p.id)}
                title="删除项目"
              >
                🗑
              </button>
            </div>
          </div>
        ))}
      </main>

      {showModal && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal modal-extra-wide" onClick={(e) => e.stopPropagation()}>
            <h2>{editingProject ? '编辑产品项目' : '新建产品项目'}</h2>
            <label>
              项目名称 <span className="required">*</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：智能任务管理平台"
                autoFocus
              />
            </label>
            <label>
              项目描述
              <textarea
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="简要描述产品方向（可选）"
                rows={3}
              />
            </label>
            <div className="model-select-row">
              <div className="model-select-label">
                对话模型
                <SearchableSelect
                  options={chatModels}
                  value={chatModel}
                  onChange={setChatModel}
                  placeholder="搜索并选择对话模型..."
                />
              </div>
              <div className="model-select-label">
                文生图模型
                <SearchableSelect
                  options={imageModels}
                  value={imageModel}
                  onChange={setImageModel}
                  placeholder="搜索并选择文生图模型..."
                />
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={handleCloseModal}>
                取消
              </button>
              <button
                className="btn-primary"
                onClick={handleSubmit}
                disabled={loading || !name.trim()}
              >
                {loading
                  ? (editingProject ? '保存中...' : '创建中...')
                  : (editingProject ? '保存修改' : '创建并进入')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
