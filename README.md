# Relatórios de Campo · Solar Minas

PWA estático publicado no **GitHub Pages** pelo workflow `.github/workflows/pages.yml`. A cada push na `main`, ele roda os testes e publica só os arquivos do site, sem build. Endereço: `https://julianociriacojr-ship-it.github.io/Relat-rios-Copel/`. A versão antiga no Netlify (`app-solar-minas.netlify.app`) não recebe mais atualizações.

| Arquivo | O que é |
|---|---|
| `index.html` | App original com os 4 módulos (RDO, Visita Técnica, Entrega, OS). Única mudança: o 5º cartão do menu. |
| `inspecao-sas.html` + `inspecao-sas/` | Módulo **Inspeção SAS (PEE Copel)**. |
| `vendor/` | docx 9.10 minificado (gerador do Word + estimador de paginação). Local, sem CDN. |
| `service-worker.js`, `manifest.json`, ícones | PWA. O cache inclui todos os arquivos do módulo novo. |
| `.github/workflows/pages.yml` | Testa e publica no GitHub Pages. |
| `CLAUDE.md` | Especificação do módulo. |

## Tarefa 0: leitura do app existente

1. **Stack**: HTML único (`index.html`, cerca de 420 KB, com logo em base64), JavaScript puro e CSS inline, sem framework nem build. As telas são `div.screen` alternadas por `showScreen()`.
2. **Service worker e manifest**: existem. O SW faz cache-first com atualização em segundo plano e pré-carrega só `index.html`, `manifest.json` e os ícones. As bibliotecas de CDN só ficam offline depois de terem sido baixadas uma vez com internet.
3. **Rascunhos e fotos**: usam `window.storage.get/set`, que é a API de armazenamento dos artefatos do Claude. **Ela não existe fora do claude.ai.** No Netlify todas as chamadas caem no `try/catch`, então os rascunhos dos 4 módulos provavelmente **não estão sendo salvos** no app publicado. As fotos ficam em memória como dataURL e entram no mesmo JSON do rascunho.
4. **Word/PDF**: jsPDF 2.5.1 (cdnjs) e docx 8.5.0 (jsdelivr), ambos por **CDN**. O Word é montado com helpers `wDocx*` e entregue por download, mais um botão de Web Share.
5. **Reaproveitado**: paleta e componentes visuais (`select-card`, `chip`, `photo-btn`, `btn-primary`, `footer-bar`, toast) e o padrão de compartilhamento (gerar primeiro, depois tocar em "Compartilhar"). O rascunho **não** foi reaproveitado por causa do item 3. Para não mexer nos 4 módulos, o módulo novo fica em página própria, com IndexedDB.

## Módulo Inspeção SAS

- **Offline**: tudo é servido do cache do SW. Abra o app uma vez com sinal e depois ele funciona em modo avião.
- **Dados**: IndexedDB `solarminas-inspecao-sas`, com registros em `inspections` e fotos (Blob) em `photos`. Salva a cada alteração (debounce de 350 ms) e também ao sair, bloquear a tela ou trocar de app. Pede `navigator.storage.persist()`.
- **Fotos**: redimensionadas no aparelho (lado maior 1600 px, JPEG 0,75; checklist 2200 px, JPEG 0,8). O círculo da Figura 2 é guardado como anotação relativa (`estacaCircles`) e também como imagem final (`estacaMarcada`).
- **.docx**: `inspecao-sas/report-docx.js`. Os números de página do Sumário, do Índice de Ilustrações e do "Página X de Y" são gravados pelo estimador do docx (`vendor/docx-layout.min.js`). Se ele não conseguir diagramar, o documento sai com os campos marcados para o Word atualizar ao abrir.
- **Configuração**: `inspecao-sas/config.js` (prefixos, `86204`, código do documento, textos fixos, contato).

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

- Prefixos de 10 comunidades estão `null` em `config.js`. Enquanto isso, o código sai como `86204[PREFIXO A CONFIRMAR]01` e a revisão avisa. Pindoty está como `COT`, conforme o relatório COT01, e Tekuaty não pode repetir `COT`.
- As frases dos chips fora do caso "poço + bombeamento" estão marcadas `RASCUNHO` em `observations.js`.
- 1º parágrafo das Observações: usa a redação do COT01 (`texts.observacoesP1`).
- Código do documento (`SAC-RELAT.SM 22/07/26`): fica fixo em `config.js` e é editável por inspeção em "Dados do documento".
- Fotos extras: estão ligadas (`allowExtraPhotos`).
