import { contextBridge, ipcRenderer } from 'electron'

// IPC通信用のAPIを定義
const electronAPI = {
  // SUI関連の操作
  sui: {
    start: () => ipcRenderer.invoke('sui:start'),
    stop: () => ipcRenderer.invoke('sui:stop'),
    getStatus: () => ipcRenderer.invoke('sui:getStatus'),
    checkInstallation: () => ipcRenderer.invoke('sui:checkInstallation'),
    detectExistingNetwork: () => ipcRenderer.invoke('sui:detectExistingNetwork'),
    getProcessStatus: (pid: number) => ipcRenderer.invoke('sui:getProcessStatus', pid),
    killProcess: (pid: number) => ipcRenderer.invoke('sui:killProcess', pid),
    killAllProcesses: () => ipcRenderer.invoke('sui:killAllProcesses'),
    verifyNetworkConnection: (port?: string) => ipcRenderer.invoke('sui:verifyNetworkConnection', port),
    syncWithExistingNetwork: () => ipcRenderer.invoke('sui:syncWithExistingNetwork'),
    
    // イベントリスナー
    onStatusChange: (callback: (status: any) => void) => {
      ipcRenderer.on('sui:status-change', (_, status) => callback(status))
    },
    onLog: (callback: (log: any) => void) => {
      ipcRenderer.on('sui:log', (_, log) => callback(log))
    },
    removeAllListeners: () => {
      ipcRenderer.removeAllListeners('sui:status-change')
      ipcRenderer.removeAllListeners('sui:log')
    }
  },
  
  // 設定管理
  config: {
    getProfiles: () => ipcRenderer.invoke('config:getProfiles'),
    saveProfile: (profile: any) => ipcRenderer.invoke('config:saveProfile', profile),
    deleteProfile: (id: string) => ipcRenderer.invoke('config:deleteProfile', id),
    getSettings: () => ipcRenderer.invoke('config:getSettings'),
    saveSettings: (settings: any) => ipcRenderer.invoke('config:saveSettings', settings),
  },

  // ログ管理
  logs: {
    getLogs: (filter?: any) => ipcRenderer.invoke('logs:getLogs', filter),
    exportLogs: (filePath?: string) => ipcRenderer.invoke('logs:exportLogs', filePath),
    clearLogs: () => ipcRenderer.invoke('logs:clearLogs'),
    
    // イベントリスナー
    onNewLog: (callback: (log: any) => void) => {
      ipcRenderer.on('logs:new-log', (_, log) => callback(log))
    },
    onLogsCleared: (callback: () => void) => {
      ipcRenderer.on('logs:cleared', () => callback())
    },
    removeAllListeners: () => {
      ipcRenderer.removeAllListeners('logs:new-log')
      ipcRenderer.removeAllListeners('logs:cleared')
    }
  },

  // システム関連
  system: {
    showNotification: (title: string, body: string) => 
      ipcRenderer.invoke('system:showNotification', title, body),
    getTheme: () => ipcRenderer.invoke('system:getTheme'),
    setTheme: (theme: 'light' | 'dark' | 'system') => 
      ipcRenderer.invoke('system:setTheme', theme),
    selectFile: (options?: any) => ipcRenderer.invoke('system:selectFile', options),
    selectDirectory: (options?: any) => ipcRenderer.invoke('system:selectDirectory', options),
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

export type ElectronAPI = typeof electronAPI