import { EventEmitter } from 'events'
import path from 'path'
import fs from 'fs/promises'

export interface LogEntry {
  timestamp: string
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  source?: string
}

export class LogService extends EventEmitter {
  private logs: LogEntry[] = []
  private maxLogs: number = 1000
  private logFile: string

  constructor(logsDir: string) {
    super()
    this.logFile = path.join(logsDir, `sui-localnet-${new Date().toISOString().split('T')[0]}.log`)
  }

  async initialize(): Promise<void> {
    try {
      // 既存のログファイルを読み込み
      await this.loadExistingLogs()
    } catch (error) {
      // ログファイルが存在しない場合は新規作成
      console.log('Creating new log file:', this.logFile)
    }
  }

  addLog(entry: Omit<LogEntry, 'timestamp'>): void {
    const logEntry: LogEntry = {
      ...entry,
      timestamp: new Date().toISOString(),
    }

    this.logs.unshift(logEntry) // 新しいログを先頭に追加

    // メモリ内のログ数を制限
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(0, this.maxLogs)
    }

    // ログファイルに書き込み
    this.writeToFile(logEntry)

    // リアルタイム更新のためのイベント発信
    this.emit('new-log', logEntry)
  }

  getLogs(filter?: {
    level?: string
    search?: string
    limit?: number
  }): LogEntry[] {
    let filteredLogs = [...this.logs]

    // レベルフィルタ
    if (filter?.level && filter.level !== 'all') {
      filteredLogs = filteredLogs.filter(log => log.level === filter.level)
    }

    // 検索フィルタ
    if (filter?.search) {
      const searchTerm = filter.search.toLowerCase()
      filteredLogs = filteredLogs.filter(log => 
        log.message.toLowerCase().includes(searchTerm) ||
        log.source?.toLowerCase().includes(searchTerm)
      )
    }

    // 件数制限
    if (filter?.limit) {
      filteredLogs = filteredLogs.slice(0, filter.limit)
    }

    return filteredLogs
  }

  async exportLogs(filePath?: string): Promise<{ success: boolean; path?: string }> {
    try {
      const exportPath = filePath || path.join(
        process.env.HOME || '',
        'Desktop',
        `sui-localnet-logs-${Date.now()}.txt`
      )

      const logContent = this.logs
        .map(log => `[${log.timestamp}] [${log.level.toUpperCase()}] ${log.message}`)
        .join('\n')

      await fs.writeFile(exportPath, logContent)
      return { success: true, path: exportPath }
    } catch (error) {
      console.error('Failed to export logs:', error)
      return { success: false }
    }
  }

  clearLogs(): void {
    this.logs = []
    this.emit('logs-cleared')
  }

  private async loadExistingLogs(): Promise<void> {
    try {
      const content = await fs.readFile(this.logFile, 'utf-8')
      const lines = content.split('\n').filter(line => line.trim())

      this.logs = lines
        .map(line => this.parseLogLine(line))
        .filter((log): log is LogEntry => log !== null)
        .slice(-this.maxLogs) // 最新のログのみ保持
        .reverse() // 新しいものを先頭に

    } catch (error) {
      // ファイルが存在しない場合は空配列のまま
    }
  }

  private parseLogLine(line: string): LogEntry | null {
    try {
      // ログ形式: [timestamp] [LEVEL] message
      const match = line.match(/^\[(.+?)\] \[(.+?)\] (.+)$/)
      if (!match) return null

      const [, timestamp, level, message] = match
      return {
        timestamp,
        level: level.toLowerCase() as LogEntry['level'],
        message,
        source: 'file',
      }
    } catch {
      return null
    }
  }

  private async writeToFile(entry: LogEntry): Promise<void> {
    try {
      const logLine = `[${entry.timestamp}] [${entry.level.toUpperCase()}] ${entry.message}\n`
      await fs.appendFile(this.logFile, logLine)
    } catch (error) {
      console.error('Failed to write log to file:', error)
    }
  }

  // SUIサービスからのログを受信
  handleSuiLog(data: { level: string; message: string }): void {
    this.addLog({
      level: data.level as LogEntry['level'],
      message: data.message,
      source: 'sui',
    })
  }

  // アプリケーションログを追加
  logApp(level: LogEntry['level'], message: string): void {
    this.addLog({
      level,
      message,
      source: 'app',
    })
  }
}