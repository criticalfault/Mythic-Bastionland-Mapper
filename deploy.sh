#!/usr/bin/env bash
# =============================================================================
#  Mythic Bastionland Mapper — Deploy / Update Script
#  Usage:  bash deploy.sh
#  Run as the app user (ec2-user) — does NOT need sudo.
# =============================================================================
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
info()    { echo -e "${CYAN}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[ OK ]${NC}  $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
die()     { echo -e "${RED}[FAIL]${NC}  $*" >&2; exit 1; }
banner()  { echo -e "\n${CYAN}${BOLD}── $* ──────────────────────────────────────────────${NC}"; }

APP_DIR="/opt/mythic-bastionland"
PM2_APP="mythic-bastionland"

[[ -d "$APP_DIR/.git" ]] || die "App not found at $APP_DIR — run install.sh first."

# ── 1. Pull latest code ───────────────────────────────────────────────────────
banner "Git pull"
git -C "$APP_DIR" pull
success "Code up to date"

# ── 2. Server deps (prod only — skips devDependencies) ───────────────────────
banner "Server dependencies"
cd "$APP_DIR"
npm install --omit=dev
success "Server deps installed"

# ── 3. Rebuild client ─────────────────────────────────────────────────────────
banner "Client build"
cd "$APP_DIR/client"
npm install          # keeps devDeps needed for Vite build
npm run build
success "Client built → dist/"

# ── 4. Reload app (zero-downtime via PM2 reload) ─────────────────────────────
banner "Reload PM2"
cd "$APP_DIR"
if pm2 describe "$PM2_APP" &>/dev/null; then
  pm2 reload "$PM2_APP"
  success "PM2 process reloaded (zero-downtime)"
else
  warn "PM2 process '$PM2_APP' not found — starting fresh"
  pm2 start ecosystem.config.js
  pm2 save
  success "PM2 process started"
fi

# ── 5. Quick smoke test ───────────────────────────────────────────────────────
banner "Smoke test"
sleep 2
STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ || echo "000")
if [[ "$STATUS" == "200" ]]; then
  success "Server responding (HTTP $STATUS)"
else
  warn "Server returned HTTP $STATUS — check logs:"
  pm2 logs "$PM2_APP" --lines 20 --nostream || true
fi

echo
echo -e "${GREEN}${BOLD}Deploy complete!${NC}"
echo -e "  ${BOLD}Status${NC}   pm2 status"
echo -e "  ${BOLD}Logs${NC}     pm2 logs $PM2_APP"
echo -e "  ${BOLD}Restart${NC}  pm2 restart $PM2_APP"
echo
