import { create } from 'zustand'

export type UpdatePhase = 'idle' | 'available' | 'downloading' | 'downloaded' | 'error'

export interface DownloadProgress {
  percent: number
  bytesPerSecond: number
  transferred: number
  total: number
}

interface UpdaterState {
  phase: UpdatePhase
  version: string | null
  progress: DownloadProgress
  errorMessage: string | null
  dismissed: boolean

  setAvailable: (version: string) => void
  setDownloading: () => void
  setProgress: (progress: DownloadProgress) => void
  setDownloaded: () => void
  setError: (message: string) => void
  dismiss: () => void
  undismiss: () => void
  reset: () => void
}

const initialProgress: DownloadProgress = {
  percent: 0,
  bytesPerSecond: 0,
  transferred: 0,
  total: 0
}

function getDismissedVersion(): string | null {
  try {
    return localStorage.getItem('update-dismissed-version')
  } catch {
    return null
  }
}

function setDismissedVersion(version: string | null): void {
  try {
    if (version) {
      localStorage.setItem('update-dismissed-version', version)
    } else {
      localStorage.removeItem('update-dismissed-version')
    }
  } catch {
    // ignore
  }
}

export const useUpdaterStore = create<UpdaterState>((set) => ({
  phase: 'idle',
  version: null,
  progress: initialProgress,
  errorMessage: null,
  dismissed: false,

  setAvailable: (version) =>
    set({
      phase: 'available',
      version,
      dismissed: getDismissedVersion() === version
    }),
  setDownloading: () => {
    setDismissedVersion(null)
    set({ phase: 'downloading', progress: initialProgress, errorMessage: null, dismissed: false })
  },
  setProgress: (progress) => set({ progress }),
  setDownloaded: () => set({ phase: 'downloaded' }),
  setError: (message) => set({ phase: 'error', errorMessage: message }),
  dismiss: () =>
    set((state) => {
      if (state.version) setDismissedVersion(state.version)
      return { dismissed: true }
    }),
  undismiss: () => {
    setDismissedVersion(null)
    set({ dismissed: false })
  },
  reset: () => set({ phase: 'available', progress: initialProgress, errorMessage: null })
}))
