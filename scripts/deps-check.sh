#!/usr/bin/env bash
# Prints the security audit and the outdated packages for the backend and the frontend.
# Read-only: changes nothing. Run it on a schedule or before a release.
set -u
root="$(cd "$(dirname "$0")/.." && pwd)"
for dir in backend frontend; do
  echo "== $dir: security audit"
  (cd "$root/$dir" && npm audit --omit=dev 2>&1 | tail -n 15) || true
  echo "== $dir: outdated (current / wanted / latest)"
  (cd "$root/$dir" && npm outdated 2>&1) || true
  echo
done
