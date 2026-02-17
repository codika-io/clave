import { useSessionStore, type Theme } from '../../store/session-store'

const themes: { id: Theme; label: string; colors: { bg: string; surface: string; text: string; border: string } }[] = [
  {
    id: 'dark',
    label: 'Dark',
    colors: { bg: '#0a0a0a', surface: '#1a1a1a', text: 'rgba(255,255,255,0.9)', border: 'rgba(255,255,255,0.1)' }
  },
  {
    id: 'light',
    label: 'Light',
    colors: { bg: '#f9f9f9', surface: '#e6e6e6', text: 'rgba(0,0,0,0.85)', border: 'rgba(0,0,0,0.12)' }
  },
  {
    id: 'coffee',
    label: 'Coffee',
    colors: { bg: '#eeebe5', surface: '#ddd9d1', text: '#1b1610', border: 'rgba(120,100,80,0.15)' }
  }
]

export function SettingsPanel() {
  const theme = useSessionStore((s) => s.theme)
  const setTheme = useSessionStore((s) => s.setTheme)

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="max-w-xl">
        <h2 className="text-lg font-semibold text-text-primary mb-6">Settings</h2>

        <section>
          <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-widest mb-3">
            Appearance
          </h3>
          <div className="flex gap-3">
            {themes.map((t) => (
              <button
                key={t.id}
                onClick={() => setTheme(t.id)}
                className="flex-1 rounded-xl p-1 transition-all duration-200"
                style={{
                  boxShadow: theme === t.id
                    ? '0 0 0 2px var(--color-accent)'
                    : '0 0 0 1px var(--border-color)',
                  background: 'var(--surface-100)'
                }}
              >
                {/* Mini preview */}
                <div
                  className="rounded-lg p-3 mb-2"
                  style={{ background: t.colors.bg, border: `1px solid ${t.colors.border}` }}
                >
                  <div
                    className="h-1.5 w-10 rounded-full mb-2"
                    style={{ background: t.colors.text, opacity: 0.7 }}
                  />
                  <div className="flex gap-1.5">
                    <div
                      className="h-6 flex-1 rounded"
                      style={{ background: t.colors.surface }}
                    />
                    <div
                      className="h-6 flex-1 rounded"
                      style={{ background: t.colors.surface }}
                    />
                  </div>
                  <div
                    className="h-1.5 w-14 rounded-full mt-2"
                    style={{ background: t.colors.text, opacity: 0.4 }}
                  />
                </div>
                <div className="text-xs font-medium text-text-primary text-center pb-1">
                  {t.label}
                </div>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
