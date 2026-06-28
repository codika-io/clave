# Roadmap

Forward-looking counterpart to [CHANGELOG.md](./CHANGELOG.md). Tracks work we know we want but have intentionally deferred. Items here are not commitments or dated — they graduate to a release when picked up.

## Deferred

### Agent tab status indicators for non-Claude providers
The tab status system (neutral / working / blocked / done, via icon color + dot) relies on deterministic Claude Code signals (lifecycle hooks + `~/.claude/sessions/<pid>.json`). Antigravity CLI and Codex CLI expose no equivalent, so they intentionally show a **neutral icon and no dot, always**. Revisit if/when those CLIs gain comparable lifecycle signals (hooks, a status file, or a machine-readable state channel) — until then, scraping their terminal output for state is explicitly out of scope.

_Related: GitHub issue #18._
