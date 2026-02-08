import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  AppBar, Toolbar, Typography, Button, Box, IconButton,
  Menu, MenuItem, Divider, Avatar, ListItemIcon, ListItemText,
} from '@mui/material'
import {
  Person, Logout, Settings, People, Lock,
} from '@mui/icons-material'
import { useAuth } from '../contexts/AuthContext'
import { apiChangePassword } from '../services/api'

export default function AppLayout({ children }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [anchorEl, setAnchorEl] = useState(null)

  const handleMenu = (e) => setAnchorEl(e.currentTarget)
  const handleClose = () => setAnchorEl(null)

  const handleLogout = () => {
    handleClose()
    logout()
  }

  const isWorkspace = location.pathname.startsWith('/project/')

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {!isWorkspace && (
        <AppBar position="static" color="default" elevation={1} sx={{ bgcolor: 'background.paper' }}>
          <Toolbar>
            <Typography
              variant="h6" fontWeight={700} color="primary"
              sx={{ cursor: 'pointer', mr: 2 }}
              onClick={() => navigate('/')}
            >
              Productor
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mr: 3 }}>
              AI 驱动的 PRD 生成工具
            </Typography>

            <Box sx={{ flexGrow: 1 }} />

            <Button
              color={location.pathname === '/skills' ? 'primary' : 'inherit'}
              onClick={() => navigate('/skills')}
              startIcon={<Settings />}
              sx={{ mr: 1 }}
            >
              技能管理
            </Button>

            {user?.is_admin && (
              <Button
                color={location.pathname === '/users' ? 'primary' : 'inherit'}
                onClick={() => navigate('/users')}
                startIcon={<People />}
                sx={{ mr: 1 }}
              >
                用户管理
              </Button>
            )}

            <IconButton onClick={handleMenu} size="small" sx={{ ml: 1 }}>
              <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main', fontSize: 14 }}>
                {user?.username?.[0]?.toUpperCase() || 'U'}
              </Avatar>
            </IconButton>

            <Menu
              anchorEl={anchorEl} open={!!anchorEl} onClose={handleClose}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            >
              <MenuItem disabled>
                <ListItemIcon><Person fontSize="small" /></ListItemIcon>
                <ListItemText primary={user?.username} secondary={user?.email} />
              </MenuItem>
              <Divider />
              <MenuItem onClick={() => { handleClose(); navigate('/users') }}>
                <ListItemIcon><Lock fontSize="small" /></ListItemIcon>
                <ListItemText>修改密码</ListItemText>
              </MenuItem>
              <MenuItem onClick={handleLogout}>
                <ListItemIcon><Logout fontSize="small" /></ListItemIcon>
                <ListItemText>退出登录</ListItemText>
              </MenuItem>
            </Menu>
          </Toolbar>
        </AppBar>
      )}
      <Box sx={{ flexGrow: 1 }}>
        {children}
      </Box>
    </Box>
  )
}
