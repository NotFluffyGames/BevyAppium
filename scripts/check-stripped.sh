#!/usr/bin/env bash
# Release-build stripping check (Seam 2).
#
# Builds the example game WITHOUT the Agent feature and fails if any trace of the
# Agent is left: in the dependency tree (cargo tree) or in the built binary.
#
#   scripts/check-stripped.sh                 # default profile: release
#   PROFILE=dev scripts/check-stripped.sh     # faster, for local runs
#   scripts/check-stripped.sh --with-agent    # self-test: builds WITH the Agent and
#                                             # passes only if the check DOES find traces
set -euo pipefail
cd "$(dirname "$0")/.."

PROFILE="${PROFILE:-release}"
WITH_AGENT=0
[ "${1:-}" = "--with-agent" ] && WITH_AGENT=1

FEATURES=()
[ "$WITH_AGENT" = 1 ] && FEATURES=(--features bevyappium)
PROFILE_ARGS=(--profile "$PROFILE")
[ "$PROFILE" = "release" ] && PROFILE_ARGS=(--release)
DIR="$PROFILE"; [ "$PROFILE" = "dev" ] && DIR=debug

# Crates only the Agent pulls in. If any of these is in the tree, something enabled the Agent
# (including another crate switching on Bevy's own `bevy_remote` feature).
FORBIDDEN_CRATES='bevy_remote'
# Strings only Agent code contains.
FORBIDDEN_STRINGS=('bevyappium_agent' 'bevyappium.run' 'BEVYAPPIUM_PORT' 'bevy_remote')

traces=()

echo "== dependency tree"
tree=$(cargo tree -p bevyappium-example "${FEATURES[@]}" -e normal,features --prefix none --format '{p} {f}' 2>&1)
if grep -Eq "^($FORBIDDEN_CRATES) " <<<"$tree"; then traces+=("dependency tree contains: $(grep -Eo "^($FORBIDDEN_CRATES) [^ ]*" <<<"$tree" | sort -u | tr '\n' ' ')"); fi
if grep -E '^bevyappium-agent ' <<<"$tree" | grep -Eq '(^|[ ,])enabled([ ,]|$)'; then traces+=("bevyappium-agent is built with its 'enabled' feature"); fi

echo "== building ($PROFILE, agent $([ "$WITH_AGENT" = 1 ] && echo on || echo off))"
cargo build -p bevyappium-example "${FEATURES[@]}" "${PROFILE_ARGS[@]}" >/dev/null 2>&1 || { echo "build failed"; exit 2; }
bin="target/$DIR/bevyappium-example"

echo "== binary strings"
for s in "${FORBIDDEN_STRINGS[@]}"; do
  if grep -aqF -- "$s" "$bin"; then traces+=("binary contains the string '$s'"); fi
done

if [ "$WITH_AGENT" = 1 ]; then
  if [ "${#traces[@]}" -gt 0 ]; then
    echo "OK (self-test): the check detected the Agent:"; printf '  - %s\n' "${traces[@]}"; exit 0
  fi
  echo "SELF-TEST FAILED: Agent is on but the check found no traces"; exit 1
fi

if [ "${#traces[@]}" -gt 0 ]; then
  echo "FAIL: traces of the Agent found in a build without the feature:"; printf '  - %s\n' "${traces[@]}"; exit 1
fi
echo "OK: no Agent traces in the dependency tree or binary"
