import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  fetchSkills,
  createSkill,
  updateSkill,
  deleteSkill,
  resetSkill,
  duplicateSkill,
} from '../services/api'
import './SkillManagement.css'

const CATEGORIES = [
  { value: '', label: '全部' },
  { value: 'analysis', label: '需求分析' },
  { value: 'design', label: '设计' },
  { value: 'document', label: '文档' },
  { value: 'general', label: '通用' },
]

const OUTPUT_FORMATS = ['text', 'json', 'markdown']
const MODEL_TYPES = ['chat', 'image', 'multimodal']

function SkillManagement() {
  const [skills, setSkills] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterCategory, setFilterCategory] = useState('')
  const [editingSkill, setEditingSkill] = useState(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [toast, setToast] = useState(null)

  const loadSkills = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchSkills(filterCategory || null)
      setSkills(data)
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [filterCategory])

  useEffect(() => {
    loadSkills()
  }, [loadSkills])

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  async function handleToggleEnabled(skill) {
    try {
      await updateSkill(skill.id, { is_enabled: !skill.is_enabled })
      showToast(skill.is_enabled ? '已禁用' : '已启用')
      loadSkills()
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  async function handleDelete(skill) {
    if (!confirm(`确定要删除技能「${skill.display_name}」吗？此操作不可恢复。`)) return
    try {
      await deleteSkill(skill.id)
      showToast('删除成功')
      loadSkills()
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  async function handleReset(skill) {
    if (!confirm(`确定要将「${skill.display_name}」重置为出厂默认设置吗？所有自定义修改将丢失。`)) return
    try {
      await resetSkill(skill.id)
      showToast('已重置为默认')
      loadSkills()
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  async function handleDuplicate(skill) {
    try {
      await duplicateSkill(skill.id)
      showToast('复制成功')
      loadSkills()
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  function getCategoryLabel(cat) {
    const found = CATEGORIES.find((c) => c.value === cat)
    return found ? found.label : cat
  }

  return (
    <div className="skill-management-page">
      {/* Header */}
      <div className="skill-page-header">
        <div className="skill-header-left">
          <h1>技能管理</h1>
          <span className="subtitle">
            管理和编辑 AI 技能的提示词、参数和配置
          </span>
        </div>
        <div className="skill-header-actions">
          <Link to="/" className="back-link">
            ← 返回项目
          </Link>
          <button
            className="btn-primary"
            onClick={() => setShowCreateModal(true)}
          >
            + 新建技能
          </button>
        </div>
      </div>

      {/* Filter */}
      <div className="skill-filter-toolbar">
        <div className="skill-category-tabs">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              className={`skill-category-tab ${filterCategory === cat.value ? 'skill-category-tab-active' : ''}`}
              onClick={() => setFilterCategory(cat.value)}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="skill-empty-state">
          <p>加载中...</p>
        </div>
      ) : skills.length === 0 ? (
        <div className="skill-empty-state">
          <div className="skill-empty-icon">&#9881;</div>
          <p>暂无技能</p>
        </div>
      ) : (
        <div className="skill-grid">
          {skills.map((skill) => (
            <div
              key={skill.id}
              className={`skill-card ${!skill.is_enabled ? 'skill-card-disabled' : ''}`}
            >
              <div className="skill-card-header">
                <h3>{skill.display_name}</h3>
                <div className="skill-badges">
                  {skill.is_builtin ? (
                    <span className="skill-badge skill-badge-builtin">内置</span>
                  ) : (
                    <span className="skill-badge skill-badge-custom">自定义</span>
                  )}
                  <span className="skill-badge skill-badge-category">
                    {getCategoryLabel(skill.category)}
                  </span>
                  {!skill.is_enabled && (
                    <span className="skill-badge skill-badge-disabled">已禁用</span>
                  )}
                </div>
              </div>

              <p className="skill-card-desc">{skill.description || '暂无描述'}</p>

              <div className="skill-card-meta">
                <span className="skill-meta-item">
                  <span className="skill-meta-label">标识:</span> {skill.name}
                </span>
                <span className="skill-meta-item">
                  <span className="skill-meta-label">输出:</span> {skill.output_format}
                </span>
                <span className="skill-meta-item">
                  <span className="skill-meta-label">版本:</span> v{skill.version}
                </span>
              </div>

              <div className="skill-card-actions">
                <button
                  className="skill-action-btn"
                  onClick={() => setEditingSkill(skill)}
                >
                  编辑
                </button>
                <button
                  className="skill-action-btn"
                  onClick={() => handleDuplicate(skill)}
                >
                  复制
                </button>
                {skill.is_builtin && (
                  <button
                    className="skill-action-btn"
                    onClick={() => handleReset(skill)}
                  >
                    重置
                  </button>
                )}
                <label className="toggle-switch" title={skill.is_enabled ? '禁用' : '启用'}>
                  <input
                    type="checkbox"
                    checked={skill.is_enabled}
                    onChange={() => handleToggleEnabled(skill)}
                  />
                  <span className="toggle-slider"></span>
                </label>
                {!skill.is_builtin && (
                  <button
                    className="skill-action-btn btn-danger-text"
                    onClick={() => handleDelete(skill)}
                  >
                    删除
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit modal */}
      {editingSkill && (
        <SkillEditModal
          skill={editingSkill}
          onClose={() => setEditingSkill(null)}
          onSaved={() => {
            setEditingSkill(null)
            showToast('保存成功')
            loadSkills()
          }}
          onError={(msg) => showToast(msg, 'error')}
        />
      )}

      {/* Create modal */}
      {showCreateModal && (
        <SkillCreateModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false)
            showToast('创建成功')
            loadSkills()
          }}
          onError={(msg) => showToast(msg, 'error')}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className={`skill-toast skill-toast-${toast.type}`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Edit Modal
// ---------------------------------------------------------------------------

function SkillEditModal({ skill, onClose, onSaved, onError }) {
  const [form, setForm] = useState(() => ({
    display_name: skill.display_name || '',
    description: skill.description || '',
    category: skill.category || 'general',
    system_prompt: skill.system_prompt || '',
    user_prompt_template: skill.user_prompt_template || '',
    output_format: skill.output_format || 'text',
    model_type: skill.model_type || 'chat',
    parameters: parseJSON(skill.parameters, {}),
    input_variables: parseJSON(skill.input_variables, []),
    extra_data: skill.extra_data || '{}',
  }))
  const [saving, setSaving] = useState(false)

  function set(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const updates = {
        display_name: form.display_name,
        description: form.description,
        category: form.category,
        system_prompt: form.system_prompt,
        user_prompt_template: form.user_prompt_template,
        output_format: form.output_format,
        model_type: form.model_type,
        parameters: form.parameters,
        input_variables: form.input_variables,
      }
      // Parse extra_data if it's a string
      if (typeof form.extra_data === 'string') {
        try {
          updates.extra_data = JSON.parse(form.extra_data)
        } catch {
          updates.extra_data = {}
        }
      } else {
        updates.extra_data = form.extra_data
      }
      await updateSkill(skill.id, updates)
      onSaved()
    } catch (err) {
      onError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal skill-edit-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <h2>编辑技能: {skill.display_name}</h2>

        {/* Basic info */}
        <div className="skill-form-row">
          <div className="skill-form-group">
            <label>显示名称</label>
            <input
              value={form.display_name}
              onChange={(e) => set('display_name', e.target.value)}
            />
          </div>
          <div className="skill-form-group">
            <label>分类</label>
            <select
              value={form.category}
              onChange={(e) => set('category', e.target.value)}
            >
              {CATEGORIES.filter((c) => c.value).map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="skill-form-group">
          <label>描述</label>
          <textarea
            rows={2}
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            style={{ fontFamily: 'inherit', minHeight: '60px' }}
          />
        </div>

        {/* Prompt section */}
        <div className="skill-form-section">
          <h3>提示词配置</h3>

          <div className="skill-form-group">
            <label>System Prompt (系统提示词)</label>
            <textarea
              rows={4}
              value={form.system_prompt}
              onChange={(e) => set('system_prompt', e.target.value)}
            />
            <div className="form-hint">定义 AI 的角色和行为规则</div>
          </div>

          <div className="skill-form-group">
            <label>User Prompt Template (用户提示词模板)</label>
            <textarea
              rows={12}
              value={form.user_prompt_template}
              onChange={(e) => set('user_prompt_template', e.target.value)}
            />
            <div className="form-hint">
              使用 {'{'}<var>变量名</var>{'}'} 作为占位符，如: {'{requirement}'}, {'{structured_requirement}'}
            </div>
          </div>
        </div>

        {/* Model parameters */}
        <div className="skill-form-section">
          <h3>模型参数</h3>
          <div className="skill-form-row-3">
            <div className="skill-form-group">
              <label>输出格式</label>
              <select
                value={form.output_format}
                onChange={(e) => set('output_format', e.target.value)}
              >
                {OUTPUT_FORMATS.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>
            <div className="skill-form-group">
              <label>模型类型</label>
              <select
                value={form.model_type}
                onChange={(e) => set('model_type', e.target.value)}
              >
                {MODEL_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="skill-form-group">
              <label>Temperature</label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="2"
                value={form.parameters.temperature ?? 0.5}
                onChange={(e) =>
                  set('parameters', {
                    ...form.parameters,
                    temperature: parseFloat(e.target.value) || 0,
                  })
                }
              />
            </div>
          </div>

          <div className="skill-form-row">
            <div className="skill-form-group">
              <label>Max Tokens</label>
              <input
                type="number"
                step="1024"
                min="256"
                max="131072"
                value={form.parameters.max_tokens ?? 8192}
                onChange={(e) =>
                  set('parameters', {
                    ...form.parameters,
                    max_tokens: parseInt(e.target.value) || 8192,
                  })
                }
              />
            </div>
            <div className="skill-form-group">
              <label>输入变量</label>
              <input
                value={(form.input_variables || []).join(', ')}
                onChange={(e) =>
                  set(
                    'input_variables',
                    e.target.value.split(',').map((v) => v.trim()).filter(Boolean)
                  )
                }
              />
              <div className="form-hint">逗号分隔，如: requirement, structured_requirement</div>
            </div>
          </div>
        </div>

        {/* Extra data (for PRD template etc.) */}
        <div className="skill-form-section">
          <h3>附加数据 (Extra Data)</h3>
          <div className="skill-form-group">
            <label>JSON 格式的附加配置</label>
            <textarea
              rows={6}
              value={
                typeof form.extra_data === 'string'
                  ? form.extra_data
                  : JSON.stringify(form.extra_data, null, 2)
              }
              onChange={(e) => set('extra_data', e.target.value)}
            />
            <div className="form-hint">
              如 PRD 模板等附加数据，JSON 格式。例: {`{"prd_template": "..."}`}
            </div>
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>
            取消
          </button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Create Modal
// ---------------------------------------------------------------------------

function SkillCreateModal({ onClose, onCreated, onError }) {
  const [form, setForm] = useState({
    name: '',
    display_name: '',
    description: '',
    category: 'general',
    system_prompt: '',
    user_prompt_template: '',
    output_format: 'text',
    model_type: 'chat',
  })
  const [saving, setSaving] = useState(false)

  function set(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleCreate() {
    if (!form.name || !form.display_name) {
      onError('请填写技能标识和显示名称')
      return
    }
    setSaving(true)
    try {
      await createSkill({
        name: form.name,
        display_name: form.display_name,
        description: form.description,
        category: form.category,
        system_prompt: form.system_prompt,
        user_prompt_template: form.user_prompt_template,
        output_format: form.output_format,
        model_type: form.model_type,
        parameters: { temperature: 0.5, max_tokens: 8192 },
        input_variables: [],
      })
      onCreated()
    } catch (err) {
      onError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal skill-edit-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <h2>新建技能</h2>

        <div className="skill-form-row">
          <div className="skill-form-group">
            <label>
              技能标识 <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <input
              value={form.name}
              onChange={(e) => set('name', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
              placeholder="如: my_custom_skill"
            />
            <div className="form-hint">小写字母、数字和下划线，创建后不可修改</div>
          </div>
          <div className="skill-form-group">
            <label>
              显示名称 <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <input
              value={form.display_name}
              onChange={(e) => set('display_name', e.target.value)}
              placeholder="如: 自定义分析"
            />
          </div>
        </div>

        <div className="skill-form-group">
          <label>描述</label>
          <textarea
            rows={2}
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            style={{ fontFamily: 'inherit', minHeight: '60px' }}
            placeholder="描述这个技能的功能和用途"
          />
        </div>

        <div className="skill-form-row-3">
          <div className="skill-form-group">
            <label>分类</label>
            <select
              value={form.category}
              onChange={(e) => set('category', e.target.value)}
            >
              {CATEGORIES.filter((c) => c.value).map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="skill-form-group">
            <label>输出格式</label>
            <select
              value={form.output_format}
              onChange={(e) => set('output_format', e.target.value)}
            >
              {OUTPUT_FORMATS.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>
          <div className="skill-form-group">
            <label>模型类型</label>
            <select
              value={form.model_type}
              onChange={(e) => set('model_type', e.target.value)}
            >
              {MODEL_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="skill-form-section">
          <h3>提示词配置</h3>
          <div className="skill-form-group">
            <label>System Prompt</label>
            <textarea
              rows={3}
              value={form.system_prompt}
              onChange={(e) => set('system_prompt', e.target.value)}
              placeholder="定义 AI 的角色和行为规则"
            />
          </div>
          <div className="skill-form-group">
            <label>User Prompt Template</label>
            <textarea
              rows={6}
              value={form.user_prompt_template}
              onChange={(e) => set('user_prompt_template', e.target.value)}
              placeholder="使用 {变量名} 作为占位符"
            />
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>
            取消
          </button>
          <button className="btn-primary" onClick={handleCreate} disabled={saving}>
            {saving ? '创建中...' : '创建'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseJSON(value, fallback) {
  if (!value) return fallback
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

export default SkillManagement
