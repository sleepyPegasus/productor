import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchProjects, createProject, deleteProject } from '../services/api'
import './ProjectList.css'

const STATUS_LABELS = {
  created: '新建',
  analyzing: '分析中',
  prototyping: '原型设计中',
  generating: '生成中',
  reviewing: '待评审',
  revising: '修改中',
  approved: '已通过',
}

const STATUS_COLORS = {
  created: '#94a3b8',
  analyzing: '#f59e0b',
  prototyping: '#f59e0b',
  generating: '#f59e0b',
  reviewing: '#3b82f6',
  revising: '#f59e0b',
  approved: '#22c55e',
}

export default function ProjectList() {
  const [projects, setProjects] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const load = async () => {
    try {
      const data = await fetchProjects()
      setProjects(data)
    } catch {
      // silent
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleCreate = async () => {
    if (!name.trim()) return
    setLoading(true)
    try {
      const project = await createProject(name.trim(), desc.trim())
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

  return (
    <div className="project-list-page">
      <header className="page-header">
        <div className="header-left">
          <h1>Productor</h1>
          <span className="subtitle">AI 驱动的 PRD 生成工具</span>
        </div>
        <button className="btn-primary" onClick={() => setShowModal(true)}>
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
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>新建产品项目</h2>
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
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowModal(false)}>
                取消
              </button>
              <button
                className="btn-primary"
                onClick={handleCreate}
                disabled={loading || !name.trim()}
              >
                {loading ? '创建中...' : '创建并进入'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
