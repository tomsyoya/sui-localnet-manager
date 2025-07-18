import React from 'react'
import { Routes, Route } from 'react-router-dom'
import { Box } from '@mui/material'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Settings from './pages/Settings'
import Logs from './pages/Logs'
import Profiles from './pages/Profiles'

function App() {
  return (
    <Box sx={{ display: 'flex', height: '100vh' }}>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/logs" element={<Logs />} />
          <Route path="/profiles" element={<Profiles />} />
        </Routes>
      </Layout>
    </Box>
  )
}

export default App