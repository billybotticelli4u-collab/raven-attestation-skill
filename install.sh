#!/usr/bin/env bash
# Install the Raven Token Attestation skill into a coding agent's skills directory.
# Safe + transparent: it only copies files. No downloads, no executables run.
set -euo pipefail

SKILL_NAME="raven-attestation"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Default target: Claude Code skills dir. Override with: ./install.sh <target-dir>
DEFAULT_TARGET="${HOME}/.claude/skills"
TARGET_BASE="${1:-$DEFAULT_TARGET}"
DEST="${TARGET_BASE}/${SKILL_NAME}"

echo "Installing '${SKILL_NAME}' skill"
echo "  from: ${SRC_DIR}"
echo "  to:   ${DEST}"

mkdir -p "${DEST}"
cp -R "${SRC_DIR}/skill/." "${DEST}/"
cp -R "${SRC_DIR}/lib" "${DEST}/lib"
cp "${SRC_DIR}/README.md" "${DEST}/README.md" 2>/dev/null || true
cp "${SRC_DIR}/LICENSE" "${DEST}/LICENSE" 2>/dev/null || true

echo ""
echo "Done. Entry point: ${DEST}/SKILL.md"
echo ""
echo "Next:"
echo "  - Point your agent at the skills directory if it isn't already."
echo "  - Try the offline demo (no API key):"
echo "      node --experimental-strip-types \"${DEST}/lib/example-verify.ts\""
echo "  - For fetching fresh receipts, request a dev API key at https://ravenattest.com"
