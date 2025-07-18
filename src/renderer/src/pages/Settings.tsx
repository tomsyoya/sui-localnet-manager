import React, { useState, useEffect } from 'react'
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
  Grid,
  Divider,
  Alert,
  Chip,
  CircularProgress,
} from '@mui/material'
import { 
  Save as SaveIcon, 
  FolderOpen as FolderIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon 
} from '@mui/icons-material'

interface SuiInstallation {
  installed: boolean
  version: string
  path: string
}

const Settings: React.FC = () => {
  const [settings, setSettings] = useState({
    port: '9000',
    nodeCount: '4',
    initialBalance: '1000000',
    theme: 'light' as 'light' | 'dark' | 'system',
    notifications: true,
    autoUpdate: true,
    suiPath: '',
  })
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [suiInstallation, setSuiInstallation] = useState<SuiInstallation | null>(null)

  useEffect(() => {
    loadSettings()
    checkSuiInstallation()
  }, [])

  const loadSettings = async () => {
    try {
      if (window.electronAPI) {
        const appSettings = await window.electronAPI.config.getSettings()
        setSettings({
          port: '9000', // ネットワーク設定は現在アクティブなプロファイルから取得
          nodeCount: '4',
          initialBalance: '1000000',
          theme: appSettings.theme || 'light',
          notifications: appSettings.notifications ?? true,
          autoUpdate: appSettings.autoUpdate ?? true,
          suiPath: appSettings.suiPath || '',
        })

        // アクティブプロファイルからネットワーク設定を取得
        const profiles = await window.electronAPI.config.getProfiles()
        const activeProfile = profiles.find(p => p.active)
        if (activeProfile) {
          setSettings(prev => ({
            ...prev,
            port: activeProfile.port || '9000',
            nodeCount: activeProfile.nodeCount || '4',
            initialBalance: activeProfile.initialBalance || '1000000',
          }))
        }
      }
    } catch (error) {
      console.error('Failed to load settings:', error)
    } finally {
      setLoading(false)
    }
  }

  const checkSuiInstallation = async () => {
    try {
      if (window.electronAPI) {
        const installation = await window.electronAPI.sui.checkInstallation()
        setSuiInstallation(installation)
      }
    } catch (error) {
      console.error('Failed to check SUI installation:', error)
    }
  }

  const handleChange = (field: string, value: string | boolean) => {
    setSettings(prev => ({ ...prev, [field]: value }))
    setSaved(false)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      if (window.electronAPI) {
        // アプリケーション設定を保存
        const appSettings = {
          theme: settings.theme,
          notifications: settings.notifications,
          autoUpdate: settings.autoUpdate,
          suiPath: settings.suiPath,
        }
        
        const result = await window.electronAPI.config.saveSettings(appSettings)
        
        if (result.success) {
          setSaved(true)
          setTimeout(() => setSaved(false), 3000)
          
          // SUIパスが変更された場合は再確認
          if (settings.suiPath !== suiInstallation?.path) {
            await checkSuiInstallation()
          }
        }
      }
    } catch (error) {
      console.error('Failed to save settings:', error)
    } finally {
      setSaving(false)
    }
  }

  const handleSelectSuiPath = async () => {
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.system.selectFile({
          title: 'SUIバイナリファイルを選択',
          defaultPath: '/usr/local/bin',
          buttonLabel: '選択',
          filters: [
            { name: 'SUIバイナリ', extensions: [''] },
            { name: 'すべてのファイル', extensions: ['*'] }
          ]
        })

        if (!result.canceled && result.filePath) {
          setSettings(prev => ({ ...prev, suiPath: result.filePath! }))
          // パス変更後にSUIインストール状況を再確認
          setTimeout(checkSuiInstallation, 500)
        }
      }
    } catch (error) {
      console.error('Failed to select SUI path:', error)
    }
  }

  const handleDetectSuiPath = async () => {
    try {
      if (window.electronAPI) {
        const installation = await window.electronAPI.sui.checkInstallation()
        if (installation.installed && installation.path) {
          setSettings(prev => ({ ...prev, suiPath: installation.path }))
          setSuiInstallation(installation)
        }
      }
    } catch (error) {
      console.error('Failed to detect SUI path:', error)
    }
  }

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        設定
      </Typography>

      {saved && (
        <Alert severity="success" sx={{ mb: 3 }}>
          設定が保存されました
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* ネットワーク設定 */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                ネットワーク設定
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    label="ポート番号"
                    value={settings.port}
                    onChange={(e) => handleChange('port', e.target.value)}
                    type="number"
                    helperText="SUIネットワークが使用するポート番号"
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    label="ノード数"
                    value={settings.nodeCount}
                    onChange={(e) => handleChange('nodeCount', e.target.value)}
                    type="number"
                    helperText="起動するノードの数"
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    label="初期残高"
                    value={settings.initialBalance}
                    onChange={(e) => handleChange('initialBalance', e.target.value)}
                    type="number"
                    helperText="テストアカウントの初期残高"
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* アプリケーション設定 */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                アプリケーション設定
              </Typography>
              <Grid container spacing={2} alignItems="center">
                <Grid item xs={12} md={6}>
                  <FormControl fullWidth>
                    <InputLabel>テーマ</InputLabel>
                    <Select
                      value={settings.theme}
                      label="テーマ"
                      onChange={(e) => handleChange('theme', e.target.value)}
                    >
                      <MenuItem value="light">ライト</MenuItem>
                      <MenuItem value="dark">ダーク</MenuItem>
                      <MenuItem value="system">システム設定に従う</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} md={6}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={settings.notifications}
                        onChange={(e) => handleChange('notifications', e.target.checked)}
                      />
                    }
                    label="通知を有効にする"
                  />
                </Grid>
                <Grid item xs={12}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={settings.autoUpdate}
                        onChange={(e) => handleChange('autoUpdate', e.target.checked)}
                      />
                    }
                    label="SUIの自動アップデートを有効にする"
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* SUIインストール設定 */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                <Typography variant="h6">
                  SUIインストール設定
                </Typography>
                {suiInstallation && (
                  <Chip
                    icon={suiInstallation.installed ? <CheckIcon /> : <ErrorIcon />}
                    label={suiInstallation.installed ? `SUI v${suiInstallation.version}` : 'SUI未検出'}
                    color={suiInstallation.installed ? 'success' : 'error'}
                    size="small"
                  />
                )}
              </Box>

              <TextField
                fullWidth
                label="SUIパス"
                value={settings.suiPath}
                onChange={(e) => handleChange('suiPath', e.target.value)}
                helperText={
                  suiInstallation?.installed 
                    ? `検出されたSUIバージョン: ${suiInstallation.version}`
                    : "SUIバイナリファイルのパス"
                }
                sx={{ mb: 2 }}
                error={settings.suiPath !== '' && !suiInstallation?.installed}
              />
              
              <Box display="flex" gap={2}>
                <Button 
                  variant="outlined" 
                  size="small"
                  startIcon={<FolderIcon />}
                  onClick={handleSelectSuiPath}
                >
                  パスを選択
                </Button>
                <Button 
                  variant="outlined" 
                  size="small"
                  onClick={handleDetectSuiPath}
                >
                  自動検出
                </Button>
              </Box>

              {suiInstallation && !suiInstallation.installed && (
                <Alert severity="warning" sx={{ mt: 2 }}>
                  SUIが検出されません。正しいパスを指定するか、SUIをインストールしてください。
                </Alert>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* 保存ボタン */}
        <Grid item xs={12}>
          <Box display="flex" justifyContent="flex-end">
            <Button
              variant="contained"
              startIcon={saving ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
              onClick={handleSave}
              size="large"
              disabled={saving}
            >
              {saving ? '保存中...' : '設定を保存'}
            </Button>
          </Box>
        </Grid>
      </Grid>
    </Box>
  )
}

export default Settings