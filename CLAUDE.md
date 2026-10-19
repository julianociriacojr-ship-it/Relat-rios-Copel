# CLAUDE.md: Módulo "Inspeção SAS (PEE Copel)" no app Solar Minas

## 1. Contexto

- Empresa: Solar Minas LTDA (Poços de Caldas, MG). Responsável técnico padrão: Juliano Ciriaco da Silva Junior.
- Projeto: PEE Comunidades Isoladas, Povos originários do litoral do Paraná. Contratante: Companhia Paranaense de Energia (Copel). Total de 218 moradias em 12 comunidades.
- Hoje o Relatório de Inspeção Técnica (1 por residência) é feito em Word, à mão, no escritório. O objetivo é gerar o relatório em campo, pelo celular, e exportar em .docx (e PDF depois) para ajuste posterior no computador.
- O relatório tem cerca de 90% de texto fixo. Varia só: capa (código, local, data), 3 fotos (mais extras opcionais), foto do checklist manuscrito e as Observações Técnicas.

## 2. App existente (não criar app novo)

URL: https://app-solar-minas.netlify.app/ (construído via artefatos no Claude, publicado no Netlify).

Visto na tela renderizada, sem acesso ao código-fonte:
- Menu inicial com 4 relatórios: RDO, Relatório de Visita Técnica (para orçamento), Relatório de Entrega de Serviço e OS Residencial (Aquecimento Solar).
- Formulários em seções numeradas, rascunho salvo no aparelho ("Continuar de onde parei" / "Começar novo"), botões "Tirar foto" e "Da galeria" com campo de comentário por foto, botão "Gerar PDF + Word", tema #0B4A5C, meta tags de app para iOS.

### Tarefa 0 (antes de codar)
Ler o código do app e responder:
1. Qual a stack e a estrutura (HTML único, framework, build)?
2. Existe service worker e manifest? O app abre sem internet?
3. Onde ficam os rascunhos e fotos (localStorage, IndexedDB)?
4. Como gera Word/PDF hoje e de onde vêm as bibliotecas (CDN ou local)?
5. Qual componente de foto e de rascunho pode ser reaproveitado?

Reaproveitar padrões, estilos e componentes do app. O módulo novo entra como 5º cartão do menu: **"Inspeção SAS (PEE Copel)"**. Não alterar os 4 módulos existentes.

## 3. Requisitos não funcionais

1. **Offline primeiro.** Uso em ilha, trilha e barco, sem sinal. O fluxo completo (preencher, fotografar, gerar .docx) deve funcionar em modo avião.
2. **Instalável (PWA)**: manifest e service worker com cache de todos os assets (HTML, JS, CSS, fontes, logo, bibliotecas). Nada de CDN em runtime. Bibliotecas ficam locais no repositório.
3. **Armazenamento em IndexedDB** para registros e fotos (Blob). Não usar localStorage para fotos (limite de ~5 MB). Chamar `navigator.storage.persist()`.
4. **Fotos**: capturar pela câmera (`input capture`), redimensionar no aparelho (lado maior ~1600 px, JPEG ~0,75). Foto do checklist manuscrito com resolução maior (lado maior ~2200 px) para manter legibilidade. Preservar proporção sempre.
5. **Rascunho automático** a cada alteração. Perder dados em campo não é aceitável.
6. **Exportação**: gerar .docx no aparelho. Entregar com Web Share API (arquivo) e fallback de download. Nome: `Relatorio_Visita_86204POE01.docx` (código completo da residência).
7. Interface mobile, botões grandes, uso com uma mão e com luz forte (alto contraste).
8. Sem login e sem sincronização nesta fase. Um aparelho por pessoa da equipe, dados locais.

## 4. Fluxo de telas

**Lista de inspeções** (tela inicial do módulo): cards com código, comunidade, data, status (Rascunho, Pronto, Exportado), botão "Nova inspeção", filtro por comunidade. Duplicar não é necessário.

**Formulário (5 passos)**

