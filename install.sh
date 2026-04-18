#!/usr/bin/env bash
# =============================================================================
#  Mythic Bastionland Mapper — Server Install Script
#  Tested on: Amazon Linux 2023 (also works on Amazon Linux 2)
#  Run as:    sudo bash install.sh
# =============================================================================
set -euo pipefail

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
info()    { echo -e "${CYAN}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[ OK ]${NC}  $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
die()     { echo -e "${RED}[FAIL]${NC}  $*" >&2; exit 1; }
banner()  { echo -e "\n${CYAN}${BOLD}── $* ──────────────────────────────────────────────${NC}"; }

# ── 0. Pre-flight ─────────────────────────────────────────────────────────────
[[ $EUID -eq 0 ]] || die "Run as root:  sudo bash install.sh"

# Who actually ran sudo? We run the app as that user (e.g. ec2-user), not root.
APP_USER="${SUDO_USER:-ec2-user}"
APP_HOME=$(getent passwd "$APP_USER" | cut -d: -f6)
[[ -n "$APP_HOME" ]] || die "Could not determine home directory for $APP_USER"

# Detect Amazon Linux version → choose package manager
if grep -q 'Amazon Linux 2023' /etc/os-release 2>/dev/null; then
  PKG="dnf"; AL_VER=2023
elif grep -q 'Amazon Linux' /etc/os-release 2>/dev/null; then
  PKG="yum"; AL_VER=2
else
  warn "Not Amazon Linux — assuming dnf"; PKG="dnf"; AL_VER=2023
fi
info "Amazon Linux $AL_VER detected  (package manager: $PKG)"
info "App will run as user: ${BOLD}$APP_USER${NC} (home: $APP_HOME)"

# ── 1. Collect config ─────────────────────────────────────────────────────────
echo
echo -e "${CYAN}${BOLD}╔══════════════════════════════════════════════════════╗"
echo -e "║    Mythic Bastionland Mapper — Server Setup          ║"
echo -e "╚══════════════════════════════════════════════════════╝${NC}"
echo

echo -e "${YELLOW}${BOLD}Before you continue, make sure:${NC}"
echo -e "  ${YELLOW}1. Your domain's DNS A-record points to this server's public IP${NC}"
echo -e "  ${YELLOW}2. AWS Security Group has inbound rules for:${NC}"
echo -e "     ${YELLOW}• HTTP  (port 80)  — 0.0.0.0/0${NC}"
echo -e "     ${YELLOW}• HTTPS (port 443) — 0.0.0.0/0${NC}"
echo -e "     ${YELLOW}• SSH   (port 22)  — your IP${NC}"
echo -e "  ${YELLOW}Without these the SSL certificate step WILL fail.${NC}"
echo

read -rp "  Git repo URL (SSH or HTTPS): " REPO_URL
[[ -n "$REPO_URL" ]] || die "Repo URL is required"

read -rp "  Domain name (e.g. map.example.com): " DOMAIN
[[ -n "$DOMAIN" ]] || die "Domain is required"

read -rp "  Email for SSL certificate (Let's Encrypt): " CERT_EMAIL
[[ -n "$CERT_EMAIL" ]] || die "Email is required"

read -rp "  GM_UID (Firebase UID, or leave blank to skip): " GM_UID

APP_DIR="/opt/mythic-bastionland"
PORT=3000

echo
info "Install dir  : $APP_DIR"
info "App user     : $APP_USER"
info "Node port    : $PORT (internal — Nginx proxies 443 → $PORT)"
echo
read -rp "Press Enter to start, or Ctrl-C to abort…"

# ── 2. System packages ────────────────────────────────────────────────────────
banner "System packages"

info "Updating system…"
$PKG update -y -q

info "Installing base packages…"
$PKG install -y git nginx firewalld python3

# Node.js 20 LTS via NodeSource
if ! command -v node &>/dev/null || \
   [[ "$(node -e 'process.stdout.write(process.version.split(".")[0].slice(1))')" -lt 18 ]]; then
  info "Installing Node.js 20 LTS…"
  curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
  $PKG install -y nodejs
fi
success "Node $(node --version)  /  npm $(npm --version)"

# PM2 — install globally, accessible by all users
if ! command -v pm2 &>/dev/null; then
  info "Installing PM2 globally…"
  npm install -g pm2
fi
success "PM2 $(pm2 --version)"

# Certbot — via pip venv (works on both AL2 and AL2023)
if ! command -v certbot &>/dev/null; then
  info "Installing Certbot…"
  python3 -m venv /opt/certbot
  /opt/certbot/bin/pip install --quiet --upgrade pip certbot certbot-nginx
  ln -sf /opt/certbot/bin/certbot /usr/local/bin/certbot
fi
success "Certbot $(certbot --version 2>&1 | grep -oP '\d+\.\d+\.\d+' | head -1)"

# ── 3. Clone / update repo ────────────────────────────────────────────────────
banner "Repository"
if [[ -d "$APP_DIR/.git" ]]; then
  info "Repo already present — pulling latest…"
  git -C "$APP_DIR" pull
else
  info "Cloning $REPO_URL → $APP_DIR"
  git clone "$REPO_URL" "$APP_DIR"
fi
chown -R "$APP_USER":"$APP_USER" "$APP_DIR"
success "Repository ready at $APP_DIR"

# ── 4. Firebase service account ───────────────────────────────────────────────
banner "Firebase service account"
SA_FILE="$APP_DIR/server/service-account.json"

if [[ -f "$SA_FILE" ]]; then
  warn "service-account.json already exists — skipping (delete it and re-run to replace)"
else
  echo
  echo -e "  Paste the FULL contents of your Firebase service-account.json."
  echo -e "  Finish with a line containing only ${BOLD}END${NC} then press Enter:"
  echo

  SA_JSON=""
  while IFS= read -r line; do
    [[ "$line" == "END" ]] && break
    SA_JSON+="$line"$'\n'
  done

  if python3 -c "import sys,json; json.load(sys.stdin)" <<< "$SA_JSON" 2>/dev/null; then
    echo "$SA_JSON" > "$SA_FILE"
    chmod 600 "$SA_FILE"
    chown "$APP_USER":"$APP_USER" "$SA_FILE"
    success "service-account.json saved (mode 600, owned by $APP_USER)"
  else
    warn "Pasted content may not be valid JSON — saving anyway; verify at $SA_FILE"
    echo "$SA_JSON" > "$SA_FILE"
    chmod 600 "$SA_FILE"
    chown "$APP_USER":"$APP_USER" "$SA_FILE"
  fi
fi

# ── 5. Environment file ───────────────────────────────────────────────────────
banner "Environment (.env)"
ENV_FILE="$APP_DIR/.env"
cat > "$ENV_FILE" <<EOF
PORT=$PORT
GM_UID=$GM_UID
NODE_ENV=production
EOF
chmod 600 "$ENV_FILE"
chown "$APP_USER":"$APP_USER" "$ENV_FILE"
success ".env written (mode 600, owned by $APP_USER)"

# ── 6. Install deps & build ───────────────────────────────────────────────────
banner "Dependencies & build"

info "Installing server dependencies…"
sudo -u "$APP_USER" bash -c "cd '$APP_DIR' && npm install --omit=dev"

info "Installing client dependencies (includes dev deps for build)…"
sudo -u "$APP_USER" bash -c "cd '$APP_DIR/client' && npm install"

info "Building client…"
sudo -u "$APP_USER" bash -c "cd '$APP_DIR/client' && npm run build"

mkdir -p "$APP_DIR/server/saves"
chown -R "$APP_USER":"$APP_USER" "$APP_DIR/server/saves"
success "Build complete — client dist ready"

# ── 7. PM2 ───────────────────────────────────────────────────────────────────
banner "PM2 process manager"

# Write ecosystem config — logs go to PM2's default ~/.pm2/logs/ (no permission fights)
cat > "$APP_DIR/ecosystem.config.js" <<EOF
module.exports = {
  apps: [{
    name:            'mythic-bastionland',
    script:          'server/index.js',
    cwd:             '$APP_DIR',
    restart_delay:   3000,
    max_restarts:    10,
    watch:           false,
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    // Logs go to ~/.pm2/logs/ — no root-owned directory needed
  }],
};
EOF
chown "$APP_USER":"$APP_USER" "$APP_DIR/ecosystem.config.js"

# Kill any stale processes with conflicting names
sudo -u "$APP_USER" pm2 delete mythic-bastionland 2>/dev/null || true
sudo -u "$APP_USER" pm2 delete index              2>/dev/null || true

# Start app
sudo -u "$APP_USER" pm2 start "$APP_DIR/ecosystem.config.js"
sudo -u "$APP_USER" pm2 save

# Register with systemd for auto-start on reboot
PM2_STARTUP=$(sudo -u "$APP_USER" pm2 startup systemd -u "$APP_USER" --hp "$APP_HOME" 2>&1 | grep 'sudo env')
if [[ -n "$PM2_STARTUP" ]]; then
  eval "$PM2_STARTUP"
  success "PM2 registered with systemd (starts on reboot)"
else
  warn "Could not auto-register PM2 with systemd — run 'pm2 startup' manually if needed"
fi
success "PM2 running as $APP_USER"

# ── 8. Nginx — HTTP config (needed for ACME challenge) ────────────────────────
banner "Nginx (HTTP — needed for SSL verification)"
NGINX_CONF="/etc/nginx/conf.d/mythic-bastionland.conf"
WEBROOT="/var/www/certbot"
mkdir -p "$WEBROOT"

cat > "$NGINX_CONF" <<NGINXEOF
server {
    listen 80;
    server_name $DOMAIN;

    # ACME challenge root (Let's Encrypt domain verification)
    location /.well-known/acme-challenge/ {
        root $WEBROOT;
    }

    # Proxy everything else to Node
    location / {
        proxy_pass         http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade           \$http_upgrade;
        proxy_set_header   Connection        "upgrade";
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400;
        proxy_cache_bypass \$http_upgrade;
    }
}
NGINXEOF

nginx -t || die "Nginx config test failed — check $NGINX_CONF"
systemctl enable nginx
systemctl restart nginx
success "Nginx started (HTTP)"

# Confirm port 80 is reachable before asking Let's Encrypt to verify
info "Checking HTTP reachability on port 80…"
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "http://$DOMAIN/" || echo "000")
if [[ "$HTTP_STATUS" == "000" ]]; then
  echo
  echo -e "${RED}${BOLD}  ✗  Could not reach http://$DOMAIN/${NC}"
  echo -e "${YELLOW}  This almost always means the AWS Security Group is blocking port 80."
  echo -e "  Fix it before continuing:"
  echo -e "    EC2 Console → Instances → your instance → Security tab"
  echo -e "    → Edit inbound rules → Add: HTTP port 80 from 0.0.0.0/0"
  echo -e "    → Add: HTTPS port 443 from 0.0.0.0/0${NC}"
  echo
  read -rp "  Press Enter once you've opened the ports (or Ctrl-C to abort)…"
  # Re-check
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "http://$DOMAIN/" || echo "000")
  [[ "$HTTP_STATUS" != "000" ]] || die "Still unreachable. Fix the Security Group and re-run."
