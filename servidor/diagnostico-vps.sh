#!/usr/bin/env bash
# Diagnóstico SOMENTE LEITURA da VPS, antes de instalar a central de relatórios.
# Não instala, não para, não reinicia e não altera nada. Só lista o que já existe,
# para a central entrar sem conflitar com os projetos que já funcionam.
# Uso:  bash diagnostico-vps.sh > diagnostico.txt 2>&1   (e mande o diagnostico.txt)
# Não mostra senhas nem chaves: lista só nomes de arquivos e portas.

sec(){ printf '\n===== %s =====\n' "$1"; }
has(){ command -v "$1" >/dev/null 2>&1; }

sec "Sistema"
cat /etc/os-release 2>/dev/null | grep -E '^(PRETTY_NAME|VERSION_ID)='
uname -m
echo "Usuário: $(whoami)"

sec "Recursos (memória, disco, CPU)"
free -h 2>/dev/null
df -h / /opt /srv /home 2>/dev/null | sort -u
nproc 2>/dev/null

sec "Portas em uso (TCP, escutando)"
if has ss; then ss -tlnp 2>/dev/null; elif has netstat; then netstat -tlnp 2>/dev/null; fi

sec "Proxy / servidor web"
for b in nginx caddy apache2 httpd traefik haproxy; do has "$b" && echo "instalado: $b ($($b -v 2>&1 | head -1))"; done
for s in nginx caddy apache2 traefik; do systemctl is-active "$s" >/dev/null 2>&1 && echo "ativo: $s"; done
ls -1 /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null
ls -1 /etc/caddy 2>/dev/null
# só os nomes de domínio configurados (sem o resto do arquivo)
grep -rhoE 'server_name[^;]+' /etc/nginx 2>/dev/null | sort -u
grep -rhoE '^[a-z0-9.*-]+\.[a-z]{2,}[^{]*\{' /etc/caddy 2>/dev/null | sort -u

sec "Docker"
if has docker; then
  docker --version
  docker compose version 2>/dev/null || docker-compose --version 2>/dev/null
  docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Status}}' 2>/dev/null
  docker network ls 2>/dev/null
else echo "docker não instalado"; fi

sec "Node / PM2"
has node && node -v
# pm2 ls só se o PM2 já estiver rodando (senão ele iniciaria o próprio daemon)
if has pm2 && pgrep -f "PM2 v" >/dev/null 2>&1; then pm2 ls 2>/dev/null; elif has pm2; then echo "pm2 instalado, daemon parado"; fi

sec "Serviços systemd em execução (não do sistema)"
systemctl list-units --type=service --state=running --no-pager 2>/dev/null | grep -vE 'systemd|dbus|ssh|cron|getty|rsyslog|polkit|udisks|networkd|resolved|snapd|multipathd|unattended|ModemManager|accounts-daemon|irqbalance|user@' | head -40

sec "Firewall"
has ufw && ufw status 2>/dev/null | head -20

sec "Certificados (Let's Encrypt)"
ls -1 /etc/letsencrypt/live 2>/dev/null

sec "Pastas de projetos"
ls -1 /opt /srv 2>/dev/null
echo; echo "Fim do diagnóstico. Nada foi alterado."
