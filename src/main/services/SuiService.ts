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

  async startNetwork(config: { port?: string; nodeCount?: string }): Promise<{ success: boolean; message: string }> {
    if (this.suiProcess) {
      return { success: false, message: 'SUI ネットワークは既に実行中です' }
    }

    // 既存のSUIプロセスをチェック
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
      await this.waitForNetworkStart()

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
      this.emit('status-change', this.currentStatus)
    })

    this.suiProcess.on('error', (error) => {
      this.emit('log', { level: 'error', message: `SUI process error: ${error.message}` })
    })
  }

  private async waitForNetworkStart(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('ネットワーク起動がタイムアウトしました'))
      }, 120000) // 120秒でタイムアウト（genesis生成時間を考慮）

      let hasStartedGenesisCreation = false
      let hasSeenNetworkStartup = false
      
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
        
        // ネットワーク起動の中間段階を検出
        if (message.includes('validators generated') ||
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
            message.includes('network started')) {
          hasSeenNetworkStartup = true
        }
        
        // SUIネットワークの起動成功を示すログパターンを探す
        // より寛容なパターンマッチングを使用
        if (hasStartedGenesisCreation && (
            hasSeenNetworkStartup ||
            message.includes('listening') && message.includes('0.0.0.0') ||
            message.includes('server') && message.includes('listening') ||
            message.includes('rpc') && message.includes('listening') ||
            message.includes('sui') && message.includes('started') ||
            message.includes('network') && message.includes('running') ||
            message.includes('fullnode') && message.includes('ready'))) {
          
          // 追加の確認として2秒待つ
          setTimeout(() => {
            if (this.suiProcess && this.suiProcess.pid && !this.suiProcess.killed) {
              clearTimeout(timeout)
              this.off('log', onLog)
              this.emit('log', { level: 'info', message: 'SUIネットワークの起動が完了しました' })
              resolve()
            }
          }, 2000)
          return
        }
        
        // プロセスが10秒以上生きており、genesis作成が始まっていれば成功とみなす
        // （一部のSUIバージョンでは明確な完了メッセージがない可能性があるため）
        if (hasStartedGenesisCreation) {
          setTimeout(() => {
            if (this.suiProcess && this.suiProcess.pid && !this.suiProcess.killed && this.suiProcess.exitCode === null) {
              clearTimeout(timeout)
              this.off('log', onLog)
              this.emit('log', { level: 'info', message: 'SUIプロセスが安定して実行中です' })
              resolve()
            }
          }, 15000) // 15秒後にプロセスの状態をチェック
        }
        
        // エラーパターンを検出
        if (message.includes('address already in use') ||
            message.includes('bind') && message.includes('error') ||
            message.includes('panic') ||
            message.includes('failed to start') ||
            message.includes('could not start')) {
          clearTimeout(timeout)
          this.off('log', onLog)
          reject(new Error('ポートが既に使用されているか、起動エラーが発生しました。他のSUIプロセスを停止してください。'))
        }
      }

      this.on('log', onLog)
      
      // 5秒後にプロセスが生きているかチェック
      setTimeout(() => {
        if (this.suiProcess && this.suiProcess.exitCode !== null) {
          clearTimeout(timeout)
          this.off('log', onLog)
          reject(new Error('SUIプロセスが予期せず終了しました'))
        }
      }, 5000)
    })
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