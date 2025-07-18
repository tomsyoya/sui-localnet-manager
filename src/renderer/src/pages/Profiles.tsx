import React, { useState, useEffect } from 'react'
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Chip,
  Grid,
} from '@mui/material'
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  FileCopy as CopyIcon,
} from '@mui/icons-material'

interface Profile {
  id: string
  name: string
  active: boolean
  port?: string
  nodeCount?: string
  initialBalance?: string
}

const Profiles: React.FC = () => {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    port: '9000',
    nodeCount: '4',
    initialBalance: '1000000',
  })

  useEffect(() => {
    loadProfiles()
  }, [])

  const loadProfiles = async () => {
    try {
      if (window.electronAPI) {
        const profileList = await window.electronAPI.config.getProfiles()
        setProfiles(profileList.map((p: any) => ({
          ...p,
          port: p.port || '9000',
          nodeCount: p.nodeCount || '4',
          initialBalance: p.initialBalance || '1000000',
        })))
      }
    } catch (error) {
      console.error('Failed to load profiles:', error)
    }
  }

  const handleCreateProfile = () => {
    setEditingProfile(null)
    setFormData({
      name: '',
      port: '9000',
      nodeCount: '4',
      initialBalance: '1000000',
    })
    setDialogOpen(true)
  }

  const handleEditProfile = (profile: Profile) => {
    setEditingProfile(profile)
    setFormData({
      name: profile.name,
      port: profile.port || '9000',
      nodeCount: profile.nodeCount || '4',
      initialBalance: profile.initialBalance || '1000000',
    })
    setDialogOpen(true)
  }

  const handleCopyProfile = (profile: Profile) => {
    setEditingProfile(null)
    setFormData({
      name: `${profile.name} のコピー`,
      port: profile.port || '9000',
      nodeCount: profile.nodeCount || '4',
      initialBalance: profile.initialBalance || '1000000',
    })
    setDialogOpen(true)
  }

  const handleDeleteProfile = async (profileId: string) => {
    try {
      if (window.electronAPI) {
        await window.electronAPI.config.deleteProfile(profileId)
        setProfiles(prev => prev.filter(p => p.id !== profileId))
      }
    } catch (error) {
      console.error('Failed to delete profile:', error)
    }
  }

  const handleSaveProfile = async () => {
    try {
      const profileData = {
        id: editingProfile?.id || `profile_${Date.now()}`,
        name: formData.name,
        port: formData.port,
        nodeCount: formData.nodeCount,
        initialBalance: formData.initialBalance,
        active: false,
      }

      if (window.electronAPI) {
        await window.electronAPI.config.saveProfile(profileData)
      }

      if (editingProfile) {
        setProfiles(prev => prev.map(p => 
          p.id === editingProfile.id ? { ...p, ...profileData } : p
        ))
      } else {
        setProfiles(prev => [...prev, profileData])
      }

      setDialogOpen(false)
    } catch (error) {
      console.error('Failed to save profile:', error)
    }
  }

  const handleActivateProfile = (profileId: string) => {
    setProfiles(prev => prev.map(p => ({
      ...p,
      active: p.id === profileId
    })))
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">
          プロファイル管理
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleCreateProfile}
        >
          新しいプロファイル
        </Button>
      </Box>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            設定プロファイル
          </Typography>
          <List>
            {profiles.map((profile) => (
              <ListItem 
                key={profile.id} 
                divider
                sx={{ 
                  py: 2,
                  pr: 20, // ListItemSecondaryActionのスペースを確保
                  minHeight: 80 // 最小高さを設定
                }}
              >
                <ListItemText
                  primary={
                    <Box display="flex" alignItems="center" gap={1} mb={0.5}>
                      <Typography variant="h6" component="span">
                        {profile.name}
                      </Typography>
                      {profile.active && (
                        <Chip label="アクティブ" color="primary" size="small" />
                      )}
                    </Box>
                  }
                  secondary={
                    <Box mt={0.5}>
                      <Typography variant="body2" color="text.secondary">
                        ポート: {profile.port} | ノード数: {profile.nodeCount} | 初期残高: {profile.initialBalance}
                      </Typography>
                    </Box>
                  }
                />
                <ListItemSecondaryAction>
                  <Box 
                    display="flex" 
                    flexDirection="column" 
                    gap={1}
                    alignItems="flex-end"
                  >
                    {/* 上段: アクティブ化ボタン */}
                    <Box>
                      {!profile.active && (
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => handleActivateProfile(profile.id)}
                        >
                          アクティブ化
                        </Button>
                      )}
                    </Box>
                    
                    {/* 下段: アクションボタン */}
                    <Box display="flex" gap={0.5}>
                      <IconButton
                        size="small"
                        onClick={() => handleEditProfile(profile)}
                        title="編集"
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => handleCopyProfile(profile)}
                        title="コピー"
                      >
                        <CopyIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => handleDeleteProfile(profile.id)}
                        disabled={profile.active}
                        title="削除"
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  </Box>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        </CardContent>
      </Card>

      {/* プロファイル編集ダイアログ */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          {editingProfile ? 'プロファイルを編集' : '新しいプロファイルを作成'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="プロファイル名"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                label="ポート番号"
                value={formData.port}
                onChange={(e) => setFormData(prev => ({ ...prev, port: e.target.value }))}
                type="number"
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                label="ノード数"
                value={formData.nodeCount}
                onChange={(e) => setFormData(prev => ({ ...prev, nodeCount: e.target.value }))}
                type="number"
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                label="初期残高"
                value={formData.initialBalance}
                onChange={(e) => setFormData(prev => ({ ...prev, initialBalance: e.target.value }))}
                type="number"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>
            キャンセル
          </Button>
          <Button
            onClick={handleSaveProfile}
            variant="contained"
            disabled={!formData.name.trim()}
          >
            保存
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default Profiles