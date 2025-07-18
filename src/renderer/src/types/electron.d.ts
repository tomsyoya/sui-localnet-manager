export interface ElectronAPI {
  sui: {
    start: () => Promise<{ success: boolean; message: string }>
    stop: () => Promise<{ success: boolean; message: string }>
    getStatus: () => Promise<{
      running: boolean
      nodeCount: number
      blockHeight: number
      transactions: number
    }>
    checkInstallation: () => Promise<{
      installed: boolean
      version: string
      path: string
    }>
  }
  
  config: {
    getProfiles: () => Promise<Array<{
      id: string
      name: string
      active: boolean
    }>>
    saveProfile: (profile: any) => Promise<{ success: boolean }>
    deleteProfile: (id: string) => Promise<{ success: boolean }>
  }

  logs: {
    getLogs: () => Promise<Array<{
      timestamp: string
      level: string
      message: string
    }>>
    exportLogs: () => Promise<{ success: boolean; path?: string }>
  }

  system: {
    showNotification: (title: string, body: string) => Promise<void>
    getTheme: () => Promise<string>
    setTheme: (theme: 'light' | 'dark' | 'system') => Promise<void>
    selectFile: (options?: {
      title?: string
      defaultPath?: string
      buttonLabel?: string
      filters?: Array<{ name: string; extensions: string[] }>
    }) => Promise<{ canceled: boolean; filePath: string | null; error?: string }>
    selectDirectory: (options?: {
      title?: string
      defaultPath?: string
      buttonLabel?: string
    }) => Promise<{ canceled: boolean; filePath: string | null; error?: string }>
  }
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}