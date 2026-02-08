import { useState, useEffect } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Table, TableHead, TableBody, TableRow, TableCell,
  TableContainer, Select, MenuItem, IconButton, Typography,
  Box, Chip, TextField, Alert, CircularProgress, Autocomplete,
} from '@mui/material'
import { Delete, PersonAdd } from '@mui/icons-material'
import {
  fetchProjectPermissions, setProjectPermission,
  removeProjectPermission, fetchUsers,
} from '../services/api'

export default function PermissionsDialog({ open, onClose, projectId, projectName, ownerId }) {
  const [permissions, setPermissions] = useState([])
  const [allUsers, setAllUsers] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedUser, setSelectedUser] = useState(null)
  const [selectedPerm, setSelectedPerm] = useState('view')

  const load = async () => {
    if (!projectId) return
    setLoading(true)
    try {
      const [perms, users] = await Promise.all([
        fetchProjectPermissions(projectId),
        fetchUsers().catch(() => []),
      ])
      setPermissions(perms)
      setAllUsers(users)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) load()
  }, [open, projectId])

  const handleAdd = async () => {
    if (!selectedUser) return
    setError('')
    try {
      await setProjectPermission(projectId, selectedUser.id, selectedPerm)
      setSelectedUser(null)
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleChange = async (userId, permission) => {
    try {
      await setProjectPermission(projectId, userId, permission)
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleRemove = async (userId) => {
    try {
      await removeProjectPermission(projectId, userId)
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  // Users who don't already have permissions (and are not the owner)
  const existingUserIds = new Set(permissions.map((p) => p.user_id))
  existingUserIds.add(ownerId)
  const availableUsers = allUsers.filter((u) => !existingUserIds.has(u.id))

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>项目权限管理 - {projectName}</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {/* Add user form */}
        <Box sx={{ display: 'flex', gap: 1, mb: 2, mt: 1 }}>
          <Autocomplete
            size="small"
            options={availableUsers}
            getOptionLabel={(u) => `${u.username} (${u.email})`}
            value={selectedUser}
            onChange={(_, v) => setSelectedUser(v)}
            sx={{ flexGrow: 1 }}
            renderInput={(params) => <TextField {...params} label="选择用户" />}
            noOptionsText="无可用用户"
          />
          <Select size="small" value={selectedPerm} onChange={(e) => setSelectedPerm(e.target.value)} sx={{ minWidth: 100 }}>
            <MenuItem value="view">查看</MenuItem>
            <MenuItem value="edit">编辑</MenuItem>
          </Select>
          <Button variant="contained" size="small" startIcon={<PersonAdd />} onClick={handleAdd} disabled={!selectedUser}>
            添加
          </Button>
        </Box>

        {/* Permissions list */}
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress size={28} />
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>用户</TableCell>
                  <TableCell>邮箱</TableCell>
                  <TableCell>权限</TableCell>
                  <TableCell align="right">操作</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {permissions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} align="center">
                      <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                        尚未授权其他用户
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  permissions.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{p.username}</TableCell>
                      <TableCell>{p.email}</TableCell>
                      <TableCell>
                        <Select
                          size="small" value={p.permission}
                          onChange={(e) => handleChange(p.user_id, e.target.value)}
                          sx={{ minWidth: 80 }}
                        >
                          <MenuItem value="view">查看</MenuItem>
                          <MenuItem value="edit">编辑</MenuItem>
                        </Select>
                      </TableCell>
                      <TableCell align="right">
                        <IconButton size="small" color="error" onClick={() => handleRemove(p.user_id)}>
                          <Delete fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        <Box sx={{ mt: 2 }}>
          <Typography variant="caption" color="text.secondary">
            权限说明: <strong>查看</strong> - 仅可查看项目内容; <strong>编辑</strong> - 可查看和编辑项目内容。项目创建者拥有完全控制权。
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>关闭</Button>
      </DialogActions>
    </Dialog>
  )
}
