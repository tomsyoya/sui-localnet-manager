import { app } from 'electron'
import path from 'path'
import fs from 'fs/promises'

export interface Profile {
  id: string
  name: string
  port: string
  nodeCount: string
  initialBalance: string
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'system'
  notifications: boolean
  autoUpdate: boolean
  suiPath: string
  activeProfileId: string
}

export class ConfigService {
  private configDir: string
  private profilesDir: string
  private settingsFile: string

  constructor() {
    this.configDir = path.join(app.getPath('userData'), 'config')
    this.profilesDir = path.join(this.configDir, 'profiles')
    this.settingsFile = path.join(this.configDir, 'app-settings.json')
  }

  async initialize(): Promise<void> {
    try {
      // 設定ディレクトリを作成
      await fs.mkdir(this.configDir, { recursive: true })
      await fs.mkdir(this.profilesDir, { recursive: true })
      await fs.mkdir(path.join(this.configDir, 'sui-config'), { recursive: true })
      await fs.mkdir(path.join(app.getPath('userData'), 'logs'), { recursive: true })
      await fs.mkdir(path.join(app.getPath('userData'), 'cache'), { recursive: true })

      // デフォルト設定ファイルが存在しない場合は作成
      await this.ensureDefaultSettings()
      await this.ensureDefaultProfile()

    } catch (error) {
      console.error('Failed to initialize config service:', error)
      throw error
    }
  }

  async getProfiles(): Promise<Profile[]> {
    try {
      const files = await fs.readdir(this.profilesDir)
      const profiles: Profile[] = []

      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const filePath = path.join(this.profilesDir, file)
            const content = await fs.readFile(filePath, 'utf-8')
            const profile = JSON.parse(content) as Profile
            profiles.push(profile)
          } catch (error) {
            console.error(`Failed to load profile ${file}:`, error)
          }
        }
      }

      // 作成日時でソート
      return profiles.sort((a, b) => 
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      )
    } catch (error) {
      console.error('Failed to get profiles:', error)
      return []
    }
  }

  async saveProfile(profile: Omit<Profile, 'createdAt' | 'updatedAt'>): Promise<{ success: boolean }> {
    try {
      const now = new Date().toISOString()
      const existingProfiles = await this.getProfiles()
      const existingProfile = existingProfiles.find(p => p.id === profile.id)

      const fullProfile: Profile = {
        ...profile,
        createdAt: existingProfile?.createdAt || now,
        updatedAt: now,
      }

      // プロファイルがアクティブに設定された場合、他のプロファイルを非アクティブにする
      if (profile.active) {
        await this.deactivateAllProfiles()
        await this.updateActiveProfile(profile.id)
      }

      const filePath = path.join(this.profilesDir, `${profile.id}.json`)
      await fs.writeFile(filePath, JSON.stringify(fullProfile, null, 2))

      return { success: true }
    } catch (error) {
      console.error('Failed to save profile:', error)
      return { success: false }
    }
  }

  async deleteProfile(profileId: string): Promise<{ success: boolean }> {
    try {
      const filePath = path.join(this.profilesDir, `${profileId}.json`)
      await fs.unlink(filePath)

      // 削除されたプロファイルがアクティブだった場合、デフォルトプロファイルをアクティブにする
      const settings = await this.getSettings()
      if (settings.activeProfileId === profileId) {
        const profiles = await this.getProfiles()
        const defaultProfile = profiles.find(p => p.id === 'default')
        if (defaultProfile) {
          await this.updateActiveProfile('default')
        }
      }

      return { success: true }
    } catch (error) {
      console.error('Failed to delete profile:', error)
      return { success: false }
    }
  }

  async getActiveProfile(): Promise<Profile | null> {
    try {
      const settings = await this.getSettings()
      const profiles = await this.getProfiles()
      return profiles.find(p => p.id === settings.activeProfileId) || null
    } catch (error) {
      console.error('Failed to get active profile:', error)
      return null
    }
  }

  async getSettings(): Promise<AppSettings> {
    try {
      const content = await fs.readFile(this.settingsFile, 'utf-8')
      return JSON.parse(content) as AppSettings
    } catch (error) {
      // ファイルが存在しない場合はデフォルト設定を返す
      return this.getDefaultSettings()
    }
  }

  async saveSettings(settings: Partial<AppSettings>): Promise<{ success: boolean }> {
    try {
      const currentSettings = await this.getSettings()
      const newSettings = { ...currentSettings, ...settings }
      
      await fs.writeFile(this.settingsFile, JSON.stringify(newSettings, null, 2))
      return { success: true }
    } catch (error) {
      console.error('Failed to save settings:', error)
      return { success: false }
    }
  }

  private async ensureDefaultSettings(): Promise<void> {
    try {
      await fs.access(this.settingsFile)
    } catch {
      // ファイルが存在しない場合は作成
      const defaultSettings = this.getDefaultSettings()
      await fs.writeFile(this.settingsFile, JSON.stringify(defaultSettings, null, 2))
    }
  }

  private async ensureDefaultProfile(): Promise<void> {
    const defaultProfilePath = path.join(this.profilesDir, 'default.json')
    
    try {
      await fs.access(defaultProfilePath)
    } catch {
      // デフォルトプロファイルが存在しない場合は作成
      const defaultProfile: Profile = {
        id: 'default',
        name: 'Default',
        port: '9000',
        nodeCount: '4',
        initialBalance: '1000000',
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      
      await fs.writeFile(defaultProfilePath, JSON.stringify(defaultProfile, null, 2))
    }
  }

  private getDefaultSettings(): AppSettings {
    return {
      theme: 'system',
      notifications: true,
      autoUpdate: true,
      suiPath: '',
      activeProfileId: 'default',
    }
  }

  private async deactivateAllProfiles(): Promise<void> {
    const profiles = await this.getProfiles()
    
    for (const profile of profiles) {
      if (profile.active) {
        const updatedProfile = { ...profile, active: false }
        const filePath = path.join(this.profilesDir, `${profile.id}.json`)
        await fs.writeFile(filePath, JSON.stringify(updatedProfile, null, 2))
      }
    }
  }

  private async updateActiveProfile(profileId: string): Promise<void> {
    await this.saveSettings({ activeProfileId: profileId })
  }

  getConfigDir(): string {
    return this.configDir
  }

  getLogsDir(): string {
    return path.join(app.getPath('userData'), 'logs')
  }
}