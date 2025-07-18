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
  List,
  ListItem,
  ListItemText,
  Chip,
  Grid,
  Paper,
} from '@mui/material'
import {
  Download as ExportIcon,
  Refresh as RefreshIcon,
  Search as SearchIcon,
} from '@mui/icons-material'

interface LogEntry {
  timestamp: string
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  source?: string
}

const Logs: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [filteredLogs, setFilteredLogs] = useState<LogEntry[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [logLevel, setLogLevel] = useState<string>('all')

  useEffect(() => {
    loadLogs()

    // リアルタイムログ更新のためのイベントリスナー設定
    if (window.electronAPI) {
      window.electronAPI.logs.onNewLog((newLog) => {
        setLogs(prev => [newLog, ...prev].slice(0, 1000)) // 最新1000件を保持
      })

      window.electronAPI.logs.onLogsCleared(() => {
        setLogs([])
      })
    }

    // クリーンアップ
    return () => {
      if (window.electronAPI) {
        window.electronAPI.logs.removeAllListeners()
      }
    }
  }, [])

  useEffect(() => {
    filterLogs()
  }, [logs, searchTerm, logLevel])

  const loadLogs = async () => {
    try {
      if (window.electronAPI) {
        const logEntries = await window.electronAPI.logs.getLogs()
        setLogs(logEntries)
      }
    } catch (error) {
      console.error('Failed to load logs:', error)
    }
  }

  const filterLogs = () => {
    let filtered = logs

    // レベルフィルタ
    if (logLevel !== 'all') {
      filtered = filtered.filter(log => log.level === logLevel)
    }

    // 検索フィルタ
    if (searchTerm) {
      filtered = filtered.filter(log => 
        log.message.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    setFilteredLogs(filtered)
  }

  const handleExportLogs = async () => {
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.logs.exportLogs()
        if (result.success) {
          // 成功通知を表示
          console.log('Logs exported to:', result.path)
        }
      }
    } catch (error) {
      console.error('Failed to export logs:', error)
    }
  }

  const handleClearLogs = async () => {
    try {
      if (window.electronAPI) {
        await window.electronAPI.logs.clearLogs()
      }
    } catch (error) {
      console.error('Failed to clear logs:', error)
    }
  }

  const getLogLevelColor = (level: string) => {
    switch (level) {
      case 'error': return 'error'
      case 'warn': return 'warning'
      case 'info': return 'info'
      case 'debug': return 'default'
      default: return 'default'
    }
  }

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString('ja-JP')
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        ログ
      </Typography>

      {/* コントロール */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                label="ログを検索"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                InputProps={{
                  startAdornment: <SearchIcon sx={{ mr: 1, color: 'action.active' }} />,
                }}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <FormControl fullWidth>
                <InputLabel>ログレベル</InputLabel>
                <Select
                  value={logLevel}
                  label="ログレベル"
                  onChange={(e) => setLogLevel(e.target.value)}
                >
                  <MenuItem value="all">すべて</MenuItem>
                  <MenuItem value="error">エラー</MenuItem>
                  <MenuItem value="warn">警告</MenuItem>
                  <MenuItem value="info">情報</MenuItem>
                  <MenuItem value="debug">デバッグ</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={5}>
              <Box display="flex" gap={2}>
                <Button
                  variant="outlined"
                  startIcon={<RefreshIcon />}
                  onClick={loadLogs}
                >
                  更新
                </Button>
                <Button
                  variant="contained"
                  startIcon={<ExportIcon />}
                  onClick={handleExportLogs}
                >
                  エクスポート
                </Button>
                <Button
                  variant="outlined"
                  color="warning"
                  onClick={handleClearLogs}
                >
                  ログクリア
                </Button>
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* ログ表示 */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            ログエントリ ({filteredLogs.length} 件)
          </Typography>
          <Paper variant="outlined" sx={{ maxHeight: 500, overflow: 'auto' }}>
            <List>
              {filteredLogs.map((log, index) => (
                <ListItem key={index} divider>
                  <ListItemText
                    primary={
                      <Box display="flex" alignItems="center" gap={1} mb={1}>
                        <Chip
                          label={log.level.toUpperCase()}
                          size="small"
                          color={getLogLevelColor(log.level) as any}
                        />
                        {log.source && (
                          <Chip
                            label={log.source}
                            size="small"
                            variant="outlined"
                            color="primary"
                          />
                        )}
                        <Typography variant="body2" color="text.secondary">
                          {formatTimestamp(log.timestamp)}
                        </Typography>
                      </Box>
                    }
                    secondary={
                      <Typography
                        variant="body2"
                        sx={{
                          fontFamily: 'monospace',
                          wordBreak: 'break-all',
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {log.message}
                      </Typography>
                    }
                  />
                </ListItem>
              ))}
              {filteredLogs.length === 0 && (
                <ListItem>
                  <ListItemText
                    primary="ログエントリがありません"
                    secondary="検索条件を変更するか、ログを更新してください"
                  />
                </ListItem>
              )}
            </List>
          </Paper>
        </CardContent>
      </Card>
    </Box>
  )
}

export default Logs