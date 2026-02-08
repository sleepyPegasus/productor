import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box, Typography, Button, Card, CardContent, CardActions,
  Grid, Chip, IconButton, TextField, InputAdornment,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Tabs, Tab, ToggleButton, ToggleButtonGroup,
  Table, TableHead, TableBody, TableRow, TableCell, TableContainer,
  Pagination, Snackbar, Alert, CircularProgress, Tooltip, Paper,
} from '@mui/material'
import {
  Add, Search, ViewModule, ViewList, Edit, Archive,
  Delete, Restore, DeleteForever, Visibility, Download,
  Brush, Share, Clear,
} from '@mui/icons-material'
import {
  fetchProjects, createProject, updateProject, deleteProject,
  archiveProject, restoreProject, permanentlyDeleteProject,
  exportPRDAsDocx, fetchModels,
} from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import SearchableSelect from '../components/SearchableSelect'
import PermissionsDialog from '../components/PermissionsDialog'

const RESOLUTION_OPTIONS = [
  { label: '7680 x 4320 (8K UHD)', value: '7680x4320' },
  { label: '3840 x 2160 (4K UHD)', value: '3840x2160' },
  { label: '2560 x 1440 (2K QHD)', value: '2560x1440' },
  { label: '1920 x 1080 (Full HD)', value: '1920x1080' },
  { label: '1440 x 900 (WXGA+)', value: '1440x900' },
  { label: '1366 x 768 (HD)', value: '1366x768' },
  { label: '1280 x 720 (HD 720p)', value: '1280x720' },
  { label: '1024 x 768 (XGA)', value: '1024x768' },
  { label: '768 x 1024 (iPad)', value: '768x1024' },
  { label: '390 x 844 (iPhone 14)', value: '390x844' },
  { label: '375 x 812 (iPhone X)', value: '375x812' },
  { label: '414 x 896 (iPhone 11)', value: '414x896' },
]

const RATIO_OPTIONS = [
  { label: '16:9 (宽屏)', value: '16:9' },
  { label: '4:3 (标准)', value: '4:3' },
  { label: '3:2 (经典)', value: '3:2' },
  { label: '1:1 (正方形)', value: '1:1' },
  { label: '9:16 (手机竖屏)', value: '9:16' },
  { label: '3:4 (平板竖屏)', value: '3:4' },
]

const STATUS_MAP = {
  created: { label: '新建', color: 'default' },
  analyzing: { label: '分析中', color: 'warning' },
  prototyping: { label: '原型设计中', color: 'warning' },
  generating: { label: '生成中', color: 'warning' },
  reviewing: { label: '待评审', color: 'info' },
  revising: { label: '修改中', color: 'warning' },
  approved: { label: '已通过', color: 'success' },
  error: { label: '生成失败', color: 'error' },
}

const CATEGORY_TABS = [
  { key: 'active', label: '活跃中' },
  { key: 'archived', label: '已归档' },
  { key: 'deleted', label: '已删除' },
]

const PAGE_SIZE = 12

