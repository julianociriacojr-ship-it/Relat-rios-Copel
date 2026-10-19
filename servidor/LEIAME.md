# Central de relatórios (VPS)

O técnico gera a inspeção no app (offline). Com sinal, as inspeções **exportadas** sobem
sozinhas para a central: .docx, PDF e backup .zip (dados, fotos e coordenadas).
O SAT entra no painel, baixa o .docx, revisa a linguagem, sobe a versão revisada e marca
"Enviado ao cliente".

- `central/server.cjs`: servidor (só Node.js 20, sem dependências), porta 3020 em 127.0.0.1.
- `central/painel.html`: painel do SAT (login, filtros, downloads, revisão, status).
- `central/usuarios.cjs`: acessos (técnico, sat, admin), senhas com scrypt.
- `instalar-central.sh`: prepara a VPS **sem mexer nos outros projetos** (usuário, serviço,
  backup diário e um bloco novo no Caddy, validado antes de recarregar).
- `enviar-central.sh`: envia o código e reinicia só o serviço da central.
- `diagnostico-vps.sh`: só leitura, para conferir o servidor.

## Instalar ou atualizar (um comando, no computador do Juliano)

```bash
ssh -i ~/.ssh/vps_bot root@169.58.19.125 "curl -fsSL https://raw.githubusercontent.com/julianociriacojr-ship-it/Relat-rios-Copel/main/servidor/instalar-na-vps.sh | bash -s -- central.169-58-19-125.sslip.io"
```

Endereço grátis pelo sslip.io (sem cadastro nem DNS). O comando prepara a VPS, baixa o código do
GitHub, liga o serviço e cria o acesso `juliano` (admin), mostrando a senha uma vez.
Rodar de novo atualiza o código sem apagar dados.

## Instalar em partes (alternativa)

1. DNS: criar o endereço da central apontando para o IP da VPS (registro A), por exemplo
   `relatorios.solarminas.com.br -> 169.58.19.125`.
2. No computador do Juliano (Git Bash), na pasta do repositório:
   ```bash
   ssh -i ~/.ssh/vps_bot root@169.58.19.125 'bash -s' -- relatorios.solarminas.com.br < servidor/instalar-central.sh
   bash servidor/enviar-central.sh 169.58.19.125
   ```
3. Criar os acessos (a senha aparece na tela, uma vez):
   ```bash
   ssh -i ~/.ssh/vps_bot root@169.58.19.125 "cd /home/relatorios/central && sudo -u relatorios DADOS=/home/relatorios/dados node usuarios.cjs adicionar juliano admin 'Juliano Ciriaco'"
   ```
   Papéis: `tecnico` (envia e vê só as dele), `sat` e `admin` (veem tudo, revisam e mudam status).
4. No app: `inspecao-sas/config.js` → `central: { url: 'https://relatorios.solarminas.com.br' }` e publicar.

## Onde ficam os dados

`/home/relatorios/dados` (inspeções, usuários, chave dos logins) e backups diários em
`/home/relatorios/backups` (30 dias). Atualizar o código não apaga dados.

## Desfazer

```bash
systemctl disable --now relatorios-central relatorios-backup.timer
# tirar o bloco "Central de relatórios" do /etc/caddy/Caddyfile (há uma cópia .antes-relatorios-*) e: systemctl reload caddy
```
