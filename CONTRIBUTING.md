# Contributing to Clave

Thanks for your interest in contributing! Here's how you can help.

## Reporting bugs

Open a [bug report](https://github.com/codika-io/clave/issues/new?template=bug_report.md) with:

- Your Clave version (Help → About) and macOS version
- Steps to reproduce
- What you expected vs. what happened
- Console logs if relevant (View → Toggle Developer Tools)

## Suggesting features

Open a [feature request](https://github.com/codika-io/clave/issues/new?template=feature_request.md) describing the problem you're trying to solve and your proposed solution.

## Submitting pull requests

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Run `npm run typecheck` and `npm run lint` to verify nothing is broken
4. Open a PR with a clear description of what changed and why

Keep PRs focused — one feature or fix per PR.

## Development setup

```bash
git clone https://github.com/codika-io/clave.git
cd clave
npm install
npm run dev
```

## Contributor License Agreement

By submitting a pull request, you agree that your contributions are licensed under the [MIT License](LICENSE) and you grant the project maintainers the right to relicense your contributions as part of the project.
