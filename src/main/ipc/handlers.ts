import { ipcMain, Notification, dialog } from 'electron'
import { SuiService } from '../services/SuiService'
import { ConfigService } from '../services/ConfigService'
import { LogService } from '../services/LogService'

export class IPCHandlers {
  private suiService: SuiService
  private configService: ConfigService
  private logService: LogService
  private mainWindow: Electron.BrowserWindow | null = null
  private isReady: boolean = false

  constructor(
    suiService: SuiService,
    configService: ConfigService,
    logService: LogService
  ) {
    this.suiService = suiService
    this.configService = configService
    this.logService = logService
    this.setupHandlers()
  }

  async initialize(): Promise<void> {
    await this.loadInitialSettings()
    this.isReady = true
  }

  private ensureReady(): void {
    if (!this.isReady) {
      throw new Error('IPC handlers not initialized. Call initialize() first.')
    }
  }

  private async loadInitialSettings(): Promise<void> {
    try {
      const settings = await this.configService.getSettings()
      
      // SUIパスの設定
      if (settings.suiPath) {
        this.suiService.setSuiPath(settings.suiPath)
      }
    } catch (error) {
      this.logService.logApp('error', `Failed to load initial settings: ${error}`)
    }
  }

  private setupHandlers(): void {
    // SUI関連のハンドラー
    ipcMain.handle('sui:start', async () => {
      try {
        this.ensureReady()
        const activeProfile = await this.configService.getActiveProfile()
        const config = activeProfile ? {
          port: activeProfile.port,
          nodeCount: activeProfile.nodeCount,
        } : {}

        const result = await this.suiService.startNetwork(config)
        
        if (result.success) {
          this.showNotification('SUI ネットワーク', 'ネットワークが正常に起動しました')
          this.logService.logApp('info', 'SUI network started successfully')
        } else {
          this.logService.logApp('error', `Failed to start SUI network: ${result.message}`)
        }

        return result
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        this.logService.logApp('error', `SUI start error: ${errorMessage}`)
        return { success: false, message: errorMessage }
      }
    })

    ipcMain.handle('sui:stop', async () => {
      try {
        const result = await this.suiService.stopNetwork()
        
        if (result.success) {
          this.showNotification('SUI ネットワーク', 'ネットワークが正常に停止しました')
          this.logService.logApp('info', 'SUI network stopped successfully')
        } else {
          this.logService.logApp('error', `Failed to stop SUI network: ${result.message}`)
        }

        return result
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        this.logService.logApp('error', `SUI stop error: ${errorMessage}`)
        return { success: false, message: errorMessage }
      }
    })

    ipcMain.handle('sui:getStatus', () => {
      return this.suiService.getStatus()
    })

    ipcMain.handle('sui:updateNetworkStatus', async (_, port) => {
      try {
        await this.suiService.updateNetworkStatus(port || '9000')
        return { success: true }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        this.logService.logApp('error', `Network status update error: ${errorMessage}`)
        return { success: false, message: errorMessage }
      }
    })

    ipcMain.handle('sui:checkInstallation', async () => {
      try {
        this.ensureReady()
        return await this.suiService.checkInstallation()
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        this.logService.logApp('error', `SUI installation check error: ${errorMessage}`)
        return {
          installed: false,
          version: '',
          path: '',
        }
      }
    })

    ipcMain.handle('sui:detectExistingNetwork', async () => {
      try {
        const result = await this.suiService.detectExistingNetwork()
        this.logService.logApp('info', `Existing network detection: ${result.found ? 'found' : 'not found'}`)
        return result
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        this.logService.logApp('error', `Existing network detection error: ${errorMessage}`)
        return { found: false, processes: [] }
      }
    })

    ipcMain.handle('sui:getProcessStatus', async (_, pid) => {
      try {
        return await this.suiService.getProcessStatus(pid)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        this.logService.logApp('error', `Process status check error: ${errorMessage}`)
        return { running: false }
      }
    })

    ipcMain.handle('sui:killProcess', async (_, pid) => {
      try {
        const result = await this.suiService.killProcess(pid)
        if (result.success) {
          this.logService.logApp('info', `Process ${pid} terminated successfully`)
        } else {
          this.logService.logApp('error', `Failed to terminate process ${pid}: ${result.message}`)
        }
        return result
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        this.logService.logApp('error', `Process termination error: ${errorMessage}`)
        return { success: false, message: errorMessage }
      }
    })

    ipcMain.handle('sui:killAllProcesses', async () => {
      try {
        const result = await this.suiService.killAllExistingProcesses()
        if (result.success) {
          this.logService.logApp('info', `All processes terminated: ${result.message}`)
        } else {
          this.logService.logApp('error', `Failed to terminate all processes: ${result.message}`)
        }
        return result
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        this.logService.logApp('error', `Bulk termination error: ${errorMessage}`)
        return { success: false, message: errorMessage, results: [] }
      }
    })

    ipcMain.handle('sui:verifyNetworkConnection', async (_, port) => {
      try {
        const result = await this.suiService.verifyNetworkConnection(port)
        this.logService.logApp('info', `Network verification: ${result.message}`)
        return result
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        this.logService.logApp('error', `Network verification error: ${errorMessage}`)
        return {
          connected: false,
          rpcReady: false,
          clientReady: false,
          message: errorMessage
        }
      }
    })

    ipcMain.handle('sui:syncWithExistingNetwork', async () => {
      try {
        const result = await this.suiService.syncWithExistingNetworkManually()
        if (result.success) {
          this.logService.logApp('info', `Network sync success: ${result.message}`)
        } else {
          this.logService.logApp('warn', `Network sync failed: ${result.message}`)
        }
        return result
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        this.logService.logApp('error', `Network sync error: ${errorMessage}`)
        return { success: false, message: errorMessage }
      }
    })

    // 設定関連のハンドラー
    ipcMain.handle('config:getProfiles', async () => {
      try {
        return await this.configService.getProfiles()
      } catch (error) {
        this.logService.logApp('error', `Failed to get profiles: ${error}`)
        return []
      }
    })

    ipcMain.handle('config:saveProfile', async (_, profile) => {
      try {
        const result = await this.configService.saveProfile(profile)
        if (result.success) {
          this.logService.logApp('info', `Profile saved: ${profile.name}`)
        }
        return result
      } catch (error) {
        this.logService.logApp('error', `Failed to save profile: ${error}`)
        return { success: false }
      }
    })

    ipcMain.handle('config:deleteProfile', async (_, profileId) => {
      try {
        const result = await this.configService.deleteProfile(profileId)
        if (result.success) {
          this.logService.logApp('info', `Profile deleted: ${profileId}`)
        }
        return result
      } catch (error) {
        this.logService.logApp('error', `Failed to delete profile: ${error}`)
        return { success: false }
      }
    })

    ipcMain.handle('config:getSettings', async () => {
      try {
        return await this.configService.getSettings()
      } catch (error) {
        this.logService.logApp('error', `Failed to get settings: ${error}`)
        return this.configService.getSettings() // デフォルト設定を返す
      }
    })

    ipcMain.handle('config:saveSettings', async (_, settings) => {
      try {
        this.ensureReady()
        const result = await this.configService.saveSettings(settings)
        if (result.success) {
          this.logService.logApp('info', 'Settings saved successfully')
          
          // SUIパスが変更された場合は更新
          if (settings.suiPath) {
            this.suiService.setSuiPath(settings.suiPath)
          }
        }
        return result
      } catch (error) {
        this.logService.logApp('error', `Failed to save settings: ${error}`)
        return { success: false }
      }
    })

    // ログ関連のハンドラー
    ipcMain.handle('logs:getLogs', (_, filter) => {
      return this.logService.getLogs(filter)
    })

    ipcMain.handle('logs:exportLogs', async (_, filePath) => {
      try {
        const result = await this.logService.exportLogs(filePath)
        if (result.success) {
          this.logService.logApp('info', `Logs exported to: ${result.path}`)
        }
        return result
      } catch (error) {
        this.logService.logApp('error', `Failed to export logs: ${error}`)
        return { success: false }
      }
    })

    ipcMain.handle('logs:clearLogs', () => {
      this.logService.clearLogs()
      this.logService.logApp('info', 'Logs cleared by user')
      return { success: true }
    })

    // システム関連のハンドラー
    ipcMain.handle('system:showNotification', (_, title, body) => {
      this.showNotification(title, body)
    })

    ipcMain.handle('system:getTheme', async () => {
      const settings = await this.configService.getSettings()
      return settings.theme
    })

    ipcMain.handle('system:setTheme', async (_, theme) => {
      const result = await this.configService.saveSettings({ theme })
      if (result.success) {
        this.logService.logApp('info', `Theme changed to: ${theme}`)
      }
      return result
    })

    // ファイル選択ダイアログ
    ipcMain.handle('system:selectFile', async (_, options) => {
      if (!this.mainWindow) {
        return { canceled: true, filePaths: [] }
      }

      try {
        const result = await dialog.showOpenDialog(this.mainWindow, {
          title: options?.title || 'ファイルを選択',
          defaultPath: options?.defaultPath || '/usr/local/bin',
          buttonLabel: options?.buttonLabel || '選択',
          filters: options?.filters || [
            { name: 'すべてのファイル', extensions: ['*'] },
            { name: '実行ファイル', extensions: [''] }
          ],
          properties: ['openFile', 'showHiddenFiles']
        })

        if (result.canceled || result.filePaths.length === 0) {
          return { canceled: true, filePath: null }
        }

        return { canceled: false, filePath: result.filePaths[0] }
      } catch (error) {
        this.logService.logApp('error', `File dialog error: ${error}`)
        return { canceled: true, filePath: null, error: error instanceof Error ? error.message : 'Unknown error' }
      }
    })

    // ディレクトリ選択ダイアログ
    ipcMain.handle('system:selectDirectory', async (_, options) => {
      if (!this.mainWindow) {
        return { canceled: true, filePaths: [] }
      }

      try {
        const result = await dialog.showOpenDialog(this.mainWindow, {
          title: options?.title || 'フォルダを選択',
          defaultPath: options?.defaultPath || process.env.HOME,
          buttonLabel: options?.buttonLabel || '選択',
          properties: ['openDirectory', 'showHiddenFiles']
        })

        if (result.canceled || result.filePaths.length === 0) {
          return { canceled: true, filePath: null }
        }

        return { canceled: false, filePath: result.filePaths[0] }
      } catch (error) {
        this.logService.logApp('error', `Directory dialog error: ${error}`)
        return { canceled: true, filePath: null, error: error instanceof Error ? error.message : 'Unknown error' }
      }
    })
  }

  setupServiceEvents(mainWindow: Electron.BrowserWindow): void {
    // メインウィンドウの参照を保存
    this.mainWindow = mainWindow
    // SUIサービスからのイベントをレンダラープロセスに転送
    this.suiService.on('status-change', (status) => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('sui:status-change', status)
      }
    })

    this.suiService.on('log', (log) => {
      this.logService.handleSuiLog(log)
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('sui:log', log)
      }
    })

    // ログサービスからのイベントをレンダラープロセスに転送
    this.logService.on('new-log', (log) => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('logs:new-log', log)
      }
    })

    this.logService.on('logs-cleared', () => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('logs:cleared')
      }
    })
  }

  // イベントリスナーをクリーンアップするメソッドを追加
  cleanup(): void {
    this.suiService.removeAllListeners('status-change')
    this.suiService.removeAllListeners('log')
    this.logService.removeAllListeners('new-log')
    this.logService.removeAllListeners('logs-cleared')
  }

  private showNotification(title: string, body: string): void {
    if (Notification.isSupported()) {
      new Notification({
        title,
        body,
        silent: false,
      }).show()
    }
  }
}