1. **Identificação**: comunidade (lista das 12 localidades da seção 6), número da residência (2 dígitos), código completo gerado automaticamente (ex.: `86204POE01`), data da inspeção (padrão: hoje, editável), responsável técnico (padrão: Juliano Ciriaco da Silva Junior, editável).
2. **Checklist manuscrito**: tirar foto do formulário de papel preenchido e assinado (a assinatura do responsável e do proprietário continua no papel). Foto obrigatória. Permitir refazer. Dica de enquadramento na tela ("pegue a folha inteira, sem sombra, na horizontal"). Sem assinatura digital no app.
3. **Fotos**: Figura 1 (frente da residência), Figura 2 (local da estaca) com ferramenta de **círculo vermelho** (toque e arraste para desenhar, desfazer, refazer), Figura 3 (estaca com o código escrito). Fotos adicionais opcionais com legenda livre (ex.: "Chuveiro"), numeradas em sequência (Figura 4 em diante).
4. **Observações técnicas**: chips por tema (seção 7) mais campo de texto livre. Mostrar a **prévia do texto final** que vai para o documento, editável.
5. **Revisão e exportar**: resumo, avisos de pendência (foto faltando, campo vazio) e botão "Gerar .docx". Permitir exportar com placeholder visível se faltar algo (ex.: `[INSERIR FOTO: frente da residência]`), nunca com imagem de outra residência.

## 5. Modelo de dados (sugestão)

```ts
Inspection {
  id: string
  communityId: string          // ver seção 6
  houseNumber: string          // "01"
  houseCode: string            // "86204POE01" (gerado)
  inspectionDate: string       // ISO
  technician: string           // padrão "Juliano Ciriaco da Silva Junior"
  docCode: string              // "SAC-RELAT.SM 22/07/26" (config, não é a data da inspeção)
  rev: string                  // "00"
  checklistPhoto: Blob
  photos: { frente: Blob, estaca: Blob, estacaMarcada: Blob }   // estaca com anotação do círculo
  extraPhotos: { blob: Blob, caption: string }[]
  observations: { chips: Record<string, string>, freeText: string, finalText: string }
  status: 'draft' | 'ready' | 'exported'
  createdAt, updatedAt: string
}
```

Guardar o círculo como anotação (coordenadas relativas) e também renderizar a imagem final com o círculo gravado.

## 6. Comunidades e códigos

| Município | Localidade | Moradias | Prefixo do código |
|---|---|---|---|
| Paranaguá | Ilha do Mel, Ponta Oeste | 24 | POE |
| Paranaguá | Ilha da Cotinga, Aldeia Pindoty | 17 | COT (relatório COT01) |
| Paranaguá | Ilha da Cotinga, Aldeia Tekuaty | 11 | TEK |
| Guaraqueçaba | Barra do Ararapira | 40 | BDA |
| Guaraqueçaba | Ararapira | 16 | ARA |
| Guaraqueçaba | Vila Fátima | 18 | VFA |
| Guaraqueçaba | Abacateiro | 6 | ABA |
| Guaraqueçaba | Vila Rita | 10 | VRI |
| Guaraqueçaba | Sibuí | 28 | SIB |
| Guaraqueçaba | Canudal | 13 | CAN |
| Guaraqueçaba | Barbados | 27 | BDS |
| Guaraqueçaba | Saco do Morro | 8 | SDM |
| | **Total** | **218** | |

- Código completo = `86204` + prefixo + número (ex.: `86204POE01`). O `86204` deve ser uma constante de configuração.
- Prefixos definidos em 19/10/2026 (Juliano: sem regra fixa, 3 letras práticas para escrever na estaca, sem repetir). POE e COT vêm dos relatórios já emitidos. Tabela editável em `inspecao-sas/config.js`. Não trocar depois da ida a campo: o código da casa e da estaca mudaria.
- O número da residência valida contra o total de moradias da comunidade.

## 7. Observações técnicas (chips e redação)

Primeiro parágrafo, **fixo**:

> Durante a visita técnica, foram inspecionados todos os pontos necessários para a instalação do Sistema de Aquecimento Solar (SAS), incluindo a verificação da orientação em relação ao norte, a definição do local mais adequado para instalação do reservatório térmico, priorizando sua proximidade ao banheiro, e a avaliação das condições das instalações hidráulicas existentes.

