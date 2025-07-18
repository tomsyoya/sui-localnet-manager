import { app, BrowserWindow, Menu } from 'electron'
import path from 'path'
import { SuiService } from './services/SuiService'
import { ConfigService } from './services/ConfigService'
import { LogService } from './services/LogService'
import { IPCHandlers } from './ipc/handlers'

// macOSでのIMKエラーを軽減するためのコマンドライン引数
if (process.platform === 'darwin') {
  app.commandLine.appendSwitch('disable-features', 'VizDisplayCompositor')
  app.commandLine.appendSwitch('disable-dev-shm-usage')
  app.commandLine.appendSwitch('no-sandbox')
}

let mainWindow: BrowserWindow
let suiService: SuiService
let configService: ConfigService
let logService: LogService
let ipcHandlers: IPCHandlers

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      spellcheck: false, // スペルチェックを無効化してIMK問題を軽減
    },
    titleBarStyle: 'hiddenInset',
    show: false,
    acceptFirstMouse: true, // macOS固有の入力問題を軽減
  })

  const isDev = !app.isPackaged
  
  if (isDev) {
    mainWindow.loadURL('http://localhost:3000')
    // mainWindow.webContents.openDevTools() // 開発者ツールを自動で開かない
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.on('closed', () => {
    // イベントリスナーをクリーンアップ
    if (ipcHandlers) {
      ipcHandlers.cleanup()
    }
    mainWindow = null as any
  })

  // サービスを初期化
  await initializeServices()
}

app.whenReady().then(() => {
  createWindow()

  // macOS用のメニューを設定
  if (process.platform === 'darwin') {
    const template = [
      {
        label: app.getName(),
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideothers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' }
        ]
      },
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectall' }
        ]
      },
      {
        label: 'View',
        submenu: [
          { role: 'reload' },
          { role: 'forceReload' },
          { role: 'toggleDevTools' },
          { type: 'separator' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { type: 'separator' },
          { role: 'togglefullscreen' }
        ]
      },
      {
        label: 'Window',
        submenu: [
          { role: 'minimize' },
          { role: 'close' }
        ]
      }
    ]
    
    const menu = Menu.buildFromTemplate(template as any)
    Menu.setApplicationMenu(menu)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  // アプリ終了時のクリーンアップ
  if (ipcHandlers) {
    ipcHandlers.cleanup()
  }
  
  if (suiService) {
    suiService.stopNetwork()
  }
  
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  // アプリ終了前のクリーンアップ
  if (ipcHandlers) {
    ipcHandlers.cleanup()
  }
  
  if (suiService) {
    suiService.cleanup()
  }
})

async function initializeServices(): Promise<void> {
  try {
    // 設定サービスを初期化
    configService = new ConfigService()
    await configService.initialize()

    // ログサービスを初期化
    logService = new LogService(configService.getLogsDir())
    await logService.initialize()

    // SUIサービスを初期化
    suiService = new SuiService()
    
    // 保存されたSUIパスを設定
    const settings = await configService.getSettings()
    if (settings.suiPath) {
      suiService.setSuiPath(settings.suiPath)
    }

    // IPCハンドラーを初期化
    ipcHandlers = new IPCHandlers(suiService, configService, logService)
    ipcHandlers.setupServiceEvents(mainWindow)

    logService.logApp('info', 'Application services initialized successfully')

  } catch (error) {
    console.error('Failed to initialize services:', error)
    if (logService) {
      logService.logApp('error', `Failed to initialize services: ${error}`)
    }
  }
}