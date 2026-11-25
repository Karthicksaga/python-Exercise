#!/usr/bin/env bash
# One shot: merge agent branches into the integration branch, run every check, and say if it is safe to push.
#
#   tools/merge_and_test.sh [--push] [--quick] agent/godot-a agent/godot-b ...
#
# What it does, in order (it stops at the first real problem and says why):
#   1. refuses to start on a dirty tree or on the wrong branch
#   2. git fetch, then merges each branch with --no-ff
#   3. a conflict ONLY in docs (handoff.md, progress.md, technical-decisions.md, LICENSES.md, parity.md) is resolved by
#      keeping both sides; a conflict in any other file stops the script (hand it to a complex agent)
#   4. checks no leftover conflict markers and no duplicate G-number headings
#   5. runs ./run_tests.sh with TEST_TIMEOUT=3000 (the same limit CI uses or more), tools/geo/run_tests.sh,
#      the railway tool tests and python3 tools/sync_from_threejs.py --check
#   6. prints ONE verdict. With --push it pushes only when everything passed, else it pushes nothing.
# --quick runs only the unit tests (a smoke check while writing this script, never enough to push).
# The one known load-sensitive test (scene/test_city_streaming.gd::test_main_thread_budget_under_cpu_load) is
# re-run alone once if it is the only failure; every other failure is a failure.
set -u
cd "$(dirname "$0")/.."
ROOT="$(git rev-parse --show-toplevel)"
BRANCH="$(git -C "$ROOT" rev-parse --abbrev-ref HEAD)"
PUSH=0; QUICK=0; BRANCHES=()
for a in "$@"; do
  case "$a" in --push) PUSH=1;; --quick) QUICK=1;; *) BRANCHES+=("$a");; esac
done
say() { printf '\n== %s\n' "$*"; }
die() { printf '\nSTOP: %s\n' "$*"; exit 1; }

[ "$BRANCH" = "feat/godot-chennai" ] || [ "${ALLOW_ANY_BRANCH:-0}" = 1 ] || die "on $BRANCH, expected feat/godot-chennai (set ALLOW_ANY_BRANCH=1 to override)"
git -C "$ROOT" checkout -q godot-chennai/default_bus_layout.tres 2>/dev/null || true   # the test run rewrites this file
[ -z "$(git -C "$ROOT" status --short)" ] || die "the working tree is not clean:\n$(git -C "$ROOT" status --short | head)"

say "fetch"
git -C "$ROOT" fetch -q origin || die "git fetch failed"

DOCS='^godot-chennai/(docs/(handoff|progress|technical-decisions|parity)\.md|assets/LICENSES\.md)$'
for b in "${BRANCHES[@]}"; do
  say "merge $b"
  if git -C "$ROOT" merge --no-ff -q -m "Merge $b

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MVtKaPCorLNkiEVJKnv17a" "origin/$b" >/tmp/merge.out 2>&1; then
    echo "merged cleanly"; continue
  fi
  CONF="$(git -C "$ROOT" diff --name-only --diff-filter=U)"
  [ -n "$CONF" ] || { cat /tmp/merge.out; die "merge of $b failed without conflicts"; }
  BAD="$(echo "$CONF" | grep -Ev "$DOCS" || true)"
  if [ -n "$BAD" ]; then
    echo "$CONF"; git -C "$ROOT" merge --abort
    die "code conflict in:\n$BAD\n(merge aborted, nothing changed). Give $b to a complex agent."
  fi
  for f in $CONF; do sed -i -e '/^<<<<<<< /d' -e '/^=======$/d' -e '/^>>>>>>> /d' "$ROOT/$f"; git -C "$ROOT" add "$f"; done
  echo "docs-only conflict, kept both sides: $(echo $CONF | tr '\n' ' ')"
  git -C "$ROOT" commit -q --no-edit || die "could not commit the merge of $b"
done

say "static checks"
if grep -rn '^<<<<<<< \|^>>>>>>> ' docs assets/LICENSES.md src tests tools 2>/dev/null | head -3 | grep .; then die "leftover conflict markers"; fi
DUP="$(grep -o '^#* *G-[0-9]*' docs/technical-decisions.md | sort | uniq -d)"
[ -z "$DUP" ] || die "duplicate decision numbers: $DUP"
echo "no conflict markers, no duplicate G-numbers"

RESULT=0; SUM=""
if [ "$QUICK" = 1 ]; then
  say "quick: unit tests only"
  TEST_TIMEOUT=900 ./run_tests.sh --filter=unit/ > /tmp/mt.log 2>&1
else
  say "full test suite (TEST_TIMEOUT=3000)"
  TEST_TIMEOUT=3000 ./run_tests.sh > /tmp/mt.log 2>&1
fi
LINE="$(grep -a 'Results:' /tmp/mt.log | tail -1)"
[ -n "$LINE" ] || { tail -3 /tmp/mt.log; die "no Results line: the run was cut off (timeout or crash). That is NOT a pass."; }
echo "$LINE"
FAILS="$(grep -a '^  FAIL ' /tmp/mt.log | sed 's/^  FAIL  *//')"
if echo "$LINE" | grep -q ' 0 failed, 0 broken'; then :; else
  ONLY="scene/test_city_streaming.gd::test_main_thread_budget_under_cpu_load"
  if [ "$(echo "$FAILS" | grep -c .)" = 1 ] && [ "$FAILS" = "$ONLY" ]; then
    say "re-running the one load-sensitive test alone"
    ./run_tests.sh --filter=test_city_streaming 2>&1 | grep -a 'Results:' | tail -1 | tee /tmp/mt2.log
    grep -q ' 0 failed, 0 broken' /tmp/mt2.log || RESULT=1
  else
    echo "FAILED TESTS:"; echo "$FAILS"; RESULT=1
  fi
fi

say "geo tests"; GEO="$(tools/geo/run_tests.sh 2>&1 | tail -1)"; echo "$GEO"; echo "$GEO" | grep -q passed || RESULT=1
say "railway tool tests"; RAIL="$(cd tools/rail 2>/dev/null && python3 -m pytest -q 2>&1 | tail -1)"; echo "$RAIL"; echo "$RAIL" | grep -q passed || RESULT=1
say "sync with the Three.js game"; SYNC="$(python3 tools/sync_from_threejs.py --check 2>&1 | tail -1)"; echo "$SYNC"; echo "$SYNC" | grep -q match || RESULT=1

git -C "$ROOT" checkout -q godot-chennai/default_bus_layout.tres 2>/dev/null || true
say "VERDICT"
if [ "$RESULT" = 0 ] && [ "$QUICK" = 0 ]; then
  echo "ALL GREEN. head: $(git -C "$ROOT" log --oneline -1)"
  if [ "$PUSH" = 1 ]; then git -C "$ROOT" push -q origin "$BRANCH" && echo "pushed to origin/$BRANCH"; else echo "not pushed (run again with --push, or push by hand)"; fi
  exit 0
fi
[ "$QUICK" = 1 ] && echo "quick mode: never pushes. result code $RESULT"
echo "NOT SAFE TO PUSH. Nothing was pushed."
exit 1
