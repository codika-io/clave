# Contributing to Clave

Thanks for your interest in contributing! Please read this guide before starting any work.

## Reporting bugs

Open a [bug report](https://github.com/codika-io/clave/issues/new?template=bug_report.md) with:

- Your Clave version (Help → About) and macOS version
- Steps to reproduce
- What you expected vs. what happened
- Console logs if relevant (View → Toggle Developer Tools)

## Suggesting features

Open a [feature request](https://github.com/codika-io/clave/issues/new?template=feature_request.md) describing the problem you're trying to solve and your proposed solution.

## The golden rule: propose before you build

**Feature PRs that arrive without an approved issue will be closed**, regardless of code quality. This is not about gatekeeping; it protects your time. We have closed well-built PRs in the past because the feature didn't fit the product direction, and that's a bad outcome for everyone.

### What needs an issue first

- Any new UI surface (panel, tab, modal, widget)
- Any new concept or data model
- Any change touching more than ~200 lines
- Anything that adds a dependency

### What can go straight to a PR

- Bug fixes
- Typo and documentation corrections
- Performance improvements with no UX change
- Refactors that don't change behavior

### How the approval flow works

1. **Open a feature request issue** describing the problem, not just the solution
2. **Wait for a maintainer to respond.** We aim to reply within a few days. The issue will be labeled `approved` if we're aligned, or we'll explain why it's not the right fit
3. **Only then start building.** Reference the approved issue in your PR

This flow exists because Clave has a deliberately narrow scope. Features that seem like obvious additions often conflict with design choices we've already tested and reverted.

## PR guidelines

1. Fork the repo and create a branch from `dev` (PRs target `dev`; `prod` is the release branch — every push to it ships a new version)
2. One feature or fix per PR. Don't bundle unrelated changes
3. Run `npm run typecheck` and `npm run lint` before opening
4. Reference the related issue: `Closes #123`
5. Write a clear description of what changed and why

## Development setup

```bash
git clone https://github.com/codika-io/clave.git
cd clave
npm install
npm run dev
```

## Contributor License Agreement

By submitting a pull request, you agree that your contributions are licensed under the [MIT License](LICENSE) and you grant the project maintainers the right to relicense your contributions as part of the project.
