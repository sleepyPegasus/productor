import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box, Typography, Button, Card, CardContent,
  Grid, Chip, IconButton, Tabs, Tab, Switch,
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Select, MenuItem, FormControl, InputLabel,
  Snackbar, Alert, CircularProgress, Tooltip, Paper,
} from '@mui/material'
import { ArrowBack, Add, Edit, ContentCopy, RestartAlt, Delete } from '@mui/icons-material'
import {
  fetchSkills, createSkill, updateSkill, deleteSkill,
  resetSkill, duplicateSkill,
} from '../services/api'

const CATEGORIES = [
  { value: '', label: '全部' },
  { value: 'analysis', label: '需求分析' },
  { value: 'design', label: '设计' },
  { value: 'document', label: '文档' },
  { value: 'general', label: '通用' },
]

const OUTPUT_FORMATS = ['text', 'json', 'markdown']
const MODEL_TYPES = ['chat', 'image', 'multimodal']

function parseJSON(value, fallback) {
  if (!value) return fallback
  if (typeof value === 'object') return value
  try { return JSON.parse(value) } catch { return fallback }
}

export default function SkillManagement() {
  const navigate = useNavigate()
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
      setToast({ msg: err.message, severity: 'error' })
    } finally {
      setLoading(false)
    }
  }, [filterCategory])

  useEffect(() => { loadSkills() }, [loadSkills])

  const showToastMsg = (msg, severity = 'success') => setToast({ msg, severity })

  const handleToggleEnabled = async (skill) => {
    try {
      await updateSkill(skill.id, { is_enabled: !skill.is_enabled })
      showToastMsg(skill.is_enabled ? '已禁用' : '已启用')
      loadSkills()
    } catch (err) { showToastMsg(err.message, 'error') }
  }

  const handleDelete = async (skill) => {
    if (!window.confirm(`确定要删除技能「${skill.display_name}」吗？此操作不可恢复。`)) return
    try {
      await deleteSkill(skill.id)
      showToastMsg('删除成功')
      loadSkills()
    } catch (err) { showToastMsg(err.message, 'error') }
  }

  const handleReset = async (skill) => {
    if (!window.confirm(`确定要将「${skill.display_name}」重置为出厂默认设置吗？`)) return
    try {
      await resetSkill(skill.id)
      showToastMsg('已重置为默认')
      loadSkills()
    } catch (err) { showToastMsg(err.message, 'error') }
  }

  const handleDuplicate = async (skill) => {
    try {
      await duplicateSkill(skill.id)
      showToastMsg('复制成功')
      loadSkills()
    } catch (err) { showToastMsg(err.message, 'error') }
  }

  const getCategoryLabel = (cat) => {
    const found = CATEGORIES.find((c) => c.value === cat)
    return found ? found.label : cat
  }

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto', p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={600}>技能管理</Typography>
          <Typography variant="body2" color="text.secondary">管理和编辑 AI 技能的提示词、参数和配置</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button startIcon={<ArrowBack />} variant="outlined" onClick={() => navigate('/')}>返回项目</Button>
          <Button startIcon={<Add />} variant="contained" onClick={() => setShowCreateModal(true)}>新建技能</Button>
        </Box>
      </Box>

      {/* Category filter */}
      <Tabs
        value={CATEGORIES.findIndex((c) => c.value === filterCategory)}
        onChange={(_, v) => setFilterCategory(CATEGORIES[v].value)}
        sx={{ mb: 3 }}
      >
        {CATEGORIES.map((cat) => <Tab key={cat.value} label={cat.label} />)}
      </Tabs>

      {/* Grid */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : skills.length === 0 ? (
        <Paper sx={{ p: 6, textAlign: 'center' }}>
          <Typography variant="h6" color="text.secondary">暂无技能</Typography>
        </Paper>
      ) : (
        <Grid container spacing={2}>
          {skills.map((skill) => (
            <Grid item xs={12} sm={6} md={4} key={skill.id}>
              <Card sx={{ opacity: skill.is_enabled ? 1 : 0.6 }}>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                    <Typography variant="subtitle1" fontWeight={600}>{skill.display_name}</Typography>
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                      <Chip label={skill.is_builtin ? '内置' : '自定义'} size="small" color={skill.is_builtin ? 'primary' : 'default'} variant="outlined" />
                      <Chip label={getCategoryLabel(skill.category)} size="small" />
                      {!skill.is_enabled && <Chip label="已禁用" size="small" color="error" variant="outlined" />}
                    </Box>
                  </Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, minHeight: 40, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {skill.description || '暂无描述'}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
                    <Typography variant="caption" color="text.secondary">标识: {skill.name}</Typography>
                    <Typography variant="caption" color="text.secondary">输出: {skill.output_format}</Typography>
                    <Typography variant="caption" color="text.secondary">v{skill.version}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                    <Tooltip title="编辑"><IconButton size="small" onClick={() => setEditingSkill(skill)}><Edit fontSize="small" /></IconButton></Tooltip>
                    <Tooltip title="复制"><IconButton size="small" onClick={() => handleDuplicate(skill)}><ContentCopy fontSize="small" /></IconButton></Tooltip>
                    {skill.is_builtin && <Tooltip title="重置"><IconButton size="small" onClick={() => handleReset(skill)}><RestartAlt fontSize="small" /></IconButton></Tooltip>}
                    <Switch size="small" checked={skill.is_enabled} onChange={() => handleToggleEnabled(skill)} />
                    {!skill.is_builtin && <Tooltip title="删除"><IconButton size="small" color="error" onClick={() => handleDelete(skill)}><Delete fontSize="small" /></IconButton></Tooltip>}
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Edit Modal */}
      {editingSkill && (
        <SkillEditDialog
          skill={editingSkill}
          onClose={() => setEditingSkill(null)}
          onSaved={() => { setEditingSkill(null); showToastMsg('保存成功'); loadSkills() }}
          onError={(msg) => showToastMsg(msg, 'error')}
        />
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <SkillCreateDialog
          onClose={() => setShowCreateModal(false)}
          onCreated={() => { setShowCreateModal(false); showToastMsg('创建成功'); loadSkills() }}
          onError={(msg) => showToastMsg(msg, 'error')}
        />
      )}

      <Snackbar open={!!toast} autoHideDuration={3000} onClose={() => setToast(null)} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
        {toast && <Alert severity={toast.severity} onClose={() => setToast(null)}>{toast.msg}</Alert>}
      </Snackbar>
    </Box>
  )
}


function SkillEditDialog({ skill, onClose, onSaved, onError }) {
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

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))

  const handleSave = async () => {
    setSaving(true)
    try {
      const updates = {
        display_name: form.display_name, description: form.description,
        category: form.category, system_prompt: form.system_prompt,
        user_prompt_template: form.user_prompt_template,
        output_format: form.output_format, model_type: form.model_type,
        parameters: form.parameters, input_variables: form.input_variables,
      }
      if (typeof form.extra_data === 'string') {
        try { updates.extra_data = JSON.parse(form.extra_data) } catch { updates.extra_data = {} }
      } else {
        updates.extra_data = form.extra_data
      }
      await updateSkill(skill.id, updates)
      onSaved()
    } catch (err) { onError(err.message) } finally { setSaving(false) }
  }

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>编辑技能: {skill.display_name}</DialogTitle>
      <DialogContent>
        <Grid container spacing={2} sx={{ mt: 0.5 }}>
          <Grid item xs={6}>
            <TextField fullWidth label="显示名称" value={form.display_name} onChange={(e) => set('display_name', e.target.value)} />
          </Grid>
          <Grid item xs={6}>
            <FormControl fullWidth>
              <InputLabel>分类</InputLabel>
              <Select value={form.category} label="分类" onChange={(e) => set('category', e.target.value)}>
                {CATEGORIES.filter((c) => c.value).map((c) => <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
        </Grid>
        <TextField fullWidth label="描述" multiline rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} sx={{ mt: 2 }} />

        <Typography variant="subtitle2" sx={{ mt: 3, mb: 1 }}>提示词配置</Typography>
        <TextField fullWidth label="System Prompt" multiline rows={3} value={form.system_prompt} onChange={(e) => set('system_prompt', e.target.value)} sx={{ mb: 2 }} helperText="定义 AI 的角色和行为规则" />
        <TextField fullWidth label="User Prompt Template" multiline rows={8} value={form.user_prompt_template} onChange={(e) => set('user_prompt_template', e.target.value)} helperText="使用 {变量名} 作为占位符" />

        <Typography variant="subtitle2" sx={{ mt: 3, mb: 1 }}>模型参数</Typography>
        <Grid container spacing={2}>
          <Grid item xs={4}>
            <FormControl fullWidth size="small">
              <InputLabel>输出格式</InputLabel>
              <Select value={form.output_format} label="输出格式" onChange={(e) => set('output_format', e.target.value)}>
                {OUTPUT_FORMATS.map((f) => <MenuItem key={f} value={f}>{f}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={4}>
            <FormControl fullWidth size="small">
              <InputLabel>模型类型</InputLabel>
              <Select value={form.model_type} label="模型类型" onChange={(e) => set('model_type', e.target.value)}>
                {MODEL_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={4}>
            <TextField fullWidth size="small" label="Temperature" type="number" inputProps={{ step: 0.1, min: 0, max: 2 }}
              value={form.parameters.temperature ?? 0.5}
              onChange={(e) => set('parameters', { ...form.parameters, temperature: parseFloat(e.target.value) || 0 })}
            />
          </Grid>
        </Grid>
        <Grid container spacing={2} sx={{ mt: 1 }}>
          <Grid item xs={6}>
            <TextField fullWidth size="small" label="Max Tokens" type="number" inputProps={{ step: 1024, min: 256, max: 131072 }}
              value={form.parameters.max_tokens ?? 8192}
              onChange={(e) => set('parameters', { ...form.parameters, max_tokens: parseInt(e.target.value) || 8192 })}
            />
          </Grid>
          <Grid item xs={6}>
            <TextField fullWidth size="small" label="输入变量" value={(form.input_variables || []).join(', ')}
              onChange={(e) => set('input_variables', e.target.value.split(',').map((v) => v.trim()).filter(Boolean))}
              helperText="逗号分隔"
            />
          </Grid>
        </Grid>

        <Typography variant="subtitle2" sx={{ mt: 3, mb: 1 }}>附加数据 (Extra Data)</Typography>
        <TextField fullWidth multiline rows={4} label="JSON 格式"
          value={typeof form.extra_data === 'string' ? form.extra_data : JSON.stringify(form.extra_data, null, 2)}
          onChange={(e) => set('extra_data', e.target.value)}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>取消</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}>
          {saving ? <CircularProgress size={20} /> : '保存'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

function SkillCreateDialog({ onClose, onCreated, onError }) {
  const [form, setForm] = useState({
    name: '', display_name: '', description: '', category: 'general',
    system_prompt: '', user_prompt_template: '', output_format: 'text', model_type: 'chat',
  })
  const [saving, setSaving] = useState(false)

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))

  const handleCreate = async () => {
    if (!form.name || !form.display_name) { onError('请填写技能标识和显示名称'); return }
    setSaving(true)
    try {
      await createSkill({
        name: form.name, display_name: form.display_name, description: form.description,
        category: form.category, system_prompt: form.system_prompt,
        user_prompt_template: form.user_prompt_template,
        output_format: form.output_format, model_type: form.model_type,
        parameters: { temperature: 0.5, max_tokens: 8192 }, input_variables: [],
      })
      onCreated()
    } catch (err) { onError(err.message) } finally { setSaving(false) }
  }

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>新建技能</DialogTitle>
      <DialogContent>
        <Grid container spacing={2} sx={{ mt: 0.5 }}>
          <Grid item xs={6}>
            <TextField fullWidth label="技能标识" required value={form.name}
              onChange={(e) => set('name', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
              placeholder="如: my_custom_skill" helperText="小写字母、数字和下划线"
            />
          </Grid>
          <Grid item xs={6}>
            <TextField fullWidth label="显示名称" required value={form.display_name}
              onChange={(e) => set('display_name', e.target.value)} placeholder="如: 自定义分析"
            />
          </Grid>
        </Grid>
        <TextField fullWidth label="描述" multiline rows={2} value={form.description}
          onChange={(e) => set('description', e.target.value)} sx={{ mt: 2 }}
        />
        <Grid container spacing={2} sx={{ mt: 1 }}>
          <Grid item xs={4}>
            <FormControl fullWidth size="small">
              <InputLabel>分类</InputLabel>
              <Select value={form.category} label="分类" onChange={(e) => set('category', e.target.value)}>
                {CATEGORIES.filter((c) => c.value).map((c) => <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={4}>
            <FormControl fullWidth size="small">
              <InputLabel>输出格式</InputLabel>
              <Select value={form.output_format} label="输出格式" onChange={(e) => set('output_format', e.target.value)}>
                {OUTPUT_FORMATS.map((f) => <MenuItem key={f} value={f}>{f}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={4}>
            <FormControl fullWidth size="small">
              <InputLabel>模型类型</InputLabel>
              <Select value={form.model_type} label="模型类型" onChange={(e) => set('model_type', e.target.value)}>
                {MODEL_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
        </Grid>

        <Typography variant="subtitle2" sx={{ mt: 3, mb: 1 }}>提示词配置</Typography>
        <TextField fullWidth label="System Prompt" multiline rows={3} value={form.system_prompt} onChange={(e) => set('system_prompt', e.target.value)} sx={{ mb: 2 }} />
        <TextField fullWidth label="User Prompt Template" multiline rows={5} value={form.user_prompt_template} onChange={(e) => set('user_prompt_template', e.target.value)} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>取消</Button>
        <Button variant="contained" onClick={handleCreate} disabled={saving}>
          {saving ? <CircularProgress size={20} /> : '创建'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