fi
success "Port 80 is reachable (HTTP $HTTP_STATUS)"

# ── 9. SSL certificate ────────────────────────────────────────────────────────
banner "SSL certificate (Let's Encrypt)"

info "Requesting certificate for $DOMAIN via webroot challenge…"
certbot certonly \
  --webroot \
  --webroot-path "$WEBROOT" \
  --non-interactive \
  --agree-tos \
  --email "$CERT_EMAIL" \
  -d "$DOMAIN"

success "Certificate issued for $DOMAIN"

# Now write the full HTTPS config ourselves (don't rely on certbot --nginx to patch it)
cat > "$NGINX_CONF" <<NGINXEOF
# Mythic Bastionland Mapper — managed by install.sh
# HTTP → HTTPS redirect
server {
    listen 80;
    server_name $DOMAIN;
    return 301 https://\$host\$request_uri;
}

# HTTPS
server {
    listen 443 ssl;
    http2  on;
    server_name $DOMAIN;

    ssl_certificate     /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;
    ssl_session_cache   shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security headers
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header X-Content-Type-Options    "nosniff"                                      always;
    add_header X-Frame-Options           "SAMEORIGIN"                                   always;
    add_header X-XSS-Protection          "1; mode=block"                                always;
    add_header Referrer-Policy           "strict-origin-when-cross-origin"              always;

    # Proxy to Node.js — Socket.io needs Upgrade/Connection headers
    location / {
        proxy_pass         http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade           \$http_upgrade;
        proxy_set_header   Connection        "upgrade";
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400;
        proxy_cache_bypass \$http_upgrade;
    }
}
NGINXEOF

