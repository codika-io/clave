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

export const useUpdaterStore = create<UpdaterState>((set) => ({
  phase: 'idle',
  version: null,
  progress: initialProgress,
  errorMessage: null,
  dismissed: false,

  setAvailable: (version) => set({ phase: 'available', version, dismissed: false }),
  setDownloading: () => set({ phase: 'downloading', progress: initialProgress, errorMessage: null }),
  setProgress: (progress) => set({ progress }),
  setDownloaded: () => set({ phase: 'downloaded' }),
  setError: (message) => set({ phase: 'error', errorMessage: message }),
  dismiss: () => set({ dismissed: true }),
  undismiss: () => set({ dismissed: false }),
  reset: () => set({ phase: 'available', progress: initialProgress, errorMessage: null })
}))
