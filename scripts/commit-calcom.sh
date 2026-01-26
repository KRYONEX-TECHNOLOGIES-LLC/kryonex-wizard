#!/usr/bin/env bash
set -euo pipefail

git add server.js frontend/src/pages/WizardPage.jsx supabase/command_suite.sql
git commit -m "$(cat <<'EOF'
Fix Cal.com OAuth & Auto-Save

Allow OAuth via query token and persist Cal.com event metadata.
EOF
)"
git status -sb
