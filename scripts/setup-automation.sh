#!/bin/bash
# One-shot installer for the local half of the lead follow-up engine.
# Run once:  bash scripts/setup-automation.sh
#
# What it schedules (via your user crontab, only while this Mac is awake):
#   1. 7:30am Mon-Fri — auto-draft follow-ups for stale leads (hits the
#      prepare endpoint; drafts land in the Follow-ups approval queue).
#      Once the app is on Vercel, Vercel Cron does this too (vercel.json) —
#      the endpoint is idempotent, so both running is harmless.
#   2. Every 30 min, 8am-6pm Mon-Fri — send APPROVED emails via Gmail (gws)
#      and auto-log the touchpoint. Sends only status='queued' rows, i.e.
#      only what you approved. No approvals = silent no-op.
#
# Requirements: `gws auth login` done once on this Mac; node on PATH.

set -euo pipefail
cd "$(dirname "$0")/.."
PROJECT_DIR="$(pwd)"
NODE_BIN="$(command -v node)"
BASE_URL="${BASE_URL:-http://localhost:3000}"

if [ -z "$NODE_BIN" ]; then echo "node not found on PATH" >&2; exit 1; fi

MARKER="# livingstone-followup-engine"
PREPARE="30 7 * * 1-5 cd \"$PROJECT_DIR\" && curl -s -X POST \"$BASE_URL/api/leads/followups/prepare\" >> .automation.log 2>&1 $MARKER"
SEND="*/30 8-18 * * 1-5 cd \"$PROJECT_DIR\" && \"$NODE_BIN\" scripts/send-outbox.mjs >> .automation.log 2>&1 $MARKER"

# Replace any previous install of these two jobs, keep everything else.
( crontab -l 2>/dev/null | grep -v "$MARKER" || true; echo "$PREPARE"; echo "$SEND" ) | crontab -

echo "Installed. Current crontab:"
crontab -l | grep "$MARKER"
echo
echo "Logs: $PROJECT_DIR/.automation.log"
echo "To remove: crontab -l | grep -v 'livingstone-followup-engine' | crontab -"
