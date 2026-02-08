import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box, Typography, Button, Card, CardContent,
  Table, TableHead, TableBody, TableRow, TableCell, TableContainer,
  Chip, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Alert, Snackbar, Paper, Tooltip, CircularProgress,
} from '@mui/material'
import {
  ArrowBack, PersonAdd, Delete, LockReset, AdminPanelSettings,
  Block, CheckCircle, Lock, Save,
} from '@mui/icons-material'
import { useAuth } from '../contexts/AuthContext'
import { fetchUsers, updateUser, deleteUser, resetUserPassword, apiChangePassword } from '../services/api'

export default function UserManagement() {
  const { user: currentUser } = useAuth()
  const navigate = useNavigate()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)

  // Change password dialog
  const [pwdOpen, setPwdOpen] = useState(false)
  const [oldPwd, setOldPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [pwdLoading, setPwdLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchUsers()
      setUsers(data)
    } catch (err) {
      setToast({ msg: err.message, severity: 'error' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const showToast = (msg, severity = 'success') => setToast({ msg, severity })

  const handleToggleActive = async (u) => {
    try {
      await updateUser(u.id, { is_active: !u.is_active })
      showToast(u.is_active ? '已禁用用户' : '已启用用户')
      load()
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  const handleToggleAdmin = async (u) => {
    try {
      await updateUser(u.id, { is_admin: !u.is_admin })
      showToast(u.is_admin ? '已取消管理员' : '已设为管理员')
      load()
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  const handleDelete = async (u) => {
    if (!window.confirm(`确定要删除用户 "${u.username}" 吗？此操作不可恢复。`)) return
    try {
      await deleteUser(u.id)
      showToast('用户已删除')
      load()
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  const handleResetPassword = async (u) => {
    if (!window.confirm(`确定要将用户 "${u.username}" 的密码重置为 123456 吗？`)) return
    try {
      await resetUserPassword(u.id)
      showToast('密码已重置为 123456')
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  const handleChangePassword = async () => {
    if (!oldPwd || !newPwd) return
    setPwdLoading(true)
    try {
      await apiChangePassword(oldPwd, newPwd)
      showToast('密码修改成功')
      setPwdOpen(false)
      setOldPwd('')
      setNewPwd('')
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setPwdLoading(false)
    }
  }

  const formatTime = (iso) => {
    if (!iso) return '-'
    return new Date(iso).toLocaleString('zh-CN')
  }

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={600}>用户管理</Typography>
          <Typography variant="body2" color="text.secondary">管理系统用户、修改密码</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button startIcon={<Lock />} variant="outlined" onClick={() => setPwdOpen(true)}>
            修改密码
          </Button>
          <Button startIcon={<ArrowBack />} variant="outlined" onClick={() => navigate('/')}>
            返回项目
          </Button>
        </Box>
      </Box>

      {/* User table */}
      <Card>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>用户名</TableCell>
                <TableCell>邮箱</TableCell>
                <TableCell>角色</TableCell>
                <TableCell>状态</TableCell>
                <TableCell>注册时间</TableCell>
                <TableCell align="right">操作</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                    <CircularProgress size={32} />
                  </TableCell>
                </TableRow>
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">暂无用户</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                users.map((u) => (
                  <TableRow key={u.id} hover>
                    <TableCell>
                      <Typography fontWeight={500}>{u.username}</Typography>
                    </TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>
                      {u.is_admin ? (
                        <Chip label="管理员" color="primary" size="small" />
                      ) : (
                        <Chip label="普通用户" variant="outlined" size="small" />
                      )}
                    </TableCell>
                    <TableCell>
                      {u.is_active ? (
                        <Chip label="正常" color="success" size="small" variant="outlined" />
                      ) : (
                        <Chip label="已禁用" color="error" size="small" variant="outlined" />
                      )}
                    </TableCell>
                    <TableCell>{formatTime(u.created_at)}</TableCell>
                    <TableCell align="right">
                      {u.id !== currentUser?.id && (
                        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                          <Tooltip title={u.is_admin ? '取消管理员' : '设为管理员'}>
                            <IconButton size="small" onClick={() => handleToggleAdmin(u)}>
                              <AdminPanelSettings color={u.is_admin ? 'primary' : 'action'} fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title={u.is_active ? '禁用用户' : '启用用户'}>
                            <IconButton size="small" onClick={() => handleToggleActive(u)}>
                              {u.is_active ? <Block fontSize="small" /> : <CheckCircle color="success" fontSize="small" />}
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="重置密码">
                            <IconButton size="small" onClick={() => handleResetPassword(u)}>
                              <LockReset fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          {!u.is_admin && (
                            <Tooltip title="删除用户">
                              <IconButton size="small" color="error" onClick={() => handleDelete(u)}>
                                <Delete fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Box>
                      )}
                      {u.id === currentUser?.id && (
                        <Chip label="当前用户" size="small" variant="outlined" />
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      {/* Change password dialog */}
      <Dialog open={pwdOpen} onClose={() => setPwdOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>修改密码</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth label="当前密码" type="password" value={oldPwd}
            onChange={(e) => setOldPwd(e.target.value)} sx={{ mt: 1, mb: 2 }}
          />
          <TextField
            fullWidth label="新密码" type="password" value={newPwd}
            onChange={(e) => setNewPwd(e.target.value)}
            helperText="至少 4 个字符"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPwdOpen(false)}>取消</Button>
          <Button variant="contained" onClick={handleChangePassword} disabled={pwdLoading}>
            {pwdLoading ? <CircularProgress size={20} /> : '保存'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Toast */}
      <Snackbar
        open={!!toast} autoHideDuration={3000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        {toast && <Alert severity={toast.severity} onClose={() => setToast(null)}>{toast.msg}</Alert>}
      </Snackbar>
    </Box>
  )
}