export default function ProjectList() {
  const { user } = useAuth()
  const [projects, setProjects] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editingProject, setEditingProject] = useState(null)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [chatModel, setChatModel] = useState('')
  const [imageModel, setImageModel] = useState('')
  const [comprehensiveModel, setComprehensiveModel] = useState('')
  const [defaultImageResolution, setDefaultImageResolution] = useState('')
  const [defaultImageRatio, setDefaultImageRatio] = useState('')
  const [chatModels, setChatModels] = useState([])
  const [imageModels, setImageModels] = useState([])
  const [multimodalModels, setMultimodalModels] = useState([])
  const [loading, setLoading] = useState(false)
  const [exportingId, setExportingId] = useState(null)
  const [toast, setToast] = useState(null)
  const navigate = useNavigate()

  const [viewMode, setViewMode] = useState('card')
  const [activeCategory, setActiveCategory] = useState('active')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const searchTimerRef = useRef(null)

  // Permissions dialog
  const [permProject, setPermProject] = useState(null)

  const load = useCallback(async (category, search) => {
    try {
      const data = await fetchProjects(category, search)
      setProjects(data)
    } catch { /* silent */ }
  }, [])

  const loadModels = async () => {
    try {
      const data = await fetchModels()
      setChatModels(data.chat_models || [])
      setImageModels(data.image_models || [])
      setMultimodalModels(data.multimodal_models || [])
      if (data.chat_models?.length > 0 && !chatModel) setChatModel(data.chat_models[0].id)
      if (data.image_models?.length > 0 && !imageModel) setImageModel(data.image_models[0].id)
      if (data.multimodal_models?.length > 0 && !comprehensiveModel) setComprehensiveModel(data.multimodal_models[0].id)
    } catch { /* silent */ }
  }

  useEffect(() => { load(activeCategory, searchQuery); loadModels() }, [])
  useEffect(() => { load(activeCategory, searchQuery); setCurrentPage(1) }, [activeCategory, searchQuery, load])

  const handleSearchInput = (value) => {
    setSearchInput(value)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => setSearchQuery(value), 300)
  }

  const openCreateModal = () => {
    setEditingProject(null); setName(''); setDesc('')
    if (chatModels.length > 0) setChatModel(chatModels[0].id)
    if (imageModels.length > 0) setImageModel(imageModels[0].id)
    if (multimodalModels.length > 0) setComprehensiveModel(multimodalModels[0].id)
    setDefaultImageResolution(''); setDefaultImageRatio('')
    setShowModal(true)
  }

  const openEditModal = (e, project) => {
    e.stopPropagation()
    setEditingProject(project); setName(project.name); setDesc(project.description || '')
    setChatModel(project.chat_model || ''); setImageModel(project.image_model || '')
    setComprehensiveModel(project.comprehensive_model || '')
    setDefaultImageResolution(project.default_image_resolution || '')
    setDefaultImageRatio(project.default_image_ratio || '')
    setShowModal(true)
  }

  const handleSubmit = async () => {
    if (!name.trim()) return
    setLoading(true)
    try {
      if (editingProject) {
        await updateProject(editingProject.id, {
          name: name.trim(), description: desc.trim(), chat_model: chatModel,
          image_model: imageModel, comprehensive_model: comprehensiveModel,
          default_image_resolution: defaultImageResolution, default_image_ratio: defaultImageRatio,
        })
        setShowModal(false); setEditingProject(null); load(activeCategory, searchQuery)
      } else {
        const project = await createProject(name.trim(), desc.trim(), chatModel, imageModel, comprehensiveModel, defaultImageResolution, defaultImageRatio)
        setShowModal(false); setName(''); setDesc(''); navigate(`/project/${project.id}`)
      }
    } catch {
      setToast({ msg: editingProject ? '更新失败' : '创建失败', severity: 'error' })
    } finally { setLoading(false) }
  }

  const handleDelete = async (e, id) => {
    e.stopPropagation()
    if (!window.confirm('确定要删除此项目吗？')) return
    try { await deleteProject(id); load(activeCategory, searchQuery) } catch { setToast({ msg: '删除失败', severity: 'error' }) }
  }

  const handleArchive = async (e, id) => {
    e.stopPropagation()
    try { await archiveProject(id); load(activeCategory, searchQuery) } catch { setToast({ msg: '归档失败', severity: 'error' }) }
  }

  const handleRestore = async (e, id) => {
    e.stopPropagation()
    try { await restoreProject(id); load(activeCategory, searchQuery) } catch { setToast({ msg: '恢复失败', severity: 'error' }) }
  }

  const handlePermanentDelete = async (e, id) => {
    e.stopPropagation()
    if (!window.confirm('确定要永久删除此项目吗？此操作不可恢复。')) return
    try { await permanentlyDeleteProject(id); load(activeCategory, searchQuery) } catch { setToast({ msg: '永久删除失败', severity: 'error' }) }
  }

  const handleDownloadPRD = async (e, projectId, projectName) => {
    e.stopPropagation()
    if (exportingId) return
    setExportingId(projectId)
    try { await exportPRDAsDocx(projectId, projectName) } catch { setToast({ msg: '导出失败', severity: 'error' }) } finally { setExportingId(null) }
  }

  const hasPrd = (p) => !!p.prd_content
  const hasDesigns = (p) => {
    if (!p.design_images) return false
    try { const arr = JSON.parse(p.design_images); return Array.isArray(arr) && arr.length > 0 } catch { return false }
  }
  const isOwner = (p) => p.owner_id === user?.id || user?.is_admin
  const formatTime = (iso) => {
    if (!iso) return '-'
    return new Date(iso).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  }
  const getModelName = (modelId, models) => {
    const m = models.find((x) => x.id === modelId)
    return m ? m.name : modelId
  }

  const totalPages = Math.max(1, Math.ceil(projects.length / PAGE_SIZE))
  const paginatedProjects = projects.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const statusChip = (status) => {
    const info = STATUS_MAP[status] || { label: status, color: 'default' }
    return <Chip label={info.label} color={info.color} size="small" />
  }

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto', p: 3 }}>
      {/* Toolbar */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Tabs value={CATEGORY_TABS.findIndex((t) => t.key === activeCategory)} onChange={(_, v) => setActiveCategory(CATEGORY_TABS[v].key)}>
            {CATEGORY_TABS.map((tab) => <Tab key={tab.key} label={tab.label} />)}
          </Tabs>
          <TextField
            size="small" placeholder="搜索项目..." value={searchInput}
            onChange={(e) => handleSearchInput(e.target.value)}
            sx={{ width: 240 }}
            InputProps={{
              startAdornment: <InputAdornment position="start"><Search /></InputAdornment>,
              endAdornment: searchInput && (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => { setSearchInput(''); setSearchQuery('') }}><Clear fontSize="small" /></IconButton>
                </InputAdornment>
              ),
            }}
          />
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <ToggleButtonGroup value={viewMode} exclusive onChange={(_, v) => v && setViewMode(v)} size="small">
            <ToggleButton value="card"><ViewModule fontSize="small" /></ToggleButton>
            <ToggleButton value="list"><ViewList fontSize="small" /></ToggleButton>
          </ToggleButtonGroup>
          <Button variant="contained" startIcon={<Add />} onClick={openCreateModal}>
            新建项目
          </Button>
        </Box>
      </Box>

      {/* Empty state */}
      {paginatedProjects.length === 0 && (
        <Paper sx={{ p: 6, textAlign: 'center' }}>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            {searchQuery ? '未找到匹配的项目' : '暂无项目'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {searchQuery ? '请尝试其他关键词' : activeCategory === 'active' ? '点击「新建项目」开始创建' : '该分类下暂无项目'}
          </Typography>
        </Paper>
      )}

      {/* Card view */}
      {viewMode === 'card' && paginatedProjects.length > 0 && (
        <Grid container spacing={2}>
          {paginatedProjects.map((p) => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={p.id}>
              <Card sx={{ cursor: 'pointer', height: '100%', display: 'flex', flexDirection: 'column' }} onClick={() => navigate(`/project/${p.id}`)}>
                <CardContent sx={{ flexGrow: 1, pb: 1 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                    <Typography variant="subtitle1" fontWeight={600} noWrap sx={{ maxWidth: '70%' }}>{p.name}</Typography>
                    {statusChip(p.status)}
                  </Box>
                  {p.description && <Typography variant="body2" color="text.secondary" sx={{ mb: 1, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.description}</Typography>}
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1 }}>
                    {p.chat_model && <Chip label={getModelName(p.chat_model, chatModels)} size="small" variant="outlined" />}
                    {p.image_model && <Chip label={getModelName(p.image_model, imageModels)} size="small" variant="outlined" color="secondary" />}
                  </Box>
                  <Typography variant="caption" color="text.secondary">v{p.version} · {formatTime(p.updated_at)}</Typography>
                </CardContent>
                <CardActions sx={{ px: 2, pb: 1.5, pt: 0 }} onClick={(e) => e.stopPropagation()}>
                  {activeCategory === 'active' && (
                    <>
                      <Tooltip title="编辑"><IconButton size="small" onClick={(e) => openEditModal(e, p)}><Edit fontSize="small" /></IconButton></Tooltip>
                      {isOwner(p) && <Tooltip title="权限管理"><IconButton size="small" onClick={(e) => { e.stopPropagation(); setPermProject(p) }}><Share fontSize="small" /></IconButton></Tooltip>}
                      <Tooltip title="归档"><IconButton size="small" onClick={(e) => handleArchive(e, p.id)}><Archive fontSize="small" /></IconButton></Tooltip>
                      <Tooltip title="删除"><IconButton size="small" color="error" onClick={(e) => handleDelete(e, p.id)}><Delete fontSize="small" /></IconButton></Tooltip>
                    </>
                  )}
                  {activeCategory === 'archived' && (
                    <Tooltip title="恢复"><IconButton size="small" onClick={(e) => handleRestore(e, p.id)}><Restore fontSize="small" /></IconButton></Tooltip>
                  )}
                  {activeCategory === 'deleted' && (
                    <>
                      <Tooltip title="恢复"><IconButton size="small" onClick={(e) => handleRestore(e, p.id)}><Restore fontSize="small" /></IconButton></Tooltip>
                      <Tooltip title="永久删除"><IconButton size="small" color="error" onClick={(e) => handlePermanentDelete(e, p.id)}><DeleteForever fontSize="small" /></IconButton></Tooltip>
                    </>
                  )}
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* List view */}
      {viewMode === 'list' && paginatedProjects.length > 0 && (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>项目名称</TableCell>
                <TableCell>状态</TableCell>
                <TableCell>模型</TableCell>
                <TableCell>版本</TableCell>
                <TableCell>更新时间</TableCell>
                <TableCell align="right">操作</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paginatedProjects.map((p) => (
                <TableRow key={p.id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/project/${p.id}`)}>
                  <TableCell>
                    <Typography fontWeight={500}>{p.name}</Typography>
                    {p.description && <Typography variant="caption" color="text.secondary">{p.description}</Typography>}
                  </TableCell>
                  <TableCell>{statusChip(p.status)}</TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                      {p.chat_model && <Chip label={getModelName(p.chat_model, chatModels)} size="small" variant="outlined" />}
                    </Box>
                  </TableCell>
                  <TableCell>v{p.version}</TableCell>
                  <TableCell>{formatTime(p.updated_at)}</TableCell>
                  <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                    {activeCategory === 'active' && (
                      <>
                        <IconButton size="small" onClick={(e) => openEditModal(e, p)}><Edit fontSize="small" /></IconButton>
                        {isOwner(p) && <IconButton size="small" onClick={(e) => { e.stopPropagation(); setPermProject(p) }}><Share fontSize="small" /></IconButton>}
                        <IconButton size="small" onClick={(e) => handleArchive(e, p.id)}><Archive fontSize="small" /></IconButton>
                        <IconButton size="small" color="error" onClick={(e) => handleDelete(e, p.id)}><Delete fontSize="small" /></IconButton>
                      </>
                    )}
                    {activeCategory === 'archived' && <IconButton size="small" onClick={(e) => handleRestore(e, p.id)}><Restore fontSize="small" /></IconButton>}
                    {activeCategory === 'deleted' && (
                      <>
                        <IconButton size="small" onClick={(e) => handleRestore(e, p.id)}><Restore fontSize="small" /></IconButton>
                        <IconButton size="small" color="error" onClick={(e) => handlePermanentDelete(e, p.id)}><DeleteForever fontSize="small" /></IconButton>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
          <Pagination count={totalPages} page={currentPage} onChange={(_, v) => setCurrentPage(v)} color="primary" />
        </Box>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={showModal} onClose={() => { setShowModal(false); setEditingProject(null) }} maxWidth="md" fullWidth>
        <DialogTitle>{editingProject ? '编辑产品项目' : '新建产品项目'}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth label="项目名称" value={name} required
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：智能任务管理平台"
            sx={{ mt: 1, mb: 2 }}
            autoFocus
          />
          <TextField
            fullWidth label="项目描述" value={desc} multiline rows={3}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="简要描述产品方向（可选）"
            sx={{ mb: 2 }}
          />
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={6}>
              <Typography variant="body2" sx={{ mb: 0.5 }}>对话模型</Typography>
              <SearchableSelect options={chatModels} value={chatModel} onChange={setChatModel} placeholder="搜索并选择对话模型..." />
            </Grid>
            <Grid item xs={6}>
              <Typography variant="body2" sx={{ mb: 0.5 }}>文生图模型</Typography>
              <SearchableSelect options={imageModels} value={imageModel} onChange={setImageModel} placeholder="搜索并选择文生图模型..." />
            </Grid>
          </Grid>
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" sx={{ mb: 0.5 }}>综合方案模型（多模态）</Typography>
            <SearchableSelect options={multimodalModels} value={comprehensiveModel} onChange={setComprehensiveModel} placeholder="搜索并选择多模态模型..." />
          </Box>
          {imageModel && (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>全局图片配置</Typography>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <TextField
                    select fullWidth size="small" label="默认图片分辨率"
                    value={defaultImageResolution}
                    onChange={(e) => setDefaultImageResolution(e.target.value)}
                    SelectProps={{ native: true }}
                  >
                    <option value="">不限</option>
                    {RESOLUTION_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </TextField>
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    select fullWidth size="small" label="默认图片比例"
                    value={defaultImageRatio}
                    onChange={(e) => setDefaultImageRatio(e.target.value)}
                    SelectProps={{ native: true }}
                  >
                    <option value="">不限</option>
                    {RATIO_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </TextField>
                </Grid>
              </Grid>
            </Paper>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setShowModal(false); setEditingProject(null) }}>取消</Button>
          <Button variant="contained" onClick={handleSubmit} disabled={loading || !name.trim()}>
            {loading ? <CircularProgress size={20} /> : (editingProject ? '保存修改' : '创建并进入')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Permissions Dialog */}
      <PermissionsDialog
        open={!!permProject}
        onClose={() => setPermProject(null)}
        projectId={permProject?.id}
        projectName={permProject?.name}
        ownerId={permProject?.owner_id}
      />

      {/* Toast */}
      <Snackbar open={!!toast} autoHideDuration={3000} onClose={() => setToast(null)} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
        {toast && <Alert severity={toast.severity} onClose={() => setToast(null)}>{toast.msg}</Alert>}
      </Snackbar>
    </Box>
  )
}
