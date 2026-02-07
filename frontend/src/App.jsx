import { Routes, Route } from 'react-router-dom'
import ProjectList from './pages/ProjectList'
import PRDWorkspace from './pages/PRDWorkspace'
import SkillManagement from './pages/SkillManagement'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<ProjectList />} />
      <Route path="/project/:id" element={<PRDWorkspace />} />
      <Route path="/skills" element={<SkillManagement />} />
    </Routes>
  )
}