nginx -t || die "HTTPS Nginx config test failed — check $NGINX_CONF"
systemctl reload nginx
success "HTTPS config active — HTTP auto-redirects to HTTPS"

# ── 10. Firewall ───────────────────────────────────────────────────────────────
banner "Firewall (firewalld)"
systemctl enable firewalld
systemctl start  firewalld

firewall-cmd --permanent --set-default-zone=public
firewall-cmd --permanent --add-service=ssh
firewall-cmd --permanent --add-service=http
firewall-cmd --permanent --add-service=https
# Block external direct access to Node port (loopback only)
firewall-cmd --permanent --add-rich-rule=\
"rule family='ipv4' port port='$PORT' protocol='tcp' source NOT address='127.0.0.1' reject" \
  2>/dev/null || true
firewall-cmd --reload
success "Firewall: SSH + 80 + 443 open; port $PORT locked to localhost"

# ── 11. SSL auto-renewal ──────────────────────────────────────────────────────
banner "SSL auto-renewal"
RENEW_HOOK="systemctl reload nginx"
# Try systemd timer first (AL2023), fall back to cron
if systemctl list-unit-files 2>/dev/null | grep -q 'certbot-renew.timer'; then
  systemctl enable --now certbot-renew.timer
  success "certbot-renew.timer enabled"
