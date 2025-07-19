import { spawn, ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import path from 'path'
import fs from 'fs/promises'

export interface SuiStatus {
  running: boolean
  nodeCount: number
  blockHeight: number
  transactions: number
  pid?: number
}

export interface SuiInstallation {
  installed: boolean
  version: string
  path: string
}

export class SuiService extends EventEmitter {
  private suiProcess: ChildProcess | null = null
  private suiPath: string = ''
  private statusUpdateInterval: NodeJS.Timeout | null = null
  private currentStatus: SuiStatus = {
    running: false,
    nodeCount: 0,
    blockHeight: 0,
    transactions: 0,
  }

  constructor() {
    super()
  }

  async checkInstallation(): Promise<SuiInstallation> {
    // 設定されたパスを最初に確認
    if (this.suiPath) {
      try {
        await fs.access(this.suiPath)
        const version = await this.getSuiVersion(this.suiPath)
        return {
          installed: true,
          version,
          path: this.suiPath,
        }
      } catch (error) {
        // 設定されたパスが無効な場合は自動検出に進む
      }
    }

    const possiblePaths = [
      '/usr/local/bin/sui',
      '/opt/homebrew/bin/sui',
      '/usr/bin/sui',
      path.join(process.env.HOME || '', '.cargo/bin/sui'),
    ]

    for (const suiPath of possiblePaths) {
      try {
        await fs.access(suiPath)
        const version = await this.getSuiVersion(suiPath)
        this.suiPath = suiPath
        return {
          installed: true,
          version,
          path: suiPath,
        }
      } catch (error) {
        // パスが存在しない場合は次を試す
        continue
      }
    }

    return {
      installed: false,
      version: '',
      path: '',
    }
  }

  private async getSuiVersion(suiPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const process = spawn(suiPath, ['--version'], { stdio: 'pipe' })
      let output = ''

      process.stdout?.on('data', (data) => {
        output += data.toString()
      })

      process.on('close', (code) => {
        if (code === 0) {
          // "sui 1.x.x" のような形式から バージョン部分を抽出
          const versionMatch = output.match(/sui\s+(.+)/)
          resolve(versionMatch ? versionMatch[1].trim() : output.trim())
        } else {
          reject(new Error(`Failed to get SUI version: exit code ${code}`))
        }
      })

      process.on('error', (error) => {
        reject(error)
      })
    })
  }

  async checkExistingProcesses(): Promise<{ processes: Array<{ pid: number; command: string; port?: string }> }> {
    try {
      const { spawn } = await import('child_process')
      
      return new Promise((resolve) => {
        const psProcess = spawn('ps', ['aux'], { stdio: 'pipe' })
        let output = ''
        
        psProcess.stdout?.on('data', (data) => {
          output += data.toString()
        })
        
        psProcess.on('close', () => {
          const lines = output.split('\n')
          const suiProcesses = lines
            .filter(line => line.includes('sui start') || line.includes('sui-test-validator'))
            .map(line => {
              const parts = line.trim().split(/\s+/)
              const pid = parseInt(parts[1])
              const command = parts.slice(10).join(' ')
              
              // ポート番号を抽出
              const portMatch = command.match(/--fullnode-rpc-port\s+(\d+)|--port\s+(\d+)/)
              const port = portMatch ? (portMatch[1] || portMatch[2]) : undefined
              
              return { pid, command, port }
            })
            .filter(process => !isNaN(process.pid))
          
          resolve({ processes: suiProcesses })
        })
        
        psProcess.on('error', () => {
          resolve({ processes: [] })
        })
      })
    } catch (error) {
      this.emit('log', { level: 'error', message: `プロセス検出エラー: ${error instanceof Error ? error.message : 'Unknown error'}` })
      return { processes: [] }
    }
  }

  async getProcessStatus(pid: number): Promise<{ running: boolean; details?: any }> {
    try {
      const { spawn } = await import('child_process')
      
      return new Promise((resolve) => {
        const psProcess = spawn('ps', ['-p', pid.toString(), '-o', 'pid,ppid,state,pcpu,pmem,time,command'], { stdio: 'pipe' })
        let output = ''
        
        psProcess.stdout?.on('data', (data) => {
          output += data.toString()
        })
        
        psProcess.on('close', (code) => {
          if (code === 0 && output.trim()) {
            const lines = output.split('\n')
            if (lines.length > 1) {
              const processInfo = lines[1].trim().split(/\s+/)
              resolve({
                running: true,
                details: {
                  pid: parseInt(processInfo[0]),
                  ppid: parseInt(processInfo[1]),
                  state: processInfo[2],
                  cpu: parseFloat(processInfo[3]),
                  memory: parseFloat(processInfo[4]),
                  time: processInfo[5],
                  command: processInfo.slice(6).join(' ')
                }
              })
            } else {
              resolve({ running: false })
            }
          } else {
            resolve({ running: false })
          }
        })
        
        psProcess.on('error', () => {
          resolve({ running: false })
        })
      })
    } catch (error) {
      this.emit('log', { level: 'error', message: `プロセス状態取得エラー: ${error instanceof Error ? error.message : 'Unknown error'}` })
      return { running: false }
    }
  }

  async detectExistingNetwork(autoSync: boolean = false): Promise<{ found: boolean; processes: Array<{ pid: number; command: string; port?: string; status?: any }> }> {
    const { processes } = await this.checkExistingProcesses()
    
    if (processes.length === 0) {
      return { found: false, processes: [] }
    }

    const processesWithStatus = await Promise.all(
      processes.map(async (process) => {
        const status = await this.getProcessStatus(process.pid)
        return { ...process, status: status.details }
      })
    )

    this.emit('log', { level: 'info', message: `検出されたSUIプロセス: ${processes.length}個` })
    
    // 既存プロセスが見つかった場合、autoSyncがtrueの時のみネットワーク状態を更新
    if (processesWithStatus.length > 0 && autoSync) {
      await this.syncWithExistingNetwork(processesWithStatus)
    }
    
    return { found: true, processes: processesWithStatus }
  }

  async syncWithExistingNetworkManually(): Promise<{ success: boolean; message: string }> {
    try {
      this.emit('log', { level: 'info', message: '既存ネットワークとの手動同期を開始...' })
      
      const { processes } = await this.detectExistingNetwork()
      
      if (processes.length === 0) {
        return { success: false, message: '既存のSUIプロセスが見つかりません' }
      }
      
      const activeProcess = processes.find(p => p.status?.state === 'R') || processes[0]
      const port = activeProcess?.port || '9000'
      
      // ネットワーク接続確認
      const rpcCheck = await this.checkRPCEndpoint(port)
      if (rpcCheck.ready) {
        // 状態を更新
        await this.updateNetworkStatus(port)
        
        // 既存プロセスの情報を設定
        this.currentStatus = {
          ...this.currentStatus,
          running: true,
          pid: activeProcess.pid,
        }
        
        // 定期更新を開始
        this.startStatusUpdates(port)
        
        // 状態変更を通知
        this.emit('status-change', this.currentStatus)
        
        return { success: true, message: `既存ネットワーク(PID:${activeProcess.pid}, ポート:${port})との同期が完了しました` }
      } else {
        return { success: false, message: `既存プロセスが見つかりましたが、ネットワーク接続に失敗しました (ポート:${port})` }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      this.emit('log', { level: 'error', message: `手動同期エラー: ${errorMessage}` })
      return { success: false, message: `手動同期エラー: ${errorMessage}` }
    }
  }

  private async syncWithExistingNetwork(processes: Array<{ pid: number; command: string; port?: string; status?: any }>): Promise<void> {
    try {
      // 最初に見つかったプロセスからポート情報を取得
      const activeProcess = processes.find(p => p.status?.state === 'R') || processes[0]
      const port = activeProcess?.port || '9000'
      
      this.emit('log', { level: 'info', message: `既存ネットワーク(ポート:${port})との同期を開始...` })
      
      // ネットワーク接続確認
      const rpcCheck = await this.checkRPCEndpoint(port)
      if (rpcCheck.ready) {
        // 状態を更新
        await this.updateNetworkStatus(port)
        
        // 既存プロセスの情報を設定
        this.currentStatus = {
          ...this.currentStatus,
          running: true,
          pid: activeProcess.pid,
        }
        
        // 定期更新を開始
        this.startStatusUpdates(port)
        
        // 状態変更を通知
        this.emit('status-change', this.currentStatus)
        this.emit('log', { level: 'info', message: '既存ネットワークとの同期が完了しました' })
      } else {
        this.emit('log', { level: 'warn', message: `既存プロセスが見つかりましたが、ネットワーク接続に失敗しました (ポート:${port})` })
      }
    } catch (error) {
      this.emit('log', { level: 'error', message: `既存ネットワーク同期エラー: ${error instanceof Error ? error.message : 'Unknown error'}` })
    }
  }

  async updateNetworkStatus(port: string = '9000'): Promise<void> {
    try {
      // RPC経由でネットワーク情報を取得
      const networkInfo = await this.getNetworkInfo(port)
      
      if (networkInfo.success) {
        // 現在の状態を更新
        this.currentStatus = {
          running: true,
          nodeCount: networkInfo.data.nodeCount || this.currentStatus.nodeCount,
          blockHeight: networkInfo.data.blockHeight || this.currentStatus.blockHeight,
          transactions: networkInfo.data.transactions || this.currentStatus.transactions,
          pid: this.suiProcess?.pid || this.currentStatus.pid,
        }
        
        // 状態変更を通知
        this.emit('status-change', this.currentStatus)
        this.emit('log', { level: 'info', message: 'ネットワーク状態を更新しました' })
      }
    } catch (error) {
      this.emit('log', { level: 'warn', message: `ネットワーク状態更新エラー: ${error instanceof Error ? error.message : 'Unknown error'}` })
    }
  }

  private async getNetworkInfo(port: string = '9000'): Promise<{ success: boolean; data?: any }> {
    try {
      const { spawn } = await import('child_process')
      
      return new Promise((resolve) => {
        // SUIのRPCを使用してネットワーク情報を取得
        const curlProcess = spawn('curl', [
          '-X', 'POST',
          '-H', 'Content-Type: application/json',
          '-d', '{"jsonrpc":"2.0","method":"sui_getLatestSuiSystemState","params":[],"id":1}',
          `http://localhost:${port}`,
          '--connect-timeout', '3',
          '--max-time', '10',
          '--silent'
        ], { stdio: 'pipe' })
        
        let output = ''
        
        curlProcess.stdout?.on('data', (data) => {
          output += data.toString()
        })
        
        curlProcess.on('close', (code) => {
          if (code === 0 && output.includes('jsonrpc')) {
            try {
              const response = JSON.parse(output)
              if (response.result) {
                // SUIシステム状態から情報を抽出
                const systemState = response.result
                resolve({
                  success: true,
                  data: {
                    nodeCount: systemState.activeValidators?.length || 4,
                    blockHeight: parseInt(systemState.epoch) || 0,
                    transactions: systemState.epochStartTimestampMs ? Math.floor(Date.now() / 1000) - Math.floor(systemState.epochStartTimestampMs / 1000) : 0,
                  }
                })
              } else {
                resolve({ success: false })
              }
            } catch (error) {
              resolve({ success: false })
            }
          } else {
            resolve({ success: false })
          }
        })
        
        curlProcess.on('error', () => {
          resolve({ success: false })
        })
      })
    } catch (error) {
      return { success: false }
    }
  }

  async verifyNetworkConnection(port: string = '9000'): Promise<{ 
    connected: boolean; 
    rpcReady: boolean; 
    clientReady: boolean; 
    message: string; 
    details?: any 
  }> {
    try {
      this.emit('log', { level: 'info', message: 'ネットワーク接続を確認しています...' })
      
      // 1. RPC endpoint の確認
      const rpcCheck = await this.checkRPCEndpoint(port)
      this.emit('log', { 
        level: rpcCheck.ready ? 'info' : 'warn', 
        message: rpcCheck.ready ? 'RPC接続: 成功' : `RPC接続: 失敗 (${rpcCheck.error})` 
      })
      
      // 2. SUI client コマンドでの確認
      const clientCheck = await this.checkNetworkStatus()
      this.emit('log', { 
        level: clientCheck.ready ? 'info' : 'warn', 
        message: clientCheck.ready ? 'SUIクライアント: 成功' : `SUIクライアント: 失敗 (${clientCheck.error})` 
      })
      
      const connected = rpcCheck.ready && clientCheck.ready
      let message = ''
      
      if (connected) {
        message = 'ネットワーク接続が正常に確認されました'
        // 接続が確認された場合、状態を更新
        await this.updateNetworkStatus(port)
      } else if (rpcCheck.ready) {
        message = 'RPC接続は確認されましたが、SUIクライアントの設定に問題があります'
      } else {
        message = 'ネットワーク接続に失敗しました'
      }
      
      return {
        connected,
        rpcReady: rpcCheck.ready,
        clientReady: clientCheck.ready,
        message,
        details: {
          rpcError: rpcCheck.error,
          clientError: clientCheck.error,
          port
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      this.emit('log', { level: 'error', message: `ネットワーク確認エラー: ${errorMessage}` })
      return {
        connected: false,
        rpcReady: false,
        clientReady: false,
        message: `ネットワーク確認エラー: ${errorMessage}`
      }
    }
  }

  async killProcess(pid: number): Promise<{ success: boolean; message: string }> {
    try {
      const { spawn } = await import('child_process')
      
      // プロセスが存在するかチェック
      const processStatus = await this.getProcessStatus(pid)
      if (!processStatus.running) {
        return { success: false, message: `プロセス ${pid} は既に停止しています` }
      }

      return new Promise((resolve) => {
        // まずSIGTERMで穏やかに停止を試みる
        const killProcess = spawn('kill', ['-TERM', pid.toString()], { stdio: 'pipe' })
        
        killProcess.on('close', (code) => {
          if (code === 0) {
            // 停止確認のため2秒待つ
            setTimeout(async () => {
              const status = await this.getProcessStatus(pid)
              if (!status.running) {
                this.emit('log', { level: 'info', message: `プロセス ${pid} を正常に停止しました` })
                resolve({ success: true, message: `プロセス ${pid} を正常に停止しました` })
              } else {
                // SIGTERMで停止できない場合はSIGKILLを使用
                this.forceKillProcess(pid).then(resolve)
              }
            }, 2000)
          } else {
            // killコマンドが失敗した場合
            resolve({ success: false, message: `プロセス ${pid} の停止に失敗しました (exit code: ${code})` })
          }
        })
        
        killProcess.on('error', (error) => {
          this.emit('log', { level: 'error', message: `プロセス停止エラー: ${error.message}` })
          resolve({ success: false, message: `プロセス停止エラー: ${error.message}` })
        })
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      this.emit('log', { level: 'error', message: `プロセス停止エラー: ${errorMessage}` })
      return { success: false, message: `プロセス停止エラー: ${errorMessage}` }
    }
  }

  private async forceKillProcess(pid: number): Promise<{ success: boolean; message: string }> {
    try {
      const { spawn } = await import('child_process')
      
      return new Promise((resolve) => {
        const killProcess = spawn('kill', ['-KILL', pid.toString()], { stdio: 'pipe' })
        
        killProcess.on('close', (code) => {
          if (code === 0) {
            this.emit('log', { level: 'warn', message: `プロセス ${pid} を強制停止しました` })
            resolve({ success: true, message: `プロセス ${pid} を強制停止しました` })
          } else {
            resolve({ success: false, message: `プロセス ${pid} の強制停止に失敗しました` })
          }
        })
        
        killProcess.on('error', (error) => {
          resolve({ success: false, message: `強制停止エラー: ${error.message}` })
        })
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return { success: false, message: `強制停止エラー: ${errorMessage}` }
    }
  }

  async killAllExistingProcesses(): Promise<{ success: boolean; message: string; results: Array<{ pid: number; success: boolean; message: string }> }> {
    try {
      const { processes } = await this.checkExistingProcesses()
      
      if (processes.length === 0) {
        return { success: true, message: '停止対象のプロセスはありません', results: [] }
      }

      const results = await Promise.all(
        processes.map(async (process) => {
          const result = await this.killProcess(process.pid)
          return {
            pid: process.pid,
            success: result.success,
            message: result.message
          }
        })
      )

      const successCount = results.filter(r => r.success).length
      const failureCount = results.length - successCount

      let message = `${successCount}個のプロセスを停止しました`
      if (failureCount > 0) {
        message += `（${failureCount}個のプロセスの停止に失敗）`
      }

      this.emit('log', { level: 'info', message })

      return {
        success: failureCount === 0,
        message,
        results
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      this.emit('log', { level: 'error', message: `一括停止エラー: ${errorMessage}` })
      return { success: false, message: `一括停止エラー: ${errorMessage}`, results: [] }
    }
  }

  async startNetwork(config: { port?: string; nodeCount?: string }): Promise<{ success: boolean; message: string }> {
    if (this.suiProcess) {
      return { success: false, message: 'SUI ネットワークは既に実行中です' }
    }

    // 既存のSUIプロセスをチェック
    const existing = await this.detectExistingNetwork()
    if (existing.found) {
      this.emit('log', { level: 'warn', message: `既存のSUIプロセスが検出されました: ${existing.processes.length}個` })
    }

    await this.killExistingSuiProcesses()

    // SUIインストール確認
    const installation = await this.checkInstallation()
    if (!installation.installed) {
      return { success: false, message: 'SUI がインストールされていません。設定画面でSUIパスを確認してください。' }
    }

    this.suiPath = installation.path

    try {
      // SUI local network を起動
      const args = ['start', '--force-regenesis']
      
      if (config.port) {
        args.push('--fullnode-rpc-port', config.port)
      }

      this.emit('log', { level: 'info', message: `SUIを起動中: ${this.suiPath} ${args.join(' ')}` })

      this.suiProcess = spawn(this.suiPath, args, {
        stdio: 'pipe',
        env: { ...process.env },
      })

      this.setupProcessHandlers()

      // プロセス起動の確認を待つ
      await this.waitForNetworkStart(config)

      this.currentStatus = {
        running: true,
        nodeCount: parseInt(config.nodeCount || '4'),
        blockHeight: 0,
        transactions: 0,
        pid: this.suiProcess.pid,
      }

      this.emit('status-change', this.currentStatus)
      return { success: true, message: 'SUI ネットワークが正常に起動しました' }

    } catch (error) {
      this.suiProcess = null
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      this.emit('log', { level: 'error', message: `SUI起動エラー: ${errorMessage}` })
      return { success: false, message: `SUI ネットワークの起動に失敗しました: ${errorMessage}` }
    }
  }

  private async killExistingSuiProcesses(): Promise<void> {
    try {
      const { spawn } = await import('child_process')
      
      // macOS/Linuxでpkillを使用してSUIプロセスを停止
      const pkillProcess = spawn('pkill', ['-f', 'sui start'], { stdio: 'pipe' })
      
      return new Promise((resolve) => {
        pkillProcess.on('close', () => {
          // 少し待ってからプロセス終了を確認
          setTimeout(resolve, 1000)
        })
        
        pkillProcess.on('error', () => {
          // pkillコマンドが失敗しても続行
          resolve()
        })
      })
    } catch (error) {
      // エラーが発生しても続行
      this.emit('log', { level: 'warn', message: '既存のSUIプロセスの確認に失敗しました' })
    }
  }

  async stopNetwork(): Promise<{ success: boolean; message: string }> {
    if (!this.suiProcess) {
      return { success: false, message: 'SUI ネットワークは実行されていません' }
    }

    try {
      // プロセスを安全に終了
      this.suiProcess.kill('SIGTERM')

      // プロセス終了を待つ
      await new Promise<void>((resolve) => {
        if (this.suiProcess) {
          this.suiProcess.on('exit', () => resolve())
          // タイムアウト後は強制終了
          setTimeout(() => {
            if (this.suiProcess && !this.suiProcess.killed) {
              this.suiProcess.kill('SIGKILL')
            }
            resolve()
          }, 5000)
        } else {
          resolve()
        }
      })

      this.suiProcess = null
      this.currentStatus = {
        running: false,
        nodeCount: 0,
        blockHeight: 0,
        transactions: 0,
      }

      // 状態更新を停止
      this.stopStatusUpdates()

      this.emit('status-change', this.currentStatus)
      return { success: true, message: 'SUI ネットワークが正常に停止しました' }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return { success: false, message: `SUI ネットワークの停止に失敗しました: ${errorMessage}` }
    }
  }

  // リソースクリーンアップメソッドを追加
  cleanup(): void {
    if (this.suiProcess) {
      try {
        this.suiProcess.kill('SIGKILL')
      } catch (error) {
        // プロセスがすでに終了している場合は無視
      }
      this.suiProcess = null
    }
    
    // 状態更新を停止
    this.stopStatusUpdates()
    
    // イベントリスナーをクリア
    this.removeAllListeners()
    
    this.currentStatus = {
      running: false,
      nodeCount: 0,
      blockHeight: 0,
      transactions: 0,
    }
  }

  getStatus(): SuiStatus {
    return { ...this.currentStatus }
  }

  setSuiPath(path: string): void {
    this.suiPath = path
  }

  private startStatusUpdates(port: string = '9000'): void {
    // 既存のインターバルをクリア
    if (this.statusUpdateInterval) {
      clearInterval(this.statusUpdateInterval)
    }
    
    // 10秒間隔で状態更新
    this.statusUpdateInterval = setInterval(() => {
      if (this.currentStatus.running) {
        this.updateNetworkStatus(port)
      }
    }, 10000)
  }

  private stopStatusUpdates(): void {
    if (this.statusUpdateInterval) {
      clearInterval(this.statusUpdateInterval)
      this.statusUpdateInterval = null
    }
  }

  private async checkNetworkStatus(): Promise<{ ready: boolean; error?: string }> {
    try {
      const { spawn } = await import('child_process')
      
      return new Promise((resolve) => {
        // sui client active-address コマンドでネットワークの状態を確認
        const checkProcess = spawn(this.suiPath, ['client', 'active-address'], { 
          stdio: 'pipe',
          timeout: 5000 // 5秒でタイムアウト
        })
        
        let output = ''
        let errorOutput = ''
        
        checkProcess.stdout?.on('data', (data) => {
          output += data.toString()
        })
        
        checkProcess.stderr?.on('data', (data) => {
          errorOutput += data.toString()
        })
        
        checkProcess.on('close', (code) => {
          if (code === 0) {
            // 成功 - ネットワークが利用可能
            resolve({ ready: true })
          } else {
            // エラー - ネットワークがまだ利用できない
            resolve({ ready: false, error: errorOutput })
          }
        })
        
        checkProcess.on('error', (error) => {
          resolve({ ready: false, error: error.message })
        })
        
        // タイムアウト処理
        setTimeout(() => {
          if (!checkProcess.killed) {
            checkProcess.kill()
            resolve({ ready: false, error: 'Command timeout' })
          }
        }, 5000)
      })
    } catch (error) {
      return { ready: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }

  private async checkRPCEndpoint(port: string = '9000'): Promise<{ ready: boolean; error?: string }> {
    try {
      const { spawn } = await import('child_process')
      
      return new Promise((resolve) => {
        // curlでRPCエンドポイントの確認
        const checkProcess = spawn('curl', [
          '-X', 'POST',
          '-H', 'Content-Type: application/json',
          '-d', '{"jsonrpc":"2.0","method":"sui_getLatestSuiSystemState","params":[],"id":1}',
          `http://localhost:${port}`,
          '--connect-timeout', '3',
          '--max-time', '5',
          '--silent'
        ], { stdio: 'pipe' })
        
        let output = ''
        let errorOutput = ''
        
        checkProcess.stdout?.on('data', (data) => {
          output += data.toString()
        })
        
        checkProcess.stderr?.on('data', (data) => {
          errorOutput += data.toString()
        })
        
        checkProcess.on('close', (code) => {
          if (code === 0 && output.includes('jsonrpc')) {
            // RPCエンドポイントが応答している
            resolve({ ready: true })
          } else {
            resolve({ ready: false, error: errorOutput || 'No valid RPC response' })
          }
        })
        
        checkProcess.on('error', (error) => {
          resolve({ ready: false, error: error.message })
        })
      })
    } catch (error) {
      return { ready: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }

  private setupProcessHandlers(): void {
    if (!this.suiProcess) return

    this.suiProcess.stdout?.on('data', (data) => {
      const output = data.toString()
      // 各行を個別にログに記録
      const lines = output.split('\n').filter((line: string) => line.trim())
      lines.forEach((line: string) => {
        this.emit('log', { level: 'info', message: line.trim() })
      })
      this.parseNetworkOutput(output)
    })

    this.suiProcess.stderr?.on('data', (data) => {
      const output = data.toString()
      // エラー出力も各行を個別に処理
      const lines = output.split('\n').filter((line: string) => line.trim())
      lines.forEach((line: string) => {
        this.emit('log', { level: 'error', message: line.trim() })
      })
    })

    this.suiProcess.on('exit', (code, signal) => {
      this.emit('log', { 
        level: 'info', 
        message: `SUI process exited with code ${code}, signal ${signal}` 
      })
      
      this.suiProcess = null
      this.currentStatus = {
        running: false,
        nodeCount: 0,
        blockHeight: 0,
        transactions: 0,
      }
      
      // 状態更新を停止
      this.stopStatusUpdates()
      
      this.emit('status-change', this.currentStatus)
    })

    this.suiProcess.on('error', (error) => {
      this.emit('log', { level: 'error', message: `SUI process error: ${error.message}` })
    })
  }

  private async waitForNetworkStart(config: { port?: string }): Promise<void> {
    return new Promise((resolve, reject) => {
      let hasStartedGenesisCreation = false
      let checkingNetwork = false
      
      const onLog = (log: { level: string; message: string }) => {
        const message = log.message.toLowerCase()
        
        // Genesis作成の開始を検出
        if (message.includes('committee_size') || 
            message.includes('generating genesis') ||
            message.includes('creating genesis') ||
            message.includes('epoch duration') ||
            message.includes('loading genesis')) {
          hasStartedGenesisCreation = true
          this.emit('log', { level: 'info', message: 'Genesis作成を開始しました...' })
        }
        
        // ネットワーク起動の兆候を検出したらポーリング開始
        if (hasStartedGenesisCreation && !checkingNetwork && (
            message.includes('validators generated') ||
            message.includes('loaded genesis') ||
            message.includes('starting sui node') ||
            message.includes('initializing sui') ||
            message.includes('sui-node listening') ||
            message.includes('http rpc server') ||
            message.includes('rpc server listening') ||
            message.includes('json-rpc server') ||
            message.includes('listening on 0.0.0.0:') ||
            message.includes('listening on port') ||
            message.includes('server started') ||
            message.includes('fullnode started') ||
            message.includes('network started'))) {
          
          checkingNetwork = true
          this.emit('log', { level: 'info', message: 'ネットワーク起動確認を開始しています...' })
          
          // ポーリング開始
          this.startNetworkPolling(config, resolve, reject, onLog)
        }
        
        // 早期エラーパターンを検出
        if (message.includes('address already in use') ||
            message.includes('bind') && message.includes('error') ||
            message.includes('panic') ||
            message.includes('failed to start') ||
            message.includes('could not start')) {
          this.off('log', onLog)
          reject(new Error('ポートが既に使用されているか、起動エラーが発生しました。他のSUIプロセスを停止してください。'))
        }
      }

      this.on('log', onLog)
      
      // プロセスが早期に終了していないかチェック
      setTimeout(() => {
        if (this.suiProcess && this.suiProcess.exitCode !== null) {
          this.off('log', onLog)
          reject(new Error('SUIプロセスが予期せず終了しました'))
        }
      }, 5000)
    })
  }

  private async startNetworkPolling(
    config: { port?: string },
    resolve: () => void,
    reject: (error: Error) => void,
    onLog: (log: { level: string; message: string }) => void
  ): Promise<void> {
    const port = config.port || '9000'
    let attempts = 0
    
    const poll = async () => {
      attempts++
      
      // プロセスが終了していないかチェック
      if (!this.suiProcess || this.suiProcess.killed || this.suiProcess.exitCode !== null) {
        this.off('log', onLog)
        reject(new Error('SUIプロセスが予期せず終了しました'))
        return
      }
      
      this.emit('log', { level: 'info', message: `ネットワーク起動確認中... (試行回数: ${attempts})` })
      
      // 1. RPC endpoint の確認
      const rpcCheck = await this.checkRPCEndpoint(port)
      if (rpcCheck.ready) {
        // 2. SUI client コマンドでの確認
        const clientCheck = await this.checkNetworkStatus()
        if (clientCheck.ready) {
          this.off('log', onLog)
          this.emit('log', { level: 'info', message: 'SUIネットワークの起動が確認されました' })
          
          // ネットワーク状態を更新
          this.updateNetworkStatus(port)
          
          // 定期的な状態更新を開始
          this.startStatusUpdates(port)
          resolve()
          return
        }
        
        // RPCは応答するがクライアントコマンドが失敗する場合
        this.emit('log', { level: 'info', message: 'RPC接続確認済み、クライアント設定を確認中...' })
      } else {
        this.emit('log', { level: 'debug', message: `RPC確認失敗: ${rpcCheck.error}` })
      }
      
      // 3秒後に再試行（無限ループ、実際のネットワーク状態で判断）
      setTimeout(poll, 3000)
    }
    
    // 最初のポーリングを2秒後に開始（起動処理の時間を考慮）
    setTimeout(poll, 2000)
  }

  private parseNetworkOutput(output: string): void {
    // SUIネットワークの出力からメトリクスを抽出
    // 実際のSUIの出力形式に応じて調整が必要
    
    // ブロック高の更新を検出
    const blockMatch = output.match(/Block\s*#?(\d+)/i)
    if (blockMatch) {
      this.currentStatus.blockHeight = parseInt(blockMatch[1])
      this.emit('status-change', this.currentStatus)
    }

    // トランザクション数の更新を検出
    const txMatch = output.match(/transactions?\s*:\s*(\d+)/i)
    if (txMatch) {
      this.currentStatus.transactions = parseInt(txMatch[1])
      this.emit('status-change', this.currentStatus)
    }
  }
}