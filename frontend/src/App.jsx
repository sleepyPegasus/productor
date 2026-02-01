import { Routes, Route } from 'react-router-dom'
import ProjectList from './pages/ProjectList'
import PRDWorkspace from './pages/PRDWorkspace'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<ProjectList />} />
      <Route path="/project/:id" element={<PRDWorkspace />} />
    </Routes>
  )
}