else
  (crontab -l 2>/dev/null; echo "17 3 * * * certbot renew --quiet --webroot --webroot-path $WEBROOT --post-hook '$RENEW_HOOK'") \
    | sort -u | crontab -
  success "Cron job added for daily SSL renewal at 03:17 UTC"
fi

# ── 12. Smoke test ────────────────────────────────────────────────────────────
banner "Smoke test"
sleep 2  # give nginx a moment after reload

FINAL_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 "https://$DOMAIN/" || echo "000")
if [[ "$FINAL_STATUS" == "200" ]]; then
  success "https://$DOMAIN/ returned HTTP 200 ✓"
else
  warn "https://$DOMAIN/ returned $FINAL_STATUS — check logs below"
  sudo -u "$APP_USER" pm2 logs mythic-bastionland --lines 20 --nostream || true
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════════════════╗"
echo -e "║   ✓  Mythic Bastionland Mapper is live!              ║"
echo -e "╚══════════════════════════════════════════════════════╝${NC}"
echo
echo -e "  ${BOLD}URL${NC}         https://$DOMAIN"
echo -e "  ${BOLD}App dir${NC}     $APP_DIR"
echo -e "  ${BOLD}Logs${NC}        pm2 logs mythic-bastionland"
echo -e "  ${BOLD}Status${NC}      pm2 status"
echo -e "  ${BOLD}Restart${NC}     pm2 restart mythic-bastionland"
echo
echo -e "  ${BOLD}Deploy an update:${NC}"
echo -e "  ${CYAN}cd $APP_DIR && sudo git pull"
echo -e "  cd client && npm install && npm run build && cd .."
echo -e "  pm2 restart mythic-bastionland${NC}"
echo
