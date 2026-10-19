#!/usr/bin/env bash
# Instala a CENTRAL DE RELATÓRIOS na VPS, ao lado dos projetos que já existem.
# Roda UMA vez, como root, na VPS. Do computador do Juliano (Git Bash):
#   ssh -i ~/.ssh/vps_bot root@169.58.19.125 'bash -s' -- relatorios.solarminas.com.br < servidor/instalar-central.sh
#
# O que faz (e só isso):
#   - usuário Linux "relatorios" com pastas próprias (código, dados e backups)
#   - serviço "relatorios-central" na porta 3020, só para dentro da VPS (127.0.0.1)
#   - backup diário dos dados (03:30, guarda 30 dias)
#   - um bloco NOVO no Caddyfile para o endereço da central (HTTPS automático)
# O que NÃO faz: apt/upgrade, firewall, SSH, fuso, nem reinicia outros serviços.
# O Caddy é RECARREGADO (sem derrubar os outros sites) só depois de validar a
# configuração; se a validação falhar, o Caddyfile volta como estava.
set -euo pipefail

DOMINIO="${1:?Uso: ... 'bash -s' -- ENDERECO_DA_CENTRAL   (ex.: relatorios.solarminas.com.br)}"
PROJETO=relatorios
PORTA=3020
CASA=/home/$PROJETO
CADDYFILE=/etc/caddy/Caddyfile
ORIGEM_APP=https://julianociriacojr-ship-it.github.io

falha(){ echo "PAROU: $*" >&2; exit 1; }

echo "== Conferências antes de mexer em qualquer coisa"
command -v node >/dev/null || falha "Node.js não encontrado."
node -v | grep -q '^v2[0-9]' || falha "Node.js 20+ necessário (achei $(node -v))."
if ss -ltn | awk '{print $4}' | grep -qE "[:.]$PORTA\$"; then
  if ! systemctl is-active --quiet "$PROJETO-central"; then falha "Porta $PORTA já está em uso por outro programa."; fi
fi
systemctl is-active --quiet caddy || falha "O serviço 'caddy' não está ativo. Não vou mexer no proxy: me mande 'systemctl status caddy'."
[ -f "$CADDYFILE" ] || falha "Não achei $CADDYFILE."
systemctl cat caddy | grep -q -- "--config $CADDYFILE" || falha "O Caddy não usa $CADDYFILE (configurado de outro jeito). Não vou mexer: me mande 'systemctl cat caddy'."
command -v caddy >/dev/null || falha "Comando caddy não encontrado."

echo "== Usuário e pastas do projeto ($PROJETO)"
id "$PROJETO" >/dev/null 2>&1 || useradd --create-home --shell /bin/bash "$PROJETO"
mkdir -p "$CASA/central" "$CASA/dados" "$CASA/backups"
chown -R "$PROJETO:$PROJETO" "$CASA/central" "$CASA/dados" "$CASA/backups"
chmod 750 "$CASA/dados" "$CASA/backups"

echo "== Serviço $PROJETO-central (porta $PORTA, só interna)"
cat > "/etc/systemd/system/$PROJETO-central.service" <<EOF
[Unit]
Description=Central de relatórios Solar Minas
After=network-online.target
Wants=network-online.target

[Service]
User=$PROJETO
WorkingDirectory=$CASA/central
ExecStart=/usr/bin/env node server.cjs
Environment=NODE_ENV=production
Environment=PORTA=$PORTA
Environment=DADOS=$CASA/dados
Environment=ORIGENS=$ORIGEM_APP
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=$CASA/dados

[Install]
WantedBy=multi-user.target
EOF

echo "== Backup diário dos dados (03:30, guarda 30 dias em $CASA/backups)"
cat > "/etc/systemd/system/$PROJETO-backup.service" <<EOF
[Unit]
Description=Backup dos dados da central de relatórios

[Service]
Type=oneshot
User=$PROJETO
ExecStart=/bin/bash -c 'tar czf $CASA/backups/dados-\$(date +%%Y-%%m-%%d).tgz -C $CASA dados && find $CASA/backups -name "dados-*.tgz" -mtime +30 -delete'
EOF
cat > "/etc/systemd/system/$PROJETO-backup.timer" <<EOF
[Unit]
Description=Backup diário da central de relatórios

[Timer]
OnCalendar=*-*-* 03:30:00
Persistent=true

[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable "$PROJETO-central" >/dev/null
systemctl enable --now "$PROJETO-backup.timer" >/dev/null

echo "== Caddy: endereço $DOMINIO -> 127.0.0.1:$PORTA"
if grep -qF "$DOMINIO" "$CADDYFILE"; then
  echo "   $DOMINIO já está no Caddyfile; não alterei."
else
  COPIA="$CADDYFILE.antes-relatorios-$(date +%Y%m%d-%H%M%S)"
  cp -p "$CADDYFILE" "$COPIA"
  cat >> "$CADDYFILE" <<EOF

# Central de relatórios Solar Minas (adicionado por servidor/instalar-central.sh)
$DOMINIO {
	encode gzip
	request_body {
		max_size 100MB
	}
	reverse_proxy 127.0.0.1:$PORTA
}
EOF
  if ! caddy validate --config "$CADDYFILE" --adapter caddyfile >/tmp/caddy-validate.log 2>&1; then
    cp -p "$COPIA" "$CADDYFILE"
    cat /tmp/caddy-validate.log >&2
    falha "Configuração do Caddy inválida. O Caddyfile voltou como estava ($COPIA)."
  fi
  systemctl reload caddy
  echo "   Bloco adicionado e Caddy recarregado. Cópia do anterior: $COPIA"
fi

echo
echo "== Pronto. Próximo passo (no computador do Juliano):"
echo "   bash servidor/enviar-central.sh 169.58.19.125"
echo "   Lembrete: o endereço $DOMINIO precisa apontar para o IP desta VPS para o HTTPS funcionar."
