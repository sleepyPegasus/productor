import { useState } from 'react'
import {
  Box, Card, CardContent, TextField, Button, Typography, Alert,
  Tabs, Tab, CircularProgress, InputAdornment, IconButton,
} from '@mui/material'
import { Visibility, VisibilityOff, Email, Person, Lock, VpnKey } from '@mui/icons-material'
import { useAuth } from '../contexts/AuthContext'
import { apiLogin, apiRegister, apiSendCode } from '../services/api'

export default function Login() {
  const { login } = useAuth()
  const [tab, setTab] = useState(0) // 0 = login, 1 = register
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  // Login form
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  // Register form
  const [regUsername, setRegUsername] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regCode, setRegCode] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [codeLoading, setCodeLoading] = useState(false)
  const [countdown, setCountdown] = useState(0)

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    if (!username.trim() || !password) {
      setError('请输入用户名和密码')
      return
    }
    setLoading(true)
    try {
      const data = await apiLogin(username.trim(), password)
      login(data.access_token, data.user)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSendCode = async () => {
    setError('')
    if (!regEmail.trim()) {
      setError('请输入邮箱地址')
      return
    }
    setCodeLoading(true)
    try {
      const data = await apiSendCode(regEmail.trim(), 'register')
      setCodeSent(true)
      setSuccess('验证码已发送到您的邮箱' + (data.dev_code ? ` (开发模式验证码: ${data.dev_code})` : ''))
      // Start countdown
      setCountdown(60)
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer)
            return 0
          }
          return prev - 1
        })
      }, 1000)
    } catch (err) {
      setError(err.message)
    } finally {
      setCodeLoading(false)
    }
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    if (!regUsername.trim() || !regEmail.trim() || !regPassword || !regCode.trim()) {
      setError('请填写所有必填字段')
      return
    }
    setLoading(true)
    try {
      const data = await apiRegister(regUsername.trim(), regEmail.trim(), regPassword, regCode.trim())
      login(data.access_token, data.user)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box sx={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      p: 2,
    }}>
      <Card sx={{ maxWidth: 460, width: '100%', borderRadius: 3 }}>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h4" fontWeight={700} textAlign="center" sx={{ mb: 1 }}>
            Productor
          </Typography>
          <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ mb: 3 }}>
            AI 驱动的 PRD 生成工具
          </Typography>

          <Tabs value={tab} onChange={(_, v) => { setTab(v); setError(''); setSuccess('') }} centered sx={{ mb: 3 }}>
            <Tab label="登录" />
            <Tab label="注册" />
          </Tabs>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

          {tab === 0 && (
            <Box component="form" onSubmit={handleLogin}>
              <TextField
                fullWidth label="用户名" value={username}
                onChange={(e) => setUsername(e.target.value)}
                sx={{ mb: 2 }}
                InputProps={{
                  startAdornment: <InputAdornment position="start"><Person /></InputAdornment>,
                }}
              />
              <TextField
                fullWidth label="密码" type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                sx={{ mb: 3 }}
                InputProps={{
                  startAdornment: <InputAdornment position="start"><Lock /></InputAdornment>,
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton onClick={() => setShowPassword(!showPassword)} edge="end" size="small">
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
              <Button
                type="submit" fullWidth variant="contained" size="large"
                disabled={loading}
                sx={{ py: 1.5 }}
              >
                {loading ? <CircularProgress size={24} /> : '登录'}
              </Button>
              <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ mt: 2 }}>
                默认管理员: admin / admin
              </Typography>
            </Box>
          )}

          {tab === 1 && (
            <Box component="form" onSubmit={handleRegister}>
              <TextField
                fullWidth label="用户名" value={regUsername}
                onChange={(e) => setRegUsername(e.target.value)}
                sx={{ mb: 2 }}
                helperText="字母开头，仅含字母、数字和下划线"
                InputProps={{
                  startAdornment: <InputAdornment position="start"><Person /></InputAdornment>,
                }}
              />
              <TextField
                fullWidth label="邮箱" type="email" value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                sx={{ mb: 2 }}
                InputProps={{
                  startAdornment: <InputAdornment position="start"><Email /></InputAdornment>,
                }}
              />
              <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                <TextField
                  fullWidth label="验证码" value={regCode}
                  onChange={(e) => setRegCode(e.target.value)}
                  InputProps={{
                    startAdornment: <InputAdornment position="start"><VpnKey /></InputAdornment>,
                  }}
                />
                <Button
                  variant="outlined" sx={{ minWidth: 120, whiteSpace: 'nowrap' }}
                  onClick={handleSendCode}
                  disabled={codeLoading || countdown > 0}
                >
                  {codeLoading ? <CircularProgress size={20} /> : countdown > 0 ? `${countdown}s` : '发送验证码'}
                </Button>
              </Box>
              <TextField
                fullWidth label="密码" type="password" value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
                sx={{ mb: 3 }}
                helperText="至少 4 个字符"
                InputProps={{
                  startAdornment: <InputAdornment position="start"><Lock /></InputAdornment>,
                }}
              />
              <Button
                type="submit" fullWidth variant="contained" size="large"
                disabled={loading}
                sx={{ py: 1.5 }}
              >
                {loading ? <CircularProgress size={24} /> : '注册'}
              </Button>
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  )
}