(Os relatórios POE01 e COT01 têm redações diferentes neste parágrafo. Usar a do COT01, mais recente, e deixar configurável.)

Segundo parágrafo, **gerado a partir dos chips**. Caso base, com redação já usada:

> Como observação técnica, verificou-se que o abastecimento de água fria destinado à alimentação do reservatório térmico é proveniente de poço, sendo necessária a utilização de sistema de bombeamento para garantir o fornecimento adequado de água ao sistema.

Chips a oferecer:
- Origem da água fria: poço / caixa d'água alta (central) / outra (campo livre)
- Bombeamento necessário: sim / não / a verificar
- Banheiro: existe / não existe
- Chuveiro: existe / não existe / **não foi possível verificar**
- Sombreamento sobre o local da estaca: sem sombreamento / parcial / total
- Terreno: estável / instável (campo livre)
- Proximidade da estaca ao banheiro: adequada / distante (campo livre)

Regras:
- Gerar frases curtas, no tom técnico e impessoal dos modelos, em terceira pessoa. Marcar no código que as frases dos chips fora do caso "poço + bombeamento" são **rascunhos de redação para validação do Juliano**.
- Item ilegível, em branco ou "não foi possível verificar": registrar fielmente. Nunca completar por suposição.
- O texto final é editável na tela antes de exportar.

## 8. Textos padrão (fixos, inserir exatamente assim)

**1. OBJETIVO**
Realizar a inspeção técnica da residência para verificar as condições necessárias à instalação do Sistema de Aquecimento Solar de Água (SAS), levantando as informações técnicas que servirão de base para o planejamento e execução da instalação, conforme as características específicas de cada unidade.

**2. MOTIVO DA VISITA**
A visita técnica foi realizada com a finalidade de avaliar as condições da residência para a implantação do Sistema de Aquecimento Solar de Água, verificando a infraestrutura existente, o ponto de alimentação de água fria, a existência e condição do banheiro e do chuveiro, a orientação geográfica (norte), o local previsto para instalação do sistema e demais aspectos que possam influenciar a execução dos serviços.

**3. DETALHE DA VISITA**
Durante a inspeção foram realizados o levantamento das condições da residência e o registro fotográfico dos principais pontos de interesse. Também foi efetuada a marcação do local previsto para instalação do sistema por meio de uma estaca identificada com o código da residência, indicando o ponto onde será executada a fundação do poste de sustentação do conjunto integrado. A orientação da estaca foi utilizada como referência para o posicionamento do coletor solar em relação ao norte, garantindo a correta instalação do sistema. As informações coletadas nesta inspeção servirão como base para o planejamento executivo e para a montagem do Sistema de Aquecimento Solar de Água.

**7. CONCLUSÃO**
Com base na inspeção realizada, conclui-se que as informações necessárias para o planejamento da instalação do Sistema de Aquecimento Solar de Água foram devidamente levantadas. O local de instalação foi definido e identificado em campo, permitindo o prosseguimento das etapas de execução, observadas as condições e eventuais recomendações registradas neste relatório. Se houver restrição relevante nas observações, acrescentar recomendação específica (campo opcional, vazio por padrão).

**Capa (campos)**: título "RELATÓRIO DE INSPEÇÃO TÉCNICA"; Código da Residência; Local (nome da localidade); Data da Inspeção (dd/mm/aaaa); Empresa: Solar Minas LTDA; Responsável Técnico.

**Rodapé final (cartão de contato)**: imagem `inspecao-sas/cartao-contato.png` (cartão de assinatura de Juliano Ciriaco, ENGENHEIRO CIVIL | CREA 389442-MG, orcamento@solarminas.com.br, (35) 9 9871-7328, +55 (35) 3713-1352, www.solarminas.com.br).

## 9. Layout do documento (.docx)

