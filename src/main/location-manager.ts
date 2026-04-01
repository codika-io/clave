import * as fs from 'fs'
import * as path from 'path'
import { app, safeStorage } from 'electron'
import { randomUUID } from 'crypto'
import type { Location, LocationStatus, SSHConnectionConfig } from '../shared/remote-types'

interface EncryptedCredentials {
  password?: string // base64-encoded encrypted string
}

type CredentialsStore = Record<string, EncryptedCredentials>

const LOCAL_LOCATION: Location = {
  id: 'local',
  name: process.platform === 'darwin' ? 'This Mac' : 'This PC',
  type: 'local',
  status: 'connected'
}

class LocationManager {
  private locationsPath: string
  private credentialsPath: string

  constructor() {
    this.locationsPath = path.join(app.getPath('userData'), 'locations.json')
    this.credentialsPath = path.join(app.getPath('userData'), 'locations-credentials.json')
  }

  getLocations(): Location[] {
    try {
      const raw = fs.readFileSync(this.locationsPath, 'utf-8')
      const locations = JSON.parse(raw) as Location[]
      return [LOCAL_LOCATION, ...locations.filter((l) => l.id !== 'local')]
    } catch {
      return [LOCAL_LOCATION]
    }
  }

  addLocation(loc: Omit<Location, 'id' | 'status'>, password?: string): Location {
    const locations = this.getLocations().filter((l) => l.id !== 'local')
    const newLocation: Location = {
      ...loc,
      id: randomUUID(),
      status: 'disconnected'
    }
    locations.push(newLocation)
    this.saveLocations(locations)

    if (password) {
      const credentials = this.loadCredentials()
      const encrypted = safeStorage.encryptString(password)
      credentials[newLocation.id] = { password: encrypted.toString('base64') }
      this.saveCredentials(credentials)
    }

    return newLocation
  }

  updateLocation(id: string, updates: Partial<Location>): Location {
    if (id === 'local') {
      throw new Error('Cannot update the local location')
    }

    const locations = this.getLocations().filter((l) => l.id !== 'local')
    const index = locations.findIndex((l) => l.id === id)
    if (index === -1) {
      throw new Error(`Location not found: ${id}`)
    }

    locations[index] = { ...locations[index], ...updates, id }
    this.saveLocations(locations)
    return locations[index]
  }

  removeLocation(id: string): void {
    if (id === 'local') {
      throw new Error('Cannot remove the local location')
    }

    const locations = this.getLocations().filter((l) => l.id !== 'local')
    const filtered = locations.filter((l) => l.id !== id)
    this.saveLocations(filtered)

    const credentials = this.loadCredentials()
    delete credentials[id]
    this.saveCredentials(credentials)
  }

  getCredentials(id: string): SSHConnectionConfig | null {
    const locations = this.getLocations()
    const location = locations.find((l) => l.id === id)
    if (!location || location.type === 'local') {
      return null
    }

    const credentials = this.loadCredentials()
    const cred = credentials[id]

    const config: SSHConnectionConfig = {
      host: location.host ?? '',
      port: location.port ?? 22,
      username: location.username ?? '',
      authMethod: location.authMethod ?? 'key'
    }

    if (cred?.password) {
      try {
        const decrypted = safeStorage.decryptString(Buffer.from(cred.password, 'base64'))
        config.password = decrypted
      } catch {
        // Password decryption failed, return config without password
      }
    }

    return config
  }

  setLocationStatus(id: string, status: LocationStatus): void {
    if (id === 'local') return

    const locations = this.getLocations().filter((l) => l.id !== 'local')
    const index = locations.findIndex((l) => l.id === id)
    if (index === -1) return

    locations[index].status = status
    this.saveLocations(locations)
  }

  private saveLocations(locations: Location[]): void {
    fs.writeFileSync(this.locationsPath, JSON.stringify(locations, null, 2), 'utf-8')
  }

  private loadCredentials(): CredentialsStore {
    try {
      const raw = fs.readFileSync(this.credentialsPath, 'utf-8')
      return JSON.parse(raw) as CredentialsStore
    } catch {
      return {}
    }
  }

  private saveCredentials(credentials: CredentialsStore): void {
    fs.writeFileSync(this.credentialsPath, JSON.stringify(credentials, null, 2), 'utf-8')
  }
}

export const locationManager = new LocationManager()
