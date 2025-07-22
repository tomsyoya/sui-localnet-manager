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
    this.emit('log', { level: 'info', message: 'SUIインストール確認開始' })
    
    // 設定されたパスを最初に確認
    if (this.suiPath) {
      this.emit('log', { level: 'info', message: `設定済みパスを確認中: ${this.suiPath}` })
      try {
        await fs.access(this.suiPath)
        const version = await this.getSuiVersion(this.suiPath)
        this.emit('log', { level: 'info', message: `SUI確認完了 - パス: ${this.suiPath}, バージョン: ${version}` })
        return {
          installed: true,
          version,
          path: this.suiPath,
        }
      } catch (error) {
        this.emit('log', { level: 'warn', message: `設定パスでSUI実行ファイルが見つかりません: ${this.suiPath}` })
        // 設定されたパスが無効な場合は自動検出に進む
      }
    }

    const possiblePaths = [
      '/usr/local/bin/sui',
      '/opt/homebrew/bin/sui',
      '/usr/bin/sui',
      path.join(process.env.HOME || '', '.cargo/bin/sui'),
    ]

    this.emit('log', { level: 'info', message: '一般的なパスでSUIを検索中...' })
    
    for (const suiPath of possiblePaths) {
      this.emit('log', { level: 'info', message: `パス確認中: ${suiPath}` })
      try {
        await fs.access(suiPath)
        const version = await this.getSuiVersion(suiPath)
        this.suiPath = suiPath
        this.emit('log', { level: 'info', message: `SUI検出成功 - パス: ${suiPath}, バージョン: ${version}` })
        return {
          installed: true,
          version,
          path: suiPath,
        }
      } catch (error) {
        this.emit('log', { level: 'info', message: `パス無効: ${suiPath}` })
        // パスが存在しない場合は次を試す
        continue
      }
    }

    this.emit('log', { level: 'error', message: 'SUIインストールが見つかりません' })

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
    this.emit('log', { level: 'info', message: '既存SUIプロセス検索開始' })
    
    try {
      // Try platform-specific approach first (pgrep for Unix-like systems)
      this.emit('log', { level: 'info', message: 'pgrep方式でプロセス検索中...' })
      const processes = await this.findProcessesWithPgrep()
      if (processes.length > 0) {
        this.emit('log', { level: 'info', message: `pgrep方式で${processes.length}個のSUIプロセスを検出` })
        return { processes }
      }
      
      // Fallback to regex-based ps parsing if pgrep fails
      this.emit('log', { level: 'info', message: 'pgrep方式で検出されず、ps方式にフォールバック' })
      const psResult = await this.findProcessesWithPs()
      this.emit('log', { level: 'info', message: `ps方式で${psResult.processes.length}個のSUIプロセスを検出` })
      return psResult
    } catch (error) {
      this.emit('log', { level: 'error', message: `プロセス検出エラー: ${error instanceof Error ? error.message : 'Unknown error'}` })
      return { processes: [] }
    }
  }

  private async findProcessesWithPgrep(): Promise<Array<{ pid: number; command: string; port?: string }>> {
    const { spawn } = await import('child_process')
    
    try {
      // Use pgrep to find PIDs, then get full command lines
      const suiPatterns = ['sui start', 'sui-test-validator']
      const allProcesses: Array<{ pid: number; command: string; port?: string }> = []
      
      for (const pattern of suiPatterns) {
        const pids = await this.getPidsWithPgrep(pattern)
        
        for (const pid of pids) {
          const command = await this.getCommandForPid(pid)
          if (command) {
            const port = this.extractPortFromCommand(command)
            allProcesses.push({ pid, command, port })
          }
        }
      }
      
      return allProcesses
    } catch (error) {
      this.emit('log', { level: 'info', message: `pgrep方式でのプロセス検出に失敗: ${error instanceof Error ? error.message : 'Unknown error'}` })
      return []
    }
  }

  private async getPidsWithPgrep(pattern: string): Promise<number[]> {
    const { spawn } = await import('child_process')
    
    return new Promise((resolve, reject) => {
      const pgrepProcess = spawn('pgrep', ['-f', pattern], { stdio: 'pipe' })
      let output = ''
      
      pgrepProcess.stdout?.on('data', (data) => {
        output += data.toString()
      })
      
      pgrepProcess.on('close', (code) => {
        if (code === 0 && output.trim()) {
          const pids = output.trim().split('\n')
            .map(pid => parseInt(pid.trim()))
            .filter(pid => !isNaN(pid))
          resolve(pids)
        } else {
          resolve([])
        }
      })
      
      pgrepProcess.on('error', (error) => {
        reject(error)
      })
    })
  }

  private async getCommandForPid(pid: number): Promise<string | null> {
    const { spawn } = await import('child_process')
    
    return new Promise((resolve) => {
      const psProcess = spawn('ps', ['-p', pid.toString(), '-o', 'command='], { stdio: 'pipe' })
      let output = ''
      
      psProcess.stdout?.on('data', (data) => {
        output += data.toString()
      })
      
      psProcess.on('close', (code) => {
        if (code === 0 && output.trim()) {
          resolve(output.trim())
        } else {
          resolve(null)
        }
      })
      
      psProcess.on('error', () => {
        resolve(null)
      })
    })
  }

  private async findProcessesWithPs(): Promise<{ processes: Array<{ pid: number; command: string; port?: string }> }> {
    const { spawn } = await import('child_process')
    
    return new Promise((resolve) => {
      // Use ps with specific format to get PID and command
      const psProcess = spawn('ps', ['axo', 'pid,command'], { stdio: 'pipe' })
      let output = ''
      
      psProcess.stdout?.on('data', (data) => {
        output += data.toString()
      })
      
      psProcess.on('close', () => {
        const processes = this.parseProcessLines(output)
        resolve({ processes })
      })
      
      psProcess.on('error', () => {
        resolve({ processes: [] })
      })
    })
  }

  private parseProcessLines(output: string): Array<{ pid: number; command: string; port?: string }> {
    const lines = output.split('\n')
    const suiProcesses: Array<{ pid: number; command: string; port?: string }> = []
    
    for (const line of lines) {
      const trimmedLine = line.trim()
      if (!trimmedLine || trimmedLine.startsWith('PID')) {
        continue
      }
      
      // Use regex to extract PID and command more reliably
      const match = trimmedLine.match(/^(\d+)\s+(.+)$/)
      if (!match) {
        continue
      }
      
      const pid = parseInt(match[1])
      const command = match[2]
      
      // Check if this is a SUI process
      if ((command.includes('sui start') || command.includes('sui-test-validator')) && !isNaN(pid)) {
        const port = this.extractPortFromCommand(command)
        suiProcesses.push({ pid, command, port })
      }
    }
    
    return suiProcesses
  }

  private extractPortFromCommand(command: string): string | undefined {
    // Extract port number from command line arguments
    const portMatch = command.match(/--fullnode-rpc-port\s+(\d+)|--port\s+(\d+)|--rpc-port\s+(\d+)/)
    return portMatch ? (portMatch[1] || portMatch[2] || portMatch[3]) : undefined
  }

  async getProcessStatus(pid: number): Promise<{ running: boolean; details?: any }> {
    this.emit('log', { level: 'info', message: `PID ${pid}の状態を確認中...` })
    
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
            this.emit('log', { level: 'info', message: `PID ${pid}: プロセス実行中` })
            try {
              const result = this.parseProcessOutput(output)
              if (result) {
                this.emit('log', { level: 'info', message: `PID ${pid}: 詳細情報解析完了 (状態: ${result.state})` })
                resolve({ running: true, details: result })
              } else {
                this.emit('log', { level: 'warn', message: `PID ${pid}: 詳細情報解析失敗` })
                resolve({ running: false })
              }
            } catch (parseError) {
              this.emit('log', { level: 'error', message: `PID ${pid} プロセス出力解析エラー: ${parseError instanceof Error ? parseError.message : 'Unknown error'}` })
              resolve({ running: false })
            }
          } else {
            this.emit('log', { level: 'info', message: `PID ${pid}: プロセス停止中` })
            resolve({ running: false })
          }
        })
        
        psProcess.on('error', (error) => {
          this.emit('log', { level: 'error', message: `PID ${pid} psコマンドエラー: ${error.message}` })
          resolve({ running: false })
        })
      })
    } catch (error) {
      this.emit('log', { level: 'error', message: `PID ${pid} プロセス状態取得エラー: ${error instanceof Error ? error.message : 'Unknown error'}` })
      return { running: false }
    }
  }

  private parseProcessOutput(output: string): any | null {
    const lines = output.split('\n').filter(line => line.trim())
    
    if (lines.length < 2) {
      return null
    }

    const headerLine = lines[0].trim()
    const dataLine = lines[1].trim()

    // Parse header to get column positions and names
    const columns = this.parseHeaderColumns(headerLine)
    
    if (columns.length === 0) {
      throw new Error('Unable to parse ps header columns')
    }

    // Parse data line using column positions
    const values = this.parseDataLine(dataLine, columns)
    
    // Map values to expected structure
    return {
      pid: this.parseIntValue(values.PID),
      ppid: this.parseIntValue(values.PPID),
      state: values.STAT || values.STATE || 'Unknown',
      cpu: this.parseFloatValue(values['%CPU'] || values.PCPU),
      memory: this.parseFloatValue(values['%MEM'] || values.PMEM),
      time: values.TIME || 'Unknown',
      command: values.COMMAND || values.CMD || 'Unknown'
    }
  }

  private parseHeaderColumns(headerLine: string): Array<{ name: string; start: number; end: number }> {
    const columns: Array<{ name: string; start: number; end: number }> = []
    const headerParts = headerLine.split(/\s+/)
    let currentPos = 0

    for (let i = 0; i < headerParts.length; i++) {
      const columnName = headerParts[i]
      const start = headerLine.indexOf(columnName, currentPos)
      
      // For all columns except the last one, find the end by looking for the next column
      let end: number
      if (i < headerParts.length - 1) {
        const nextColumn = headerParts[i + 1]
        const nextStart = headerLine.indexOf(nextColumn, start + columnName.length)
        end = nextStart
      } else {
        // Last column extends to the end
        end = -1
      }

      columns.push({ name: columnName, start, end })
      currentPos = start + columnName.length
    }

    return columns
  }

  private parseDataLine(dataLine: string, columns: Array<{ name: string; start: number; end: number }>): Record<string, string> {
    const values: Record<string, string> = {}

    for (const column of columns) {
      let value: string
      if (column.end === -1) {
        // Last column - take everything from start to end
        value = dataLine.substring(column.start).trim()
      } else {
        // Extract value using start and end positions
        value = dataLine.substring(column.start, column.end).trim()
      }
      values[column.name] = value
    }

    return values
  }

  private parseIntValue(value: string | undefined): number {
    if (!value || value === 'Unknown') return 0
    const parsed = parseInt(value)
    return isNaN(parsed) ? 0 : parsed
  }

  private parseFloatValue(value: string | undefined): number {
    if (!value || value === 'Unknown') return 0.0
    const parsed = parseFloat(value)
    return isNaN(parsed) ? 0.0 : parsed
  }

  async detectExistingNetwork(autoSync: boolean = false): Promise<{ found: boolean; processes: Array<{ pid: number; command: string; port?: string; status?: any }> }> {
    this.emit('log', { level: 'info', message: `既存ネットワーク検出開始 (autoSync: ${autoSync})` })
    
    const { processes } = await this.checkExistingProcesses()
    
    if (processes.length === 0) {
      this.emit('log', { level: 'info', message: '既存SUIプロセスは見つかりませんでした' })
      return { found: false, processes: [] }
    }

    this.emit('log', { level: 'info', message: `${processes.length}個のSUIプロセスを検出、詳細情報を取得中...` })
    
    const processesWithStatus = await Promise.all(
      processes.map(async (process) => {
        this.emit('log', { level: 'info', message: `PID ${process.pid}の詳細情報を取得中...` })
        const status = await this.getProcessStatus(process.pid)
        return { ...process, status: status.details }
      })
    )

    this.emit('log', { level: 'info', message: `検出されたSUIプロセス: ${processes.length}個` })
    
    // 既存プロセスが見つかった場合、autoSyncがtrueの時のみネットワーク状態を更新
    if (processesWithStatus.length > 0 && autoSync) {
      this.emit('log', { level: 'info', message: '自動同期を実行中...' })
      await this.syncWithExistingNetwork(processesWithStatus)
    } else if (processesWithStatus.length > 0) {
      this.emit('log', { level: 'info', message: '既存プロセス検出済み（自動同期は無効）' })
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

  public async updateNetworkStatus(port: string = '9000'): Promise<void> {
    try {
      this.emit('log', { level: 'info', message: `updateNetworkStatus呼び出し (ポート:${port})` })
      
      // RPC経由でネットワーク情報を取得
      const networkInfo = await this.getNetworkInfo(port)
      
      this.emit('log', { level: 'info', message: `getNetworkInfo結果: ${JSON.stringify(networkInfo)}` })
      
      if (networkInfo.success) {
        // 現在の状態を更新
        this.currentStatus = {
          running: true,
          nodeCount: networkInfo.data.nodeCount || this.currentStatus.nodeCount,
          blockHeight: networkInfo.data.blockHeight || this.currentStatus.blockHeight,
          transactions: networkInfo.data.transactions || this.currentStatus.transactions,
          pid: this.suiProcess?.pid || this.currentStatus.pid,
        }
        
        this.emit('log', { level: 'info', message: `更新後のcurrentStatus: ${JSON.stringify(this.currentStatus)}` })
        
        // 状態変更を通知
        this.emit('status-change', this.currentStatus)
        this.emit('log', { level: 'info', message: 'ネットワーク状態を更新しました' })
      } else {
        this.emit('log', { level: 'warn', message: 'ネットワーク情報の取得に失敗しました' })
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
          '-d', '{"jsonrpc":"2.0","method":"suix_getLatestSuiSystemState","params":[],"id":1}',
          `http://localhost:${port}`,
          '--connect-timeout', '3',
          '--max-time', '10',
          '--silent'
        ], { stdio: 'pipe' })
        
        let output = ''
        
        curlProcess.stdout?.on('data', (data) => {
          output += data.toString()
        })
        
        console.log('curlProcess cloase start', output);
        curlProcess.on('close', (code) => {
          if (code === 0 && output.includes('jsonrpc')) {
            try {
              const response = JSON.parse(output)
              console.log('curlProcess response.result', response.result);
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
    this.emit('log', { level: 'info', message: `PID ${pid}の停止を開始...` })
    
    try {
      const { spawn } = await import('child_process')
      
      // プロセスが存在するかチェック
      this.emit('log', { level: 'info', message: `PID ${pid}の実行状態を確認中...` })
      const processStatus = await this.getProcessStatus(pid)
      if (!processStatus.running) {
        this.emit('log', { level: 'warn', message: `PID ${pid}は既に停止済みです` })
        return { success: false, message: `プロセス ${pid} は既に停止しています` }
      }

      this.emit('log', { level: 'info', message: `PID ${pid}にSIGTERMシグナルを送信中...` })
      
      return new Promise((resolve) => {
        // まずSIGTERMで穏やかに停止を試みる
        const killProcess = spawn('kill', ['-TERM', pid.toString()], { stdio: 'pipe' })
        
        killProcess.on('close', (code) => {
          this.emit('log', { level: 'info', message: `PID ${pid} kill-TERMコマンド終了コード: ${code}` })
          
          if (code === 0) {
            this.emit('log', { level: 'info', message: `PID ${pid}停止確認のため2秒待機中...` })
            // 停止確認のため2秒待つ
            setTimeout(async () => {
              const status = await this.getProcessStatus(pid)
              if (!status.running) {
                this.emit('log', { level: 'info', message: `PID ${pid}を正常に停止しました` })
                resolve({ success: true, message: `プロセス ${pid} を正常に停止しました` })
              } else {
                this.emit('log', { level: 'warn', message: `PID ${pid}はSIGTERMで停止できませんでした。強制停止を実行します` })
                // SIGTERMで停止できない場合はSIGKILLを使用
                this.forceKillProcess(pid).then(resolve)
              }
            }, 2000)
          } else {
            this.emit('log', { level: 'error', message: `PID ${pid} kill-TERMコマンドが失敗しました (exit code: ${code})` })
            // killコマンドが失敗した場合
            resolve({ success: false, message: `プロセス ${pid} の停止に失敗しました (exit code: ${code})` })
          }
        })
        
        killProcess.on('error', (error) => {
          this.emit('log', { level: 'error', message: `PID ${pid} killコマンドエラー: ${error.message}` })
          resolve({ success: false, message: `プロセス停止エラー: ${error.message}` })
        })
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      this.emit('log', { level: 'error', message: `PID ${pid} プロセス停止エラー: ${errorMessage}` })
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

  async startNetwork(
    config: { port?: string; nodeCount?: string }, 
    options: { throwOnExistingProcesses?: boolean } = {}
  ): Promise<{ success: boolean; message: string }> {
    this.emit('log', { level: 'info', message: 'SUIネットワーク起動処理を開始...' })
    
    if (this.suiProcess) {
      this.emit('log', { level: 'warn', message: 'SUIプロセスは既に実行中です' })
      return { success: false, message: 'SUI ネットワークは既に実行中です' }
    }

    // 既存のSUIプロセスをチェック
    this.emit('log', { level: 'info', message: '既存SUIプロセスの確認中...' })
    const existing = await this.detectExistingNetwork()
    if (existing.found) {
      const processMessage = `既存のSUIプロセスが検出されました: ${existing.processes.length}個`
      
      if (options.throwOnExistingProcesses) {
        this.emit('log', { level: 'error', message: processMessage })
        throw new Error(`Port conflict risk: ${processMessage}. Existing processes must be stopped before starting a new network.`)
      } else {
        this.emit('log', { level: 'warn', message: processMessage })
      }
    } else {
      this.emit('log', { level: 'info', message: '既存SUIプロセスは検出されませんでした' })
    }

    this.emit('log', { level: 'info', message: '既存SUIプロセスのクリーンアップ中...' })
    await this.killExistingSuiProcesses()

    // SUIインストール確認
    this.emit('log', { level: 'info', message: 'SUIインストール状況を確認中...' })
    const installation = await this.checkInstallation()
    if (!installation.installed) {
      this.emit('log', { level: 'error', message: 'SUIがインストールされていません' })
      return { success: false, message: 'SUI がインストールされていません。設定画面でSUIパスを確認してください。' }
    }

    this.suiPath = installation.path
    this.emit('log', { level: 'info', message: `SUI実行ファイル確認完了: ${this.suiPath}` })

    try {
      // SUI local network を起動
      const args = ['start', '--force-regenesis']
      
      if (config.port) {
        args.push('--fullnode-rpc-port', config.port)
        this.emit('log', { level: 'info', message: `カスタムRPCポート指定: ${config.port}` })
      }

      this.emit('log', { level: 'info', message: `SUIプロセス起動コマンド: ${this.suiPath} ${args.join(' ')}` })

      this.suiProcess = spawn(this.suiPath, args, {
        stdio: 'pipe',
        env: { ...process.env },
      })

      this.emit('log', { level: 'info', message: `SUIプロセス起動完了 (PID: ${this.suiProcess.pid})` })
      this.setupProcessHandlers()

      // プロセス起動の確認を待つ
      this.emit('log', { level: 'info', message: 'ネットワーク起動完了を待機中...' })
      await this.waitForNetworkStart(config)

      this.currentStatus = {
        running: true,
        nodeCount: parseInt(config.nodeCount || '4'),
        blockHeight: 0,
        transactions: 0,
        pid: this.suiProcess.pid,
      }

      this.emit('log', { level: 'info', message: `SUIネットワーク起動完了 (PID: ${this.suiProcess.pid}, ノード数: ${this.currentStatus.nodeCount})` })
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
    this.emit('log', { level: 'info', message: 'SUIネットワーク停止処理を開始...' })
    
    if (!this.suiProcess) {
      this.emit('log', { level: 'warn', message: 'SUIプロセスは実行されていません' })
      return { success: false, message: 'SUI ネットワークは実行されていません' }
    }

    const processId = this.suiProcess.pid
    this.emit('log', { level: 'info', message: `PID ${processId}にSIGTERMシグナルを送信中...` })
    
    try {
      // プロセスを安全に終了
      this.suiProcess.kill('SIGTERM')

      // プロセス終了を待つ
      await new Promise<void>((resolve) => {
        if (this.suiProcess) {
          this.suiProcess.on('exit', (code, signal) => {
            this.emit('log', { level: 'info', message: `SUIプロセス正常終了 (PID: ${processId}, code: ${code}, signal: ${signal})` })
            resolve()
          })
          
          // タイムアウト後は強制終了
          setTimeout(() => {
            if (this.suiProcess && !this.suiProcess.killed) {
              this.emit('log', { level: 'warn', message: `PID ${processId}のタイムアウト、強制終了実行中...` })
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
      this.emit('log', { level: 'info', message: '定期状態更新を停止中...' })
      this.stopStatusUpdates()

      this.emit('log', { level: 'info', message: 'SUIネットワーク停止完了' })
      this.emit('status-change', this.currentStatus)
      return { success: true, message: 'SUI ネットワークが正常に停止しました' }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      this.emit('log', { level: 'error', message: `SUI停止エラー: ${errorMessage}` })
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
    this.emit('log', { level: 'info', message: 'SUIクライアント接続確認開始' })
    
    try {
      const { spawn } = await import('child_process')
      
      return new Promise((resolve) => {
        // sui client active-address コマンドでネットワークの状態を確認
        this.emit('log', { level: 'info', message: `SUIクライアントコマンド実行: ${this.suiPath} client active-address` })
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
            this.emit('log', { level: 'info', message: 'SUIクライアント接続成功' })
            resolve({ ready: true })
          } else {
            this.emit('log', { level: 'info', message: `SUIクライアント接続失敗 (code: ${code}, error: ${errorOutput})` })
            resolve({ ready: false, error: errorOutput })
          }
        })
        
        checkProcess.on('error', (error) => {
          this.emit('log', { level: 'info', message: `SUIクライアントコマンドエラー: ${error.message}` })
          resolve({ ready: false, error: error.message })
        })
        
        // タイムアウト処理
        setTimeout(() => {
          if (!checkProcess.killed) {
            this.emit('log', { level: 'info', message: 'SUIクライアントコマンドタイムアウト' })
            checkProcess.kill()
            resolve({ ready: false, error: 'Command timeout' })
          }
        }, 5000)
      })
    } catch (error) {
      this.emit('log', { level: 'error', message: `SUIクライアント確認エラー: ${error instanceof Error ? error.message : 'Unknown error'}` })
      return { ready: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }

  private async checkRPCEndpoint(port: string = '9000'): Promise<{ ready: boolean; error?: string }> {
    this.emit('log', { level: 'info', message: `RPC接続確認開始 (ポート: ${port})` })
    
    try {
      const { spawn } = await import('child_process')
      
      return new Promise((resolve) => {
        // curlでRPCエンドポイントの確認
        this.emit('log', { level: 'info', message: `curlコマンドでRPC接続テスト中...` })
        const checkProcess = spawn('curl', [
          '-X', 'POST',
          '-H', 'Content-Type: application/json',
          '-d', '{"jsonrpc":"2.0","method":"suix_getLatestSuiSystemState","params":[],"id":1}',
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
            this.emit('log', { level: 'info', message: `RPC接続成功 (ポート: ${port})` })
            resolve({ ready: true })
          } else {
            this.emit('log', { level: 'info', message: `RPC接続失敗 (ポート: ${port}, code: ${code}, error: ${errorOutput})` })
            resolve({ ready: false, error: errorOutput || 'No valid RPC response' })
          }
        })
        
        checkProcess.on('error', (error) => {
          this.emit('log', { level: 'info', message: `RPC接続curlエラー: ${error.message}` })
          resolve({ ready: false, error: error.message })
        })
      })
    } catch (error) {
      this.emit('log', { level: 'error', message: `RPC接続確認エラー: ${error instanceof Error ? error.message : 'Unknown error'}` })
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
        this.emit('log', { level: 'info', message: `RPC確認失敗: ${rpcCheck.error}` })
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