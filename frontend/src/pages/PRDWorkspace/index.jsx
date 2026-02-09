/**
 * PRDWorkspace - Refactored with Component Splitting
 *
 * This is the main container component that orchestrates the three main tabs:
 * - PrdTab: PRD document editing and chat
 * - DesignTab: UI prototype image generation
 * - ComprehensiveTab: Comprehensive document export
 *
 * State is managed through Zustand stores for better performance and maintainability.
 */
import { useEffect } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Box, CircularProgress, Tabs, Tab } from '@mui/material'

import { useAuth } from '../../contexts/AuthContext'
import { useProjectStore } from '../../stores'
import { usePRDWorkspace } from './hooks/usePRDWorkspace'

import PrdTab from './components/PrdTab'
import DesignTab from './components/DesignTab'
import ComprehensiveTab from './components/ComprehensiveTab'

import './PRDWorkspace.css'

// Tab panel component
function TabPanel({ children, value, index, ...other }) {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`prd-tabpanel-${index}`}
      aria-labelledby={`prd-tab-${index}`}
      style={{ height: 'calc(100% - 48px)' }}
      {...other}
    >
      {value === index && children}
    </div>
  )
}

export default function PRDWorkspace() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useAuth()

  // Get states from stores
  const {
    project,
    userPermission,
    activeTab,
    isLoading,
    error,
    setActiveTab,
  } = useProjectStore()

  // Initialize workspace hook
  usePRDWorkspace(user)

  // Sync tab with URL
  useEffect(() => {
    const tabParam = searchParams.get('tab')
    if (tabParam === 'design') setActiveTab('design')
    else if (tabParam === 'comprehensive') setActiveTab('comprehensive')
    else setActiveTab('prd')
  }, [searchParams, setActiveTab])

  // Update URL when tab changes
  const handleTabChange = (event, newValue) => {
    if (newValue === 'design') setSearchParams({ tab: 'design' })
    else if (newValue === 'comprehensive') setSearchParams({ tab: 'comprehensive' })
    else setSearchParams({})
  }

  // Compute edit permission
  const canEdit = userPermission === 'owner' || userPermission === 'edit' || user?.is_admin

  // Loading state
  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    )
  }

  // Error state
  if (error) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <div style={{ color: '#d32f2f', marginBottom: 16 }}>{error}</div>
        <button onClick={() => navigate('/')}>
          返回项目列表
        </button>
      </Box>
    )
  }

  // Project not loaded
  if (!project) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <div>项目不存在或无权访问</div>
        <button onClick={() => navigate('/')} style={{ marginTop: 16 }}>
          返回项目列表
        </button>
      </Box>
    )
  }

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box sx={{ p: 2, borderBottom: '1px solid #e0e0e0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20 }}>{project.name}</h1>
          <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
            状态: {project.status} | 版本: {project.version}
          </div>
        </div>
        <div style={{ fontSize: 14, color: '#666' }}>
          权限: {userPermission === 'owner' ? '所有者' : userPermission === 'edit' ? '编辑者' : '查看者'}
        </div>
      </Box>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onChange={handleTabChange}
        sx={{ borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab label="PRD 文档" value="prd" />
        <Tab label="界面设计" value="design" />
        <Tab label="综合导出" value="comprehensive" />
      </Tabs>

      {/* Tab Panels */}
      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        <TabPanel value={activeTab} index="prd">
          <PrdTab projectId={id} canEdit={canEdit} />
        </TabPanel>
        <TabPanel value={activeTab} index="design">
          <DesignTab projectId={id} canEdit={canEdit} />
        </TabPanel>
        <TabPanel value={activeTab} index="comprehensive">
          <ComprehensiveTab projectId={id} canEdit={canEdit} />
        </TabPanel>
      </Box>
    </Box>
  )
}