Estrutura e ordem **idênticas** aos modelos: Capa, Sumário, Índice de Ilustrações, 1 Objetivo, 2 Motivo da Visita, 3 Detalhe da Visita, 4 Checklist da Inspeção, 5 Registro Fotográfico, 6 Observações Técnicas, 7 Conclusão.

- Cabeçalho em **todas** as páginas: tabela de 3 células com logo | "RELATÓRIO DE VISITA" | código do documento (`SAC-RELAT.SM dd/mm/aa`) e `Rev.: 00`. Alinhados e idênticos.
- Rodapé "Página X de Y" em todas as páginas, com campos PAGE e NUMPAGES.
- Fonte única, 11 pt no corpo, texto justificado. Paleta laranja/vermelho do logo com moderação (títulos e filetes). Títulos numerados com espaçamento consistente.
- Capa com mais respiração e hierarquia: dados principais em destaque.
- Legendas **"Figura"** (nunca "Figure"), abaixo da imagem, numeração sequencial. Imagens centralizadas, proporção preservada, sem quebrar entre páginas. Evitar título de seção órfão no fim da página.
- Sumário e Índice de Ilustrações com número de página correto (campos TOC/PAGEREF ou paginação determinística com quebras de página fixas; testar abertura no Word). Se o texto das observações empurrar o documento para mais páginas, os números devem continuar corretos.
- Checklist: imagem da foto ocupando a largura útil da página, proporção preservada.
- Se faltar imagem: quadro com `[INSERIR FOTO: descrição]`.
- Biblioteca sugerida: `docx` (docx.js), empacotada localmente.

## 10. Regras gerais

- Nunca inventar dados (datas, nomes, fontes de água, resultados). Dado ausente vira placeholder visível: `[DATA DA INSPEÇÃO]`, `[NOME DO PROPRIETÁRIO]` etc.
- Não usar travessão longo nos textos gerados.
- Textos em português do Brasil, tom técnico, sóbrio e impessoal.
- Não copiar dados de outra residência ou comunidade.
- Não mudar a especificação do sistema (200 L, coletor 2,00 x 1,00 m, estrutura em alumínio).

## 11. Fases

**Fase 1 (MVP)**: módulo novo, lista de inspeções, 5 passos, foto do checklist, círculo na Figura 2, fotos extras, observações por chips, exportação .docx, funcionamento 100% offline, PWA instalável.
**Fase 2**: exportação em PDF, GPS capturado na foto da estaca (salvar latitude e longitude **com sinal**, ex.: -25,50 e -48,38 para Ilha do Mel), exportar vários relatórios de uma vez (.zip), e base para gerar o Memorial Descritivo por comunidade com a Tabela 1 de coordenadas.
**Fase 3**: sincronização entre aparelhos e painel das 218 moradias com status de inspeção.

## 12. Critérios de aceite da Fase 1

1. Em modo avião, após instalar o app com sinal uma vez: criar inspeção, tirar as fotos, desenhar o círculo, preencher observações e gerar o .docx.
2. Fechar e reabrir o app no meio do preenchimento não perde nada, inclusive fotos.
3. O .docx abre no Word com cabeçalho em todas as páginas, "Página X de Y", legendas "Figura", sumário e índice com páginas corretas.
4. Imagens sem distorção. Arquivo gerado com tamanho razoável para WhatsApp e e-mail (alvo abaixo de ~8 MB por relatório).
5. Nome do arquivo: `Relatorio_Visita_86204POExx.docx`.
6. Os 4 módulos existentes continuam funcionando como antes.
7. Teste em celular real (Android e iPhone, se a equipe usar os dois) antes de ir a campo.

## 13. Pontos em aberto (confirmar com o Juliano)

- Se `86204` é fixo para todo o projeto.
- Código completo (`86204POE01`) em todos os documentos, ou só `POE01` no relatório? Padrão adotado aqui: completo.
- Qual das duas redações do primeiro parágrafo das Observações vale (POE01 ou COT01).
- Data do código do documento (`22/07/26`): é data de emissão do modelo ou muda por relatório?
- Fotos extras (ex.: Chuveiro, como no COT01) ficam permitidas ou o relatório volta a ter só 3 figuras?
