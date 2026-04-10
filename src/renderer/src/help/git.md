# Git Panel

The git panel gives you staging, committing, diffing, and push/pull without leaving Clave.

[Open Git Panel](clave://navigate/side:git)

## Opening the Panel

- **Cmd+Shift+G**: Open right sidebar on the Git tab
- Or click the **Git** tab in the right sidebar

## Panel Modes

Toggle between two modes in the panel header:

- **Changes**: Working tree view with staged, unstaged, and untracked files
- **Log**: Commit history with the Git Journey visualization

## View Modes

Switch between **list** (flat file list) and **tree** (directory tree) views using the toggle in the header.

## Staging and Committing

1. Files appear in three sections: **Staged**, **Unstaged**, and **Untracked**
2. Click the **+** icon on a file to stage it (or **-** to unstage)
3. Write a commit message in the input at the bottom
4. Click **Commit** (or use the AI-generated message)

## AI Commit Messages

Click the sparkle icon next to the commit input to generate a commit message based on your staged changes.

## Diff Preview

Click any file in the git panel to see a side-by-side diff with syntax highlighting.

## Push and Pull

- **Push**: Send your commits to the remote
- **Pull**: Fetch and merge remote changes

## MagicSync

One-click automated workflow that pulls, stages all changes, generates a commit message, commits, and pushes. The steps run in sequence: pulling, staging, generating, committing, pushing.

## Git Journey

Click the journey icon in the git panel toolbar to visualize your commit history. Commits appear as dots grouped by push batch. Green dots are local (not yet pushed), blue dots are pushed. Click a dot to view its diff and changed files.

## Multi-Repo Support

If your workspace contains multiple git repos (e.g., a monorepo with nested repositories), the panel auto-detects them and shows each repo as a collapsible section.
