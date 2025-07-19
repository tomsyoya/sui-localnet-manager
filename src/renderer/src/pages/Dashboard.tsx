import React, { useState, useEffect, useRef } from 'react'
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Grid,
  Chip,
  LinearProgress,
  Alert,
  List,
  ListItem,
  ListItemText,
  Paper,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material'
import {
  PlayArrow as StartIcon,
  Stop as StopIcon,
  Refresh as RefreshIcon,
  ExpandLess as ExpandLessIcon,
  ExpandMore as ExpandMoreIcon,
  Delete as DeleteIcon,
  DeleteSweep as DeleteSweepIcon,
  NetworkCheck as NetworkCheckIcon,
  Sync as SyncIcon,
} from '@mui/icons-material'

interface NetworkStatus {
  running: boolean
  nodeCount: number
  blockHeight: number
  transactions: number
}

interface LogEntry {
  timestamp: string
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  source?: string
}

interface ExistingProcess {
  pid: number
  command: string
  port?: string
  status?: {
    pid: number
    ppid: number
    state: string
    cpu: number
    memory: number
    time: string
    command: string
  }
}

const Dashboard: React.FC = () => {
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>({
    running: false,
    nodeCount: 0,
    blockHeight: 0,
    transactions: 0,
  })
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [logExpanded, setLogExpanded] = useState(true)
  const [logLevel, setLogLevel] = useState<string>('all')
  const [existingProcesses, setExistingProcesses] = useState<ExistingProcess[]>([])
  const [processExpanded, setProcessExpanded] = useState(false)
  const processMonitorIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const logListRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // 初期状態の取得
    refreshStatus()

    // 初期ログロード
    loadInitialLogs()
    
    // 既存プロセス検出
    detectExistingProcesses()
    
    // プロセス監視の開始
    startProcessMonitoring()

    // 定期的な状態更新（5秒間隔）
    const statusInterval = setInterval(() => {
      refreshStatus()
    }, 5000)

    // クリーンアップ
    return () => {
      // プロセス監視の停止
      if (processMonitorIntervalRef.current) {
        clearInterval(processMonitorIntervalRef.current)
      }
      
      // 状態更新の停止
      clearInterval(statusInterval)
    }
  }, [])

  const loadInitialLogs = async () => {
    try {
      if (window.electronAPI) {
        const logEntries = await window.electronAPI.logs.getLogs()
        // 型変換と最新50件の制限
        const convertedLogs: LogEntry[] = logEntries
          .slice(0, 50)
          .map(log => ({
            timestamp: log.timestamp,
            level: log.level as 'info' | 'warn' | 'error' | 'debug',
            message: log.message
          }))
        setLogs(convertedLogs)
      }
    } catch (error) {
      console.error('Failed to load initial logs:', error)
    }
  }

  const refreshStatus = async () => {
    try {
      if (window.electronAPI) {
        const status = await window.electronAPI.sui.getStatus()
        setNetworkStatus(status)
      }
    } catch (error) {
      console.error('Failed to get status:', error)
    }
  }

  const detectExistingProcesses = async () => {
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.sui.detectExistingNetwork()
        setExistingProcesses(result.processes || [])
      }
    } catch (error) {
      console.error('Failed to detect existing processes:', error)
    }
  }

  const startProcessMonitoring = () => {
    // プロセス監視間隔を5秒に設定
    const interval = setInterval(() => {
      if (processExpanded) {
        detectExistingProcesses()
      }
    }, 5000)
    
    processMonitorIntervalRef.current = interval
  }


  const handleKillProcess = async (pid: number) => {
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.sui.killProcess(pid)
        setMessage(result.message)
        
        if (result.success) {
          // プロセス一覧を更新
          detectExistingProcesses()
        }
      }
    } catch (error) {
      setMessage('プロセスの停止に失敗しました')
    }
  }

  const handleKillAllProcesses = async () => {
    setLoading(true)
    setMessage(null)
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.sui.killAllProcesses()
        setMessage(result.message)
        
        if (result.success) {
          // プロセス一覧を更新
          detectExistingProcesses()
        }
      }
    } catch (error) {
      setMessage('プロセスの一括停止に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyConnection = async () => {
    setLoading(true)
    setMessage(null)
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.sui.verifyNetworkConnection()
        setMessage(result.message)
        
        // 接続確認後に状態を更新
        if (result.connected) {
          await refreshStatus()
        }
      }
    } catch (error) {
      setMessage('ネットワーク接続確認に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const handleSyncWithExisting = async () => {
    setLoading(true)
    setMessage(null)
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.sui.syncWithExistingNetwork()
        setMessage(result.message)
        
        // 同期成功後に状態を更新
        if (result.success) {
          await refreshStatus()
          // プロセス一覧も更新
          detectExistingProcesses()
        }
      }
    } catch (error) {
      setMessage('既存ネットワークとの同期に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const handleStart = async () => {
    setLoading(true)
    setMessage(null)
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.sui.start()
        setMessage(result.message)
        if (result.success) {
          // リアルタイム更新はイベントリスナーで処理される
          console.log('SUI network start requested')
        }
      }
    } catch (error) {
      setMessage('ネットワークの起動に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const handleStop = async () => {
    setLoading(true)
    setMessage(null)
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.sui.stop()
        setMessage(result.message)
        if (result.success) {
          // リアルタイム更新はイベントリスナーで処理される
          console.log('SUI network stop requested')
        }
      }
    } catch (error) {
      setMessage('ネットワークの停止に失敗しました')
    } finally {
      setLoading(false)
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
    return new Date(timestamp).toLocaleTimeString('ja-JP')
  }

  const filteredLogs = logs.filter(log => {
    if (logLevel === 'all') return true
    return log.level === logLevel
  })

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        ダッシュボード
      </Typography>

      {message && (
        <Alert severity="info" sx={{ mb: 3 }}>
          {message}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* ネットワーク制御 */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                <Typography variant="h6">ネットワーク制御</Typography>
                <Chip
                  label={networkStatus.running ? '実行中' : '停止中'}
                  color={networkStatus.running ? 'success' : 'default'}
                />
              </Box>
              
              {loading && <LinearProgress sx={{ mb: 2 }} />}
              
              <Box display="flex" gap={2}>
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<StartIcon />}
                  onClick={handleStart}
                  disabled={networkStatus.running || loading}
                >
                  ネットワーク開始
                </Button>
                <Button
                  variant="contained"
                  color="error"
                  startIcon={<StopIcon />}
                  onClick={handleStop}
                  disabled={!networkStatus.running || loading}
                >
                  ネットワーク停止
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<RefreshIcon />}
                  onClick={() => {
                    refreshStatus()
                    detectExistingProcesses()
                  }}
                  disabled={loading}
                >
                  状態更新
                </Button>
                <Button
                  variant="outlined"
                  color="info"
                  startIcon={<NetworkCheckIcon />}
                  onClick={handleVerifyConnection}
                  disabled={loading}
                >
                  接続確認
                </Button>
                <Button
                  variant="outlined"
                  color="warning"
                  startIcon={<SyncIcon />}
                  onClick={handleSyncWithExisting}
                  disabled={loading}
                >
                  既存と同期
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* ネットワーク統計 */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                ノード数
              </Typography>
              <Typography variant="h3" color="primary">
                {networkStatus.nodeCount}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                ブロック高
              </Typography>
              <Typography variant="h3" color="primary">
                {networkStatus.blockHeight.toLocaleString()}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                処理済みトランザクション
              </Typography>
              <Typography variant="h3" color="primary">
                {networkStatus.transactions}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                ネットワーク状態
              </Typography>
              <Typography variant="h3" color={networkStatus.running ? 'success.main' : 'text.secondary'}>
                {networkStatus.running ? '正常' : '停止'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* 既存プロセス状況 */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                <Typography variant="h6">
                  既存のSUIプロセス
                </Typography>
                <Box display="flex" alignItems="center" gap={2}>
                  <Chip
                    label={`${existingProcesses.length}個のプロセス`}
                    color={existingProcesses.length > 0 ? 'warning' : 'default'}
                  />
                  {existingProcesses.length > 0 && (
                    <Button
                      size="small"
                      variant="outlined"
                      color="error"
                      startIcon={<DeleteSweepIcon />}
                      onClick={handleKillAllProcesses}
                      disabled={loading}
                    >
                      すべて停止
                    </Button>
                  )}
                  <Button
                    size="small"
                    onClick={() => setProcessExpanded(!processExpanded)}
                    endIcon={processExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                  >
                    {processExpanded ? '折りたたみ' : '展開'}
                  </Button>
                </Box>
              </Box>
              
              {processExpanded && (
                <Paper variant="outlined" sx={{ maxHeight: 300, overflow: 'hidden' }}>
                  <Box sx={{ maxHeight: 300, overflowY: 'auto', backgroundColor: 'background.paper' }}>
                    <List dense>
                      {existingProcesses.length > 0 ? (
                        existingProcesses.map((process, index) => (
                          <ListItem 
                            key={index} 
                            divider={index < existingProcesses.length - 1}
                            secondaryAction={
                              <Button
                                size="small"
                                variant="outlined"
                                color="error"
                                startIcon={<DeleteIcon />}
                                onClick={() => handleKillProcess(process.pid)}
                                disabled={loading}
                              >
                                停止
                              </Button>
                            }
                          >
                            <ListItemText
                              primary={
                                <Box display="flex" alignItems="center" gap={1} mb={0.5}>
                                  <Chip
                                    label={`PID: ${process.pid}`}
                                    size="small"
                                    color="primary"
                                  />
                                  {process.port && (
                                    <Chip
                                      label={`ポート: ${process.port}`}
                                      size="small"
                                      color="secondary"
                                    />
                                  )}
                                  {process.status && (
                                    <Chip
                                      label={`状態: ${process.status.state}`}
                                      size="small"
                                      color={process.status.state === 'R' ? 'success' : 'default'}
                                    />
                                  )}
                                </Box>
                              }
                              secondary={
                                <Box sx={{ pr: 10 }}>
                                  <Typography
                                    variant="body2"
                                    sx={{ fontFamily: 'monospace', fontSize: '0.875rem', wordBreak: 'break-all' }}
                                  >
                                    {process.command}
                                  </Typography>
                                  {process.status && (
                                    <Typography variant="caption" color="text.secondary">
                                      CPU: {process.status.cpu}% | メモリ: {process.status.memory}% | 実行時間: {process.status.time}
                                    </Typography>
                                  )}
                                </Box>
                              }
                            />
                          </ListItem>
                        ))
                      ) : (
                        <ListItem>
                          <ListItemText
                            primary="既存のSUIプロセスはありません"
                            secondary="現在実行中のSUIプロセスは検出されませんでした"
                          />
                        </ListItem>
                      )}
                    </List>
                  </Box>
                </Paper>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* リアルタイムログビューア */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                <Typography variant="h6">
                  リアルタイムログ
                </Typography>
                <Box display="flex" alignItems="center" gap={2}>
                  <FormControl size="small" sx={{ minWidth: 120 }}>
                    <InputLabel>レベル</InputLabel>
                    <Select
                      value={logLevel}
                      label="レベル"
                      onChange={(e) => setLogLevel(e.target.value)}
                    >
                      <MenuItem value="all">すべて</MenuItem>
                      <MenuItem value="error">エラー</MenuItem>
                      <MenuItem value="warn">警告</MenuItem>
                      <MenuItem value="info">情報</MenuItem>
                      <MenuItem value="debug">デバッグ</MenuItem>
                    </Select>
                  </FormControl>
                  <Button
                    size="small"
                    onClick={() => setLogExpanded(!logExpanded)}
                    endIcon={logExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                  >
                    {logExpanded ? '折りたたみ' : '展開'}
                  </Button>
                </Box>
              </Box>
              
              {logExpanded && (
                <Paper variant="outlined" sx={{ maxHeight: 300, overflow: 'hidden' }}>
                  <Box
                    ref={logListRef}
                    sx={{
                      maxHeight: 300,
                      overflowY: 'auto',
                      backgroundColor: 'background.paper',
                    }}
                  >
                    <List dense>
                      {filteredLogs.length > 0 ? (
                        filteredLogs.map((log, index) => (
                          <ListItem key={index} divider={index < filteredLogs.length - 1}>
                            <ListItemText
                              primary={
                                <Box display="flex" alignItems="center" gap={1} mb={0.5}>
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
                                  <Typography variant="caption" color="text.secondary">
                                    {formatTimestamp(log.timestamp)}
                                  </Typography>
                                </Box>
                              }
                              secondary={
                                <Typography
                                  variant="body2"
                                  sx={{
                                    fontFamily: 'monospace',
                                    fontSize: '0.875rem',
                                    wordBreak: 'break-all',
                                    whiteSpace: 'pre-wrap',
                                  }}
                                >
                                  {log.message}
                                </Typography>
                              }
                            />
                          </ListItem>
                        ))
                      ) : (
                        <ListItem>
                          <ListItemText
                            primary="ログエントリがありません"
                            secondary="ネットワークを開始するとログが表示されます"
                          />
                        </ListItem>
                      )}
                    </List>
                  </Box>
                </Paper>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  )
}

export default Dashboard