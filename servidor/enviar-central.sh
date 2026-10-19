#!/usr/bin/env bash
# Envia o código da central para a VPS e reinicia SÓ o serviço dela.
# Roda no computador do Juliano (Git Bash), na pasta do repositório:
#   bash servidor/enviar-central.sh 169.58.19.125
# Vai: servidor/central (código e painel). NÃO vai e NÃO é apagado: os dados
# (inspeções, usuários, segredo), que ficam em /home/relatorios/dados.
set -euo pipefail
IP="${1:?Uso: bash servidor/enviar-central.sh IP_DA_VPS}"
CHAVE="$HOME/.ssh/vps_bot"
SSH="ssh -i $CHAVE -o StrictHostKeyChecking=accept-new root@$IP"
PROJETO=relatorios
cd "$(dirname "$0")/central"

echo "== Empacotando a central"
PACOTE="$(mktemp -d)/central.tgz"
tar czf "$PACOTE" --exclude=dados --exclude=node_modules .

echo "== Enviando"
scp -i "$CHAVE" -o StrictHostKeyChecking=accept-new "$PACOTE" "root@$IP:/tmp/central.tgz"

echo "== Instalando e reiniciando só o serviço $PROJETO-central"
$SSH "set -e
  tar xzf /tmp/central.tgz -C /home/$PROJETO/central && rm /tmp/central.tgz
  chown -R $PROJETO:$PROJETO /home/$PROJETO/central
  systemctl restart $PROJETO-central
  sleep 2
  systemctl is-active $PROJETO-central
  curl -fsS http://127.0.0.1:3020/api/saude && echo"

echo "== Central no ar. Criar acessos (exemplos, rode na VPS):"
echo "   $SSH \"cd /home/$PROJETO/central && sudo -u $PROJETO DADOS=/home/$PROJETO/dados node usuarios.cjs adicionar juliano admin 'Juliano Ciriaco'\""
echo "   (troque por: NOME_DE_USUARIO  tecnico|sat|admin  'Nome da pessoa'; a senha aparece na tela)"
echo "   Ver o que está acontecendo: $SSH journalctl -u $PROJETO-central -f -o cat"
