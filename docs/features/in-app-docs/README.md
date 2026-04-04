# In-App Documentation & What's New

**Status:** Idea — brainstorming in progress

## Problem

Clave has powerful features (kanban board, git panel, session groups, pinned configs, templates, history viewer, usage analytics) but no way for users to discover or learn about them. New users see a terminal and don't know what else is possible. Existing users miss new features added in updates.

## Proposed Features

### 1. What's New Notifications

After app updates that add features, a subtle, non-blocking banner appears once:

> "New: Kanban Board — queue tasks and let Claude work through them. [Try it ->]"

- Clicking jumps to the feature
- Dismissible, shown once per feature per user
- Could link to a brief in-app doc for the feature

### 2. In-App Documentation / Help

A **"Help" tab in the right side panel** (alongside Files and Git). Contains searchable markdown docs rendered in-panel using the existing `MarkdownRenderer.tsx`.

**Structure:**
- Top: search/filter input (same pattern as Files tab filter)
- Below: list of doc titles, click to render markdown in the panel
- Docs include `[Go to feature ->]` links that navigate to the relevant view/panel
- Docs are bundled in the app in a `docs/help/` folder — easy to maintain as plain `.md` files

Content should cover:
- What is Clave and why use it vs. a plain terminal
- Session management (Claude mode, terminal mode, dangerous mode)
- Kanban board workflow
- Git panel (staging, committing, push/pull, journey view)
- Session groups, pinned groups, .clave files, templates
- File browser and file palette
- History viewer
- Usage analytics
- Keyboard shortcuts (already partially surfaced)
- Remote/SSH sessions

### 3. Future: Interactive Onboarding

Once docs exist, a guided first-run experience could be built on top — walking new users through key features step by step. This is a later phase that depends on having the documentation content in place first.

## Design Principles

- Lightweight, not intrusive
- Learn by doing where possible, not walls of text
- Documentation as a foundation that onboarding and what's new can build on
- Content should be easy to maintain as features evolve

## Decisions Made

- **Location:** Help tab in the right side panel (alongside Files and Git)
- **Format:** Markdown files in a `docs/help/` folder, rendered in-panel via `MarkdownRenderer.tsx`
- **What's New:** Tied to app version numbers — compare `app.getVersion()` against `lastSeenVersion` in localStorage. Simple, no feature flags needed since all users on the same Electron build get the same features.
- **Changelog:** `CHANGELOG.md` in repo root using Keep a Changelog format. What's New notifications pull from the "Added" items of the current version. Changelog entries are written as part of the release flow.

## Open Questions

- Keyboard shortcut for Help tab? (Cmd+? is natural)
- Should docs include screenshots/GIFs or stay text-only?
- How to handle "Go to feature" links — custom protocol or action registry?
- Should the Help tab also surface the changelog / release notes?
