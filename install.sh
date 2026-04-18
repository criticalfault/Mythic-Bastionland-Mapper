#!/usr/bin/env bash
# =============================================================================
#  Mythic Bastionland Mapper — Server Install Script
#  Tested on: Amazon Linux 2 & Amazon Linux 2023
#  Run as root: sudo bash install.sh
# =============================================================================
set -euo pipefail

# ── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
info()    { echo -e "${CYAN}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[ OK ]${NC}  $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
die()     { echo -e "${RED}[FAIL]${NC}  $*" >&2; exit 1; }
banner()  { echo -e "\n${CYAN}${BOLD}── $* ──────────────────────────────────────────────${NC}"; }

# ── 0. Pre-flight ─────────────────────────────────────────────────────────────
[[ $EUID -eq 0 ]] || die "Run as root:  sudo bash install.sh"

# Detect Amazon Linux version → choose package manager
if grep -q 'Amazon Linux 2023' /etc/os-release 2>/dev/null; then
  PKG="dnf"; AL_VER=2023
elif grep -q 'Amazon Linux' /etc/os-release 2>/dev/null; then
  PKG="yum"; AL_VER=2
else
  warn "Not Amazon Linux — assuming dnf (Fedora-compatible)"; PKG="dnf"; AL_VER=2023
fi
info "Detected Amazon Linux $AL_VER  (package manager: $PKG)"

# ── 1. Collect config ─────────────────────────────────────────────────────────
echo
echo -e "${CYAN}${BOLD}╔══════════════════════════════════════════════════════╗"
echo -e "║    Mythic Bastionland Mapper — Server Setup          ║"
echo -e "╚══════════════════════════════════════════════════════╝${NC}"
echo
echo -e "${YELLOW}Make sure your domain's DNS A-record already points to this"
echo -e "server's public IP before continuing (needed for SSL).${NC}"
echo

read -rp "  Git repo URL (SSH or HTTPS): " REPO_URL
[[ -n "$REPO_URL" ]] || die "Repo URL is required"

read -rp "  Domain name (e.g. map.example.com): " DOMAIN
[[ -n "$DOMAIN" ]] || die "Domain is required"

read -rp "  Email for SSL certificate (Let's Encrypt): " CERT_EMAIL
[[ -n "$CERT_EMAIL" ]] || die "Email is required"

read -rp "  GM_UID (Firebase UID, or leave blank to skip): " GM_UID

APP_DIR="/opt/mythic-bastionland"
APP_USER="mbm"
PORT=3000

echo
info "Install dir : $APP_DIR"
info "System user : $APP_USER"
info "Node port   : $PORT (internal only — Nginx proxies 443 → $PORT)"
echo
read -rp "Press Enter to start, or Ctrl-C to abort…"

# ── 2. System packages ────────────────────────────────────────────────────────
banner "System packages"

info "Updating system…"
$PKG update -y -q

info "Installing base packages…"
$PKG install -y git nginx firewalld python3 python3-pip

# Node.js 20 LTS via NodeSource
if ! command -v node &>/dev/null || [[ "$(node -e 'process.stdout.write(process.version.split(\".\")[0].slice(1))')" -lt 18 ]]; then
  info "Installing Node.js 20 LTS…"
  curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
  $PKG install -y nodejs
fi
success "Node $(node --version)  /  npm $(npm --version)"

# PM2
if ! command -v pm2 &>/dev/null; then
  info "Installing PM2…"
  npm install -g pm2
fi
success "PM2 $(pm2 --version)"

# Certbot
info "Installing Certbot…"
if [[ $AL_VER -eq 2023 ]]; then
  # AL2023 ships Python 3 — use pip in an isolated venv
  python3 -m venv /opt/certbot
  /opt/certbot/bin/pip install --quiet --upgrade pip certbot certbot-nginx
  ln -sf /opt/certbot/bin/certbot /usr/local/bin/certbot
else
  # Amazon Linux 2 — use EPEL + yum
  amazon-linux-extras install epel -y 2>/dev/null || $PKG install -y epel-release
  $PKG install -y certbot python2-certbot-nginx || \
    $PKG install -y certbot python3-certbot-nginx
fi
success "Certbot $(certbot --version 2>&1 | head -1)"

# ── 3. Dedicated app user ─────────────────────────────────────────────────────
banner "App user"
if ! id "$APP_USER" &>/dev/null; then
  useradd --system --home-dir "$APP_DIR" --shell /sbin/nologin "$APP_USER"
  success "Created user '$APP_USER'"
else
  info "User '$APP_USER' already exists — skipping"
fi

# ── 4. Clone / update repo ────────────────────────────────────────────────────
banner "Repository"
if [[ -d "$APP_DIR/.git" ]]; then
  info "Repo already present — pulling latest…"
  git -C "$APP_DIR" pull
else
  info "Cloning $REPO_URL → $APP_DIR"
  git clone "$REPO_URL" "$APP_DIR"
fi
chown -R "$APP_USER":"$APP_USER" "$APP_DIR"
success "Repository ready"

# ── 5. Firebase service account ───────────────────────────────────────────────
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
    success "service-account.json saved (mode 600)"
  else
    warn "Pasted content is not valid JSON — saving anyway; fix manually at $SA_FILE"
    echo "$SA_JSON" > "$SA_FILE"
    chmod 600 "$SA_FILE"
    chown "$APP_USER":"$APP_USER" "$SA_FILE"
  fi
fi

# ── 6. Environment file ───────────────────────────────────────────────────────
banner "Environment (.env)"
ENV_FILE="$APP_DIR/.env"
cat > "$ENV_FILE" <<EOF
PORT=$PORT
GM_UID=$GM_UID
NODE_ENV=production
EOF
chmod 600 "$ENV_FILE"
chown "$APP_USER":"$APP_USER" "$ENV_FILE"
success ".env written (mode 600)"

# ── 7. Install deps & build ───────────────────────────────────────────────────
banner "Dependencies & build"

info "Installing server dependencies…"
sudo -u "$APP_USER" bash -c "cd '$APP_DIR' && npm install --omit=dev"

info "Installing client dependencies…"
# Must include devDeps (vite, etc.) for the build step
sudo -u "$APP_USER" bash -c "cd '$APP_DIR/client' && npm install"

info "Building client…"
sudo -u "$APP_USER" bash -c "cd '$APP_DIR/client' && npm run build"

# Ensure saves directory exists and is writable by app user
mkdir -p "$APP_DIR/server/saves"
chown -R "$APP_USER":"$APP_USER" "$APP_DIR/server/saves"

success "Build complete"

# ── 8. PM2 ───────────────────────────────────────────────────────────────────
banner "PM2 process manager"

mkdir -p /var/log/mbm
chown "$APP_USER":"$APP_USER" /var/log/mbm

cat > "$APP_DIR/ecosystem.config.js" <<EOF
module.exports = {
  apps: [{
    name:             'mythic-bastionland',
    script:           'server/index.js',
    cwd:              '$APP_DIR',
    restart_delay:    3000,
    max_restarts:     10,
    watch:            false,
    error_file:       '/var/log/mbm/error.log',
    out_file:         '/var/log/mbm/out.log',
    log_date_format:  'YYYY-MM-DD HH:mm:ss',
  }],
};
EOF
chown "$APP_USER":"$APP_USER" "$APP_DIR/ecosystem.config.js"

# Start / restart app
if sudo -u "$APP_USER" pm2 list | grep -q 'mythic-bastionland'; then
  sudo -u "$APP_USER" pm2 restart mythic-bastionland
else
  sudo -u "$APP_USER" pm2 start "$APP_DIR/ecosystem.config.js"
fi
sudo -u "$APP_USER" pm2 save

# Register pm2 to start on boot
PM2_STARTUP=$(sudo -u "$APP_USER" pm2 startup systemd -u "$APP_USER" --hp "$APP_DIR" | grep 'sudo')
[[ -n "$PM2_STARTUP" ]] && eval "$PM2_STARTUP"
success "PM2 running and registered for auto-start"

# ── 9. Nginx (HTTP — temporary, certbot will upgrade to HTTPS) ────────────────
banner "Nginx"
NGINX_CONF="/etc/nginx/conf.d/mythic-bastionland.conf"
mkdir -p /var/www/certbot

cat > "$NGINX_CONF" <<NGINXEOF
# Mythic Bastionland Mapper — managed by install.sh
server {
    listen 80;
    server_name $DOMAIN;

    # ACME challenge for Let's Encrypt
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    # Everything else → Node.js (Socket.io needs Upgrade headers)
    location / {
        proxy_pass          http://127.0.0.1:$PORT;
        proxy_http_version  1.1;
        proxy_set_header    Upgrade           \$http_upgrade;
        proxy_set_header    Connection        "upgrade";
        proxy_set_header    Host              \$host;
        proxy_set_header    X-Real-IP         \$remote_addr;
        proxy_set_header    X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header    X-Forwarded-Proto \$scheme;
        proxy_read_timeout  86400;
        proxy_cache_bypass  \$http_upgrade;
    }
}
NGINXEOF

nginx -t
systemctl enable nginx
systemctl restart nginx
success "Nginx running (HTTP only for now)"

# ── 10. SSL via Let's Encrypt ─────────────────────────────────────────────────
banner "SSL certificate"
info "Requesting certificate for $DOMAIN…"
certbot --nginx \
  --non-interactive \
  --agree-tos \
  --email "$CERT_EMAIL" \
  -d "$DOMAIN" \
  --redirect

# Security headers snippet
cat > /etc/nginx/snippets/security-headers.conf <<'HDRS'
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
add_header X-Content-Type-Options    "nosniff"                                      always;
add_header X-Frame-Options           "SAMEORIGIN"                                   always;
add_header X-XSS-Protection          "1; mode=block"                                always;
add_header Referrer-Policy           "strict-origin-when-cross-origin"              always;
HDRS

# Splice snippet into HTTPS server block if certbot hasn't already
grep -q 'security-headers' "$NGINX_CONF" || \
  sed -i "s|server_name $DOMAIN;|server_name $DOMAIN;\n    include /etc/nginx/snippets/security-headers.conf;|g" "$NGINX_CONF"

nginx -t && systemctl reload nginx
success "HTTPS enabled with auto-redirect"

# ── 11. Firewall ──────────────────────────────────────────────────────────────
banner "Firewall"
systemctl enable firewalld
systemctl start  firewalld

firewall-cmd --permanent --set-default-zone=public
firewall-cmd --permanent --add-service=ssh
firewall-cmd --permanent --add-service=http
firewall-cmd --permanent --add-service=https
# Block direct external access to Node port — only loopback allowed
firewall-cmd --permanent --add-rich-rule=\
"rule family='ipv4' port port='$PORT' protocol='tcp' source NOT address='127.0.0.1' reject"
firewall-cmd --reload

success "Firewall: SSH + 80 + 443 open; port $PORT locked to localhost"

# ── 12. SSL auto-renewal ─────────────────────────────────────────────────────
banner "Auto-renewal"
# Use systemd timer if available, else fall back to cron
if systemctl list-timers 2>/dev/null | grep -q certbot; then
  systemctl enable certbot-renew.timer
  success "certbot-renew.timer enabled"
else
  # Cron: renew at 03:17 daily (offset to avoid Let's Encrypt peak load)
  (crontab -l 2>/dev/null; echo "17 3 * * * certbot renew --quiet --post-hook 'systemctl reload nginx'") \
    | sort -u | crontab -
  success "Cron job added for daily SSL renewal"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════════════════╗"
echo -e "║   ✓  Mythic Bastionland Mapper is live!              ║"
echo -e "╚══════════════════════════════════════════════════════╝${NC}"
echo
echo -e "  ${BOLD}URL${NC}          https://$DOMAIN"
echo -e "  ${BOLD}App dir${NC}      $APP_DIR"
echo -e "  ${BOLD}Logs${NC}         sudo -u $APP_USER pm2 logs mythic-bastionland"
echo -e "  ${BOLD}Status${NC}       sudo -u $APP_USER pm2 status"
echo -e "  ${BOLD}Restart${NC}      sudo -u $APP_USER pm2 restart mythic-bastionland"
echo
echo -e "  ${BOLD}Deploy update:${NC}"
echo -e "  ${CYAN}cd $APP_DIR && git pull && \\"
echo -e "  sudo -u $APP_USER bash -c 'cd $APP_DIR/client && npm install && npm run build' && \\"
echo -e "  sudo -u $APP_USER pm2 restart mythic-bastionland${NC}"
echo
