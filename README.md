# Relatórios de Campo · Solar Minas

PWA estático publicado no **GitHub Pages** pelo workflow `.github/workflows/pages.yml`. A cada push na `main`, ele roda os testes e publica só os arquivos do site, sem build. Endereço: `https://julianociriacojr-ship-it.github.io/Relat-rios-Copel/`. A versão antiga no Netlify (`app-solar-minas.netlify.app`) não recebe mais atualizações.

| Arquivo | O que é |
|---|---|
| `index.html` | App original com os 4 módulos (RDO, Visita Técnica, Entrega, OS). Única mudança: o 5º cartão do menu. |
| `inspecao-sas.html` + `inspecao-sas/` | Módulo **Inspeção SAS (PEE Copel)**. |
| `vendor/` | docx 9.10 minificado (gerador do Word + estimador de paginação) e jsPDF 4.2 (PDF). Local, sem CDN. |
| `service-worker.js`, `manifest.json`, ícones | PWA. O cache inclui todos os arquivos do módulo novo. |
| `.github/workflows/pages.yml` | Testa e publica no GitHub Pages. |
| `CLAUDE.md` | Especificação do módulo. |

## Tarefa 0: leitura do app existente

1. **Stack**: HTML único (`index.html`, cerca de 420 KB, com logo em base64), JavaScript puro e CSS inline, sem framework nem build. As telas são `div.screen` alternadas por `showScreen()`.
2. **Service worker e manifest**: existem. O SW faz cache-first com atualização em segundo plano e pré-carrega só `index.html`, `manifest.json` e os ícones. As bibliotecas de CDN só ficam offline depois de terem sido baixadas uma vez com internet.
3. **Rascunhos e fotos**: usam `window.storage.get/set`, que é a API de armazenamento dos artefatos do Claude. **Ela não existe fora do claude.ai.** No Netlify todas as chamadas caem no `try/catch`, então os rascunhos dos 4 módulos provavelmente **não estão sendo salvos** no app publicado. As fotos ficam em memória como dataURL e entram no mesmo JSON do rascunho.
4. **Word/PDF**: jsPDF 2.5.1 (cdnjs) e docx 8.5.0 (jsdelivr), ambos por **CDN** (hoje locais, ver abaixo). O Word é montado com helpers `wDocx*` e entregue por download, mais um botão de Web Share.
5. **Reaproveitado**: paleta e componentes visuais (`select-card`, `chip`, `photo-btn`, `btn-primary`, `footer-bar`, toast) e o padrão de compartilhamento (gerar primeiro, depois tocar em "Compartilhar"). O rascunho **não** foi reaproveitado por causa do item 3. Para não mexer nos 4 módulos, o módulo novo fica em página própria, com IndexedDB.

## Módulo Inspeção SAS

- **Offline**: tudo é servido do cache do SW. Abra o app uma vez com sinal e depois ele funciona em modo avião.
- **Dados**: IndexedDB `solarminas-inspecao-sas`, com registros em `inspections` e fotos (Blob) em `photos`. Salva a cada alteração (debounce de 350 ms) e também ao sair, bloquear a tela ou trocar de app. Pede `navigator.storage.persist()`.
- **Fotos**: padrão horizontal 16:9 (cada foto na largura útil, duas por página; o app avisa se chegar foto em pé). Redimensionadas no aparelho (lado maior 1600 px, JPEG 0,75; checklist 2200 px, JPEG 0,8). O círculo da Figura 2 é guardado como anotação relativa (`estacaCircles`) e também como imagem final (`estacaMarcada`).
- **.docx**: `inspecao-sas/report-docx.js`. Os números de página do Sumário, do Índice de Ilustrações e do "Página X de Y" são gravados pelo estimador do docx (`vendor/docx-layout.min.js`). Se ele não conseguir diagramar, o documento sai com os campos marcados para o Word atualizar ao abrir.
- **PDF**: `inspecao-sas/report-pdf.js` gera o PDF com a mesma estrutura do .docx. Como a paginação é feita no próprio gerador, o sumário e o índice saem com as páginas exatas. O botão "Gerar e baixar .docx + PDF" baixa os dois arquivos na hora; os botões "Baixar" abrem a janela "Salvar como" no Chrome/Edge do computador.
- **Configuração**: `inspecao-sas/config.js` (prefixos, `86204`, código do documento, textos fixos, contato).

## Os 4 relatórios antigos (RDO, Visita, Entrega, OS)

O preenchimento e os documentos continuam iguais. Mudou só o que fica por trás:

