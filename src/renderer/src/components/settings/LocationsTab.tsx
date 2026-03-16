import { useEffect, useState } from 'react'
import { useLocationStore } from '../../store/location-store'
import { AddLocationDialog } from './AddLocationDialog'
import { PlusIcon, TrashIcon, ArrowPathIcon, SignalIcon, SignalSlashIcon } from '@heroicons/react/24/outline'
import { cn } from '../../lib/utils'
import type { Location } from '../../../../shared/remote-types'

const statusLabels: Record<string, { label: string; color: string }> = {
  connected: { label: 'Connected', color: 'text-green-500' },
  disconnected: { label: 'Disconnected', color: 'text-text-tertiary' },
  connecting: { label: 'Connecting...', color: 'text-amber-500' },
  error: { label: 'Error', color: 'text-red-500' }
}

function LocationCard({ location }: { location: Location }) {
  const removeLocation = useLocationStore((s) => s.removeLocation)
  const setLocationStatus = useLocationStore((s) => s.setLocationStatus)
  const isLocal = location.type === 'local'
  const statusInfo = statusLabels[location.status] || statusLabels.disconnected

  const handleConnect = async () => {
    if (location.status === 'connected') {
      // Disconnect OpenClaw + SSH
      try { await window.electronAPI.agentDisconnect(location.id) } catch { /* ok */ }
      await window.electronAPI.sshDisconnect(location.id)
      setLocationStatus(location.id, 'disconnected')
    } else {
      setLocationStatus(location.id, 'connecting')
      try {
        await window.electronAPI.sshConnect(location.id)
        setLocationStatus(location.id, 'connected')
        // Connect OpenClaw WebSocket for agents if location has openclawPort
        if (location.openclawPort && location.host) {
          try {
            await window.electronAPI.agentConnect(location.id)
            await window.electronAPI.agentList(location.id)
          } catch { /* OpenClaw not available — SSH still works */ }
        }
      } catch {
        setLocationStatus(location.id, 'error')
      }
    }
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-surface-100">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text-primary truncate">{location.name}</span>
          {isLocal && (
            <span className="text-[10px] font-medium text-text-tertiary bg-surface-200 rounded px-1.5 py-0.5">
              LOCAL
            </span>
          )}
        </div>
        {location.host && (
          <span className="text-xs text-text-tertiary">{location.username}@{location.host}:{location.port || 22}</span>
        )}
      </div>
      <span className={cn('text-xs font-medium', statusInfo.color)}>{statusInfo.label}</span>
      {!isLocal && (
        <div className="flex items-center gap-1">
          <button
            onClick={handleConnect}
            className="p-1.5 rounded-lg hover:bg-surface-200 text-text-tertiary hover:text-text-primary transition-colors"
            title={location.status === 'connected' ? 'Disconnect' : 'Connect'}
          >
            {location.status === 'connected' ? (
              <SignalSlashIcon className="w-4 h-4" />
            ) : location.status === 'connecting' ? (
              <ArrowPathIcon className="w-4 h-4 animate-spin" />
            ) : (
              <SignalIcon className="w-4 h-4" />
            )}
          </button>
          <button
            onClick={() => removeLocation(location.id)}
            className="p-1.5 rounded-lg hover:bg-surface-200 text-text-tertiary hover:text-red-400 transition-colors"
            title="Remove location"
          >
            <TrashIcon className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}

export function LocationsTab() {
  const locations = useLocationStore((s) => s.locations)
  const loaded = useLocationStore((s) => s.loaded)
  const loadLocations = useLocationStore((s) => s.loadLocations)
  const [showAddDialog, setShowAddDialog] = useState(false)

  useEffect(() => {
    if (!loaded) loadLocations()
  }, [loaded, loadLocations])

  return (
    <div>
      <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-widest mb-3">
        Locations
      </h3>
      <p className="text-xs text-text-tertiary mb-4">
        Manage local and remote machines for terminal sessions and agents.
      </p>

      <div className="space-y-2 mb-4">
        {locations.map((loc) => (
          <LocationCard key={loc.id} location={loc} />
        ))}
      </div>

      <button
        onClick={() => setShowAddDialog(true)}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-border-subtle text-sm text-text-secondary hover:text-text-primary hover:border-accent/40 transition-colors"
      >
        <PlusIcon className="w-4 h-4" />
        Add Location
      </button>

      {showAddDialog && <AddLocationDialog onClose={() => setShowAddDialog(false)} />}
    </div>
  )
}
