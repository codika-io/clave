#!/usr/bin/env python3
"""Scan local Claude Code transcripts and summarise each session.

Read-only. Never modifies, never prints file contents beyond short excerpts.

Usage:
  scan-transcripts.py [--since DAYS] [--min-size KB] [--json] [--root PATH]

Output (human mode) is one block per session, newest first:

  === <session-id>  <size>MB  <start> -> <end>
      cwd: <cwd recorded in the transcript>
      repos: <repo>(<hits>), ...          # inferred from tool-call file paths
      tasks: ENG-412, ...                 # issue ids mentioned
      ask: <first real user message>
      end: <last substantial assistant message>
      note: <compaction summaries, if any>

The `repos` line is the reliable project signal. `cwd` usually points at a
workspace root shared by many unrelated sessions and must not be trusted alone.
"""

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path

ISSUE_RE = re.compile(r"\b([A-Z]{2,6})-(\d{1,6})\b")
PATH_KEYS = ("file_path", "path", "notebook_path", "cwd")

# Standards, units and encodings that look exactly like issue keys.
NOT_ISSUES = {
    "ISO", "SHA", "UTF", "AES", "RSA", "RFC", "UTC", "HTTP", "HTTPS", "IPV",
    "MD", "CVE", "CSS", "HTML", "API", "SQL", "TLS", "SSL", "JWT", "PNG",
    "JPEG", "GMT", "USD", "EUR", "PR", "ADR", "PHASE", "STEP", "WS", "OQ",
}
# An id mentioned only once is usually noise (a line ref, a version, a filename).
MIN_ISSUE_MENTIONS = 2

# One-shot helper conversations Claude Code spawns for itself. Not real sessions.
HELPER_PREFIXES = (
    "Generate a short 2-4 word title",
    "Write a git commit message",
    "Summarize this coding conversation",
    "Please write a 5-10 word title",
)


def is_helper(text):
    return any(text.startswith(p) for p in HELPER_PREFIXES)


