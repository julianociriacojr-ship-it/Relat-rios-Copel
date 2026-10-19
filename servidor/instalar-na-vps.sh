#!/usr/bin/env bash
# Instala e liga a central de relatórios NA VPS, num comando só, baixando tudo do GitHub.
# Roda como root na VPS. Do computador do Juliano (Git Bash ou PowerShell), um comando:
#   ssh -i ~/.ssh/vps_bot root@169.58.19.125 "curl -fsSL https://raw.githubusercontent.com/julianociriacojr-ship-it/Relat-rios-Copel/main/servidor/instalar-na-vps.sh | bash -s -- central.169-58-19-125.sslip.io"
#
# Endereço grátis: sslip.io aponta "qualquer-coisa.169-58-19-125.sslip.io" para o IP 169.58.19.125
# sem cadastro nem DNS; o Caddy gera o HTTPS sozinho.
# Pode rodar de novo para atualizar o código: os dados e os usuários não são apagados.
set -euo pipefail
DOMINIO="${1:-central.169-58-19-125.sslip.io}"
RAW=https://raw.githubusercontent.com/julianociriacojr-ship-it/Relat-rios-Copel/main/servidor
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "== Baixando a central do GitHub"
curl -fsSL "$RAW/instalar-central.sh" -o "$TMP/instalar-central.sh"
for f in server.cjs usuarios.cjs painel.html; do curl -fsSL "$RAW/central/$f" -o "$TMP/$f"; done

echo "== Preparando (só o que é da central; os outros projetos não são tocados)"
bash "$TMP/instalar-central.sh" "$DOMINIO"

echo "== Instalando o código e ligando o serviço relatorios-central"
install -o relatorios -g relatorios -m 644 "$TMP/server.cjs" "$TMP/usuarios.cjs" "$TMP/painel.html" /home/relatorios/central/
systemctl restart relatorios-central
for i in 1 2 3 4 5; do curl -fsS http://127.0.0.1:3020/api/saude >/dev/null 2>&1 && break; sleep 1; done
systemctl is-active relatorios-central
curl -fsS http://127.0.0.1:3020/api/saude && echo

USU="sudo -u relatorios DADOS=/home/relatorios/dados node /home/relatorios/central/usuarios.cjs"
if ! $USU listar | grep -q '^juliano '; then
  echo "== Criando o seu acesso de administrador (anote a senha, ela aparece só agora)"
  $USU adicionar juliano admin "Juliano Ciriaco"
fi

echo "== Conferindo o HTTPS (o certificado pode levar até 1 minuto na primeira vez)"
for i in $(seq 1 20); do curl -fsS "https://$DOMINIO/api/saude" >/dev/null 2>&1 && { echo "   HTTPS ok"; break; }; sleep 3; done

echo
echo "== PRONTO. Painel do SAT: https://$DOMINIO"
echo "   Criar mais acessos (rode na VPS):  $USU adicionar USUARIO tecnico|sat|admin 'Nome'"