- **Rascunho**: `vendor/storage-shim.js` cria o `window.storage` que o `index.html` espera e grava no IndexedDB do aparelho (`solarminas-rascunhos`). Dentro do Claude, onde a API já existe, não troca nada.
- **Sem internet**: jsPDF 2.5.1 e docx 8.5.0 (as mesmas versões de antes) ficam em `vendor/legado/` e entram no cache do service worker.
- **Central**: o PDF continua só no celular (gerar e compartilhar no WhatsApp). O botão ☁️ do rodapé (no lugar do antigo 📝 Word) monta o Word e manda para a central (`legado/central-legado.js`); sem sinal, fica numa fila no aparelho (`solarminas-envios`) e sobe sozinho depois. Pede login na primeira vez (o mesmo da Inspeção SAS). Gerar de novo o mesmo arquivo (mesma obra e data) atualiza o registro na central.
- **Inspeção SAS**: "Gerar e baixar .docx + PDF + backup" continua igual. O envio para a central é opcional, pelo botão "☁️ Enviar para a central" (vai o Word e o backup .zip). Depois de enviada, se a inspeção mudar, a versão nova sobe sozinha.
- **Painel do SAT**: só baixar. O SAT baixa o Word, ajusta e manda ao cliente por conta própria; nada volta revisado para a central. Filtro por tipo de relatório.

## Coordenadas, backup e memorial

- **GPS da estaca** (passo 3): captura ao vivo com a precisão em metros (funciona sem internet), leitura do GPS gravado na foto da galeria ou digitação. Grava latitude e longitude com sinal (WGS 84). Avisa quando a coordenada sai do litoral do Paraná ou parece trocada.
- **Backup (.zip)**: `inspecao-sas/backup.js`. Sai junto com o .docx e o PDF de cada inspeção e também pela lista ("Backup da comunidade" ou "de tudo"). Contém dados, coordenadas, círculo e fotos. "Restaurar backup" devolve tudo sem apagar nada: entra o que é novo e só substitui o que for mais recente. Serve também para juntar inspeções de colegas num aparelho. A lista avisa quais inspeções mudaram desde o último backup.
- **Memorial descritivo por comunidade**: `inspecao-sas/report-memorial.js` com textos em `inspecao-sas/memorial-config.js` (transcritos do modelo rev00) e imagens em `inspecao-sas/memorial/`. A Tabela 1 lista todas as moradias da comunidade com as coordenadas das inspeções no aparelho; as que faltam saem como [PENDENTE]. Os textos de transporte e acesso são os mesmos para todas as comunidades (`padrao` em `memorial-config.js`); muda só o nome. Na lista, escolha a comunidade no filtro e toque em "Memorial descritivo".
- **Imagem aérea**: na tela do memorial, "Pontos para o Google Earth (.kml)" exporta as estacas. Abra no Google Earth, salve a imagem com as casas marcadas e use "Trocar mapa".

## Desenvolvimento

```bash
npm install
npm run vendor   # regenera vendor/ a partir do pacote docx
npm test         # gera relatórios de exemplo em tests/out/ e valida a estrutura
python3 -m http.server 8765   # abrir http://localhost:8765/
```

Na publicação, o workflow troca `CACHE_NAME` pelo commit publicado, então os celulares pegam a versão nova sozinhos, sem editar nada à mão. Na primeira abertura com internet depois de uma publicação, o app ainda mostra a versão anterior; na seguinte, já mostra a nova.

### Ativar o GitHub Pages (uma vez)

1. A branch `main` precisa existir com este código.
2. No GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Em **Actions → Publicar no GitHub Pages**, rode o workflow (ou faça um push na `main`).

A equipe precisa instalar o app de novo pelo endereço novo (Chrome: menu → Instalar app; iPhone/Safari: Compartilhar → Adicionar à Tela de Início). Os dados salvos no celular ficam presos ao endereço onde foram criados.

## Pendências (confirmar com o Juliano)

- Prefixos de todas as comunidades definidos em 19/10/2026 em `config.js` (POE, COT, TEK, BDA, ARA, VFA, ABA, VRI, SIB, CAN, BDS, SDM). Não trocar depois de escrever as estacas.
- Código: relatório, estaca e arquivos usam prefixo + número (`POE01`); o memorial usa o registro completo `86204POE01` na Tabela 1.
- As frases dos chips fora do caso "poço + bombeamento" estão marcadas `RASCUNHO` em `observations.js`.
- 1º parágrafo das Observações: usa a redação do COT01 (`texts.observacoesP1`).
- Código do documento (`SAC-RELAT.SM 22/07/26`): fica fixo em `config.js` e é editável por inspeção em "Dados do documento".
- Fotos extras: estão ligadas (`allowExtraPhotos`).