def first_text(content):
    """Extract plain text from a message content field (string or block list)."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                return block.get("text")
    return None


class RepoResolver:
    """Map an absolute file path to the git repo that contains it (cached)."""

    def __init__(self):
        self._cache = {}

    def resolve(self, path):
        d = os.path.dirname(path)
        if d in self._cache:
            return self._cache[d]
        chain, found = [], None
        cur = d
        while cur and cur != "/" and len(chain) < 40:
            if cur in self._cache:
                found = self._cache[cur]
                break
            chain.append(cur)
            if os.path.exists(os.path.join(cur, ".git")):
                found = cur
                break
            cur = os.path.dirname(cur)
        for c in chain:
            self._cache[c] = found
        return found


def scan_file(path, resolver):
    st = os.stat(path)
    rec = {
        "sessionId": os.path.basename(path)[:-6],
        "transcriptPath": path,
        "sizeBytes": st.st_size,
        "mtime": st.st_mtime,
        "cwd": None,
        "startedAt": None,
        "endedAt": None,
        "userMessages": 0,
        "ask": None,
        "end": None,
        "summaries": [],
        "repos": {},
        "tasks": [],
        "isHelper": False,
    }
    tasks = {}

    with open(path, errors="replace") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            for prefix, num in ISSUE_RE.findall(line):
                if prefix in NOT_ISSUES:
                    continue
                key = f"{prefix}-{num}"
                tasks[key] = tasks.get(key, 0) + 1
            try:
                obj = json.loads(line)
            except Exception:
                continue

            if obj.get("type") == "summary":
                s = obj.get("summary")
                if s and s not in rec["summaries"]:
                    rec["summaries"].append(s)
                continue

            if rec["cwd"] is None and obj.get("cwd"):
                rec["cwd"] = obj["cwd"]
            ts = obj.get("timestamp")
            if ts:
                if rec["startedAt"] is None:
                    rec["startedAt"] = ts
                rec["endedAt"] = ts

            if obj.get("isSidechain"):
                continue
            kind = obj.get("type")

            if kind == "user":
                text = first_text(obj.get("message", {}).get("content"))
                if not text:
                    continue
                head = text.lstrip()
                if head.startswith("<") or head.startswith("Caveat:"):
                    continue
                if "system-reminder" in head[:80]:
                    continue
                rec["userMessages"] += 1
                if rec["ask"] is None:
                    if is_helper(head):
                        rec["isHelper"] = True
                    rec["ask"] = " ".join(head.split())

            elif kind == "assistant":
                content = obj.get("message", {}).get("content") or []
                if not isinstance(content, list):
                    continue
                for block in content:
                    if not isinstance(block, dict):
                        continue
                    if block.get("type") == "text" and len(block.get("text", "")) > 120:
                        rec["end"] = " ".join(block["text"].split())
                    elif block.get("type") == "tool_use":
                        inp = block.get("input") or {}
                        if not isinstance(inp, dict):
                            continue
                        for key in PATH_KEYS:
                            val = inp.get(key)
                            if isinstance(val, str) and val.startswith("/"):
                                repo = resolver.resolve(val)
                                if repo:
                                    rec["repos"][repo] = rec["repos"].get(repo, 0) + 1

    rec["tasks"] = [
        k for k, n in sorted(tasks.items(), key=lambda kv: (-kv[1], kv[0]))
        if n >= MIN_ISSUE_MENTIONS
    ]
    return rec


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--since", type=float, default=14, help="only sessions touched in the last N days (default 14)")
    ap.add_argument("--min-size", type=float, default=50, help="skip transcripts smaller than N KB (default 50)")
    ap.add_argument("--json", action="store_true", help="emit JSON instead of text")
    ap.add_argument("--root", default=os.path.expanduser("~/.claude/projects"))
    ap.add_argument("--all", action="store_true", help="include helper/one-shot sessions")
    args = ap.parse_args()

    root = Path(args.root)
    if not root.is_dir():
        print(f"No transcript store at {root}", file=sys.stderr)
        return 3

    cutoff = time.time() - args.since * 86400
    min_bytes = args.min_size * 1024
    resolver = RepoResolver()

    records = []
    for path in root.glob("*/*.jsonl"):
        try:
            st = path.stat()
        except OSError:
            continue
        if st.st_mtime < cutoff or st.st_size < min_bytes:
            continue
        try:
            rec = scan_file(str(path), resolver)
        except Exception as exc:  # a corrupt transcript must not abort the sweep
            records.append({"sessionId": path.stem, "transcriptPath": str(path), "error": str(exc), "mtime": st.st_mtime})
            continue
        if rec["isHelper"] and not args.all:
            continue
        if not rec["ask"] and not args.all:
            continue
        records.append(rec)

    records.sort(key=lambda r: -r.get("mtime", 0))

    if args.json:
        for r in records:
            r.pop("mtime", None)
        print(json.dumps(records, indent=1))
        return 0

    for r in records:
        if r.get("error"):
            print(f"=== {r['sessionId']}  UNREADABLE: {r['error']}")
            continue
        mb = r["sizeBytes"] / 1048576
        print(f"=== {r['sessionId']}  {mb:.1f}MB  {(r['startedAt'] or '')[:16]} -> {(r['endedAt'] or '')[:16]}  ({r['userMessages']} msgs)")
        print(f"    cwd: {r['cwd']}")
        repos = sorted(r["repos"].items(), key=lambda kv: -kv[1])[:5]
        if repos:
            print("    repos: " + ", ".join(f"{os.path.basename(p)}({n})" for p, n in repos))
        if r["tasks"]:
            print("    tasks: " + ", ".join(r["tasks"][:10]))
        if r["ask"]:
            print(f"    ask: {r['ask'][:400]}")
        if r["end"]:
            print(f"    end: {r['end'][:300]}")
        for s in r["summaries"][:2]:
            print(f"    note: {s[:200]}")
        print()

    print(f"{len(records)} session(s).", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
