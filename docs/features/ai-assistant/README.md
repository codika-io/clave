# Cross-Session AI Assistant ("Clave Intelligence")

**Status:** Future idea — not yet designed

## Summary

A built-in AI layer that sits above individual Claude Code sessions. It has context of all sessions, can access Claude memory, and helps users learn from their work patterns and improve.

## Potential Capabilities

- **Session-aware queries** — "What are my sessions doing right now?", "Summarize today's work", "What did I try yesterday for that auth bug?"
- **Cross-session memory** — Reads Claude's `~/.claude/` memory files + session history. Connects dots across projects.
- **Smart suggestions** — Based on usage patterns: "You usually create a plan before big refactors — want me to start one?", "This task failed twice, here's what changed."
- **Work journal** — Auto-generated daily/weekly summaries of what was accomplished across all sessions.
- **Onboarding via the assistant** — Instead of static tutorials, the assistant guides new users conversationally.

## Open Questions

- Panel location: sidebar, modal, separate view?
- Proactive suggestions vs. on-demand only?
- What model powers it? Same Claude API or local summarization?
- How to avoid it feeling gimmicky — insights must be genuinely useful
- Privacy: users may not want all session data analyzed
- How does it relate to the existing Usage analytics view?

## Possible Phased Approach

1. Start simple: session summaries and search across history
2. Add work journal / daily recap
3. Add proactive suggestions based on patterns
4. Full conversational assistant with memory access
