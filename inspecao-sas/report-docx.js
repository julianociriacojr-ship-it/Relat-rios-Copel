/* ======================================================================
   INSPEÇÃO SAS — GERAÇÃO DO .DOCX (docx.js local, sem rede)
   buildReport(data) -> Promise<Blob|Buffer>
   data = {
     inspection,                       // registro salvo (sem blobs)
     images: { checklist, frente, estaca, estacaCodigo, extras: [{...img, caption}] },
     logo,                             // img
     outputType: 'blob' | 'nodebuffer'
   }
   img = { data: Uint8Array|ArrayBuffer, width, height, type: 'jpg'|'png' } ou null
====================================================================== */
(function(root){
  const CFG = root.SAS_CONFIG || require('./config.js');
  const OBS = root.SAS_OBS || require('./observations.js');

  const FONT = 'Calibri';
  const COLOR_TITLE = 'C2410C';   // laranja escuro do logo
  const COLOR_RULE = 'E8912D';    // âmbar do logo
  const COLOR_INK = '1B2226';
  const COLOR_SOFT = '5B6A70';

  // A4, margens: esq. 3 cm, dir. 2 cm, sup. 2,5 cm, inf. 2 cm
  const CM = 567; // twips por cm
  const PAGE = { w: 21 * CM, h: 29.7 * CM, top: 2.5 * CM, bottom: 2 * CM, left: 3 * CM, right: 2 * CM };
  const PX_PER_CM = 96 / 2.54;
  const CONTENT_W_CM = 16;
  const PHOTO_BOX = { w: 15 * PX_PER_CM, h: 10.5 * PX_PER_CM };
  const CHECKLIST_BOX = { w: CONTENT_W_CM * PX_PER_CM, h: 19 * PX_PER_CM };

  function fmtDate(iso){
    if (!iso) return '[DATA DA INSPEÇÃO]';
    const [y, m, d] = String(iso).slice(0, 10).split('-');
    return (y && m && d) ? `${d}/${m}/${y}` : '[DATA DA INSPEÇÃO]';
  }
  function fit(img, box){
    const r = Math.min(box.w / img.width, box.h / img.height, 1e9);
    return { width: Math.round(img.width * r), height: Math.round(img.height * r) };
  }
  const t = s => OBS.noLongDash(s);

  async function buildReport({ inspection: insp, images, logo, card, outputType }){
    const D = root.docx || require('docx');
    const {
      Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, WidthType,
      AlignmentType, BorderStyle, Header, Footer, PageNumber, TableOfContents, SequentialIdentifier,
      HeadingLevel, VerticalAlign, TableLayoutType, HeightRule, Bookmark, PageReference, TabStopType, LeaderType, Tab, LineRuleType
    } = D;

    const community = OBS.getCommunity(insp.communityId);
    const local = community ? community.nome : '[LOCALIDADE]';
    const houseCode = insp.houseCode || OBS.buildHouseCode(insp.communityId, insp.houseNumber);
    const docCode = insp.docCode || CFG.docCode;
    const rev = insp.rev || CFG.rev;
    const tech = (insp.technician || '').trim() || '[RESPONSÁVEL TÉCNICO]';

    const P = (text, opts = {}) => new Paragraph({
      alignment: opts.align || AlignmentType.JUSTIFIED,
      spacing: { after: opts.after != null ? opts.after : 160, line: 300, lineRule: LineRuleType.AUTO, before: opts.before || 0 },
      keepNext: opts.keepNext, keepLines: opts.keepLines, pageBreakBefore: opts.pageBreakBefore,
      children: [new TextRun({ text: t(text), bold: opts.bold, size: opts.size, color: opts.color, italics: opts.italics })]
    });
    const H1 = (text, pageBreakBefore) => new Paragraph({
      heading: HeadingLevel.HEADING_1, pageBreakBefore, keepNext: true, keepLines: true,
      children: [new TextRun(text)]
    });
    const titleNoToc = text => new Paragraph({
      alignment: AlignmentType.LEFT, pageBreakBefore: true, keepNext: true,
      spacing: { after: 240 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: COLOR_RULE, space: 4 } },
      children: [new TextRun({ text, bold: true, size: 28, color: COLOR_TITLE })]
    });
    const imgRun = (img, size) => new ImageRun({ type: img.type || 'jpg', data: img.data, transformation: size });

    const noBorders = { top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } };
    const grid = { style: BorderStyle.SINGLE, size: 6, color: 'A6A6A6' };
    const gridBorders = { top: grid, bottom: grid, left: grid, right: grid };

    // Quadro de foto ausente: nunca usar imagem de outra residência.
    const missingBox = (desc, heightCm) => new Table({
      width: { size: 100, type: WidthType.PERCENTAGE }, layout: TableLayoutType.FIXED, columnWidths: [CONTENT_W_CM * CM],
      rows: [new TableRow({
        cantSplit: true, height: { value: heightCm * CM, rule: HeightRule.ATLEAST },
        children: [new TableCell({
          verticalAlign: VerticalAlign.CENTER,
          borders: { top: { style: BorderStyle.DASHED, size: 12, color: COLOR_TITLE }, bottom: { style: BorderStyle.DASHED, size: 12, color: COLOR_TITLE },
            left: { style: BorderStyle.DASHED, size: 12, color: COLOR_TITLE }, right: { style: BorderStyle.DASHED, size: 12, color: COLOR_TITLE } },
          children: [new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true,
            children: [new TextRun({ text: `[INSERIR FOTO: ${desc}]`, bold: true, color: COLOR_TITLE })] })]
        })]
      })]
    });

    // Figura: imagem (ou quadro) + legenda "Figura N - texto" com campo SEQ.
    // Cada legenda ganha um marcador para o Índice de Ilustrações (PAGEREF).
    const figures = [];
    const figure = (img, captionText, missingDesc) => {
      const n = figures.length + 1;
      const bm = 'Figura_' + n;
      figures.push({ n, text: t(captionText), bm });
      const out = [];
      if (img){
        out.push(new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, keepLines: true, spacing: { before: 120, after: 60 },
          children: [imgRun(img, fit(img, PHOTO_BOX))] }));
      } else {
        out.push(missingBox(missingDesc, 6));
      }
      out.push(new Paragraph({ style: 'Caption', alignment: AlignmentType.CENTER, keepLines: true, spacing: { before: 60, after: 280 },
        children: [new Bookmark({ id: bm, children: [new TextRun('Figura '), new SequentialIdentifier('Figura'), new TextRun(' - ' + t(captionText))] })] }));
      return out;
    };

    /* ---------------- Cabeçalho e rodapé (todas as páginas) ---------------- */
    const headerLogo = logo ? [imgRun(logo, fit(logo, { w: 3.6 * PX_PER_CM, h: 1.15 * PX_PER_CM }))] : [new TextRun({ text: 'Solar Minas', bold: true })];
    const hCell = (children, w) => new TableCell({ width: { size: w, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER, borders: gridBorders,
      margins: { top: 60, bottom: 60, left: 100, right: 100 }, children });
    const colW = [4.2 * CM, 6.6 * CM, 5.2 * CM];
    const header = new Header({ children: [
      new Table({
        width: { size: CONTENT_W_CM * CM, type: WidthType.DXA }, layout: TableLayoutType.FIXED, columnWidths: colW,
        rows: [new TableRow({ cantSplit: true, children: [
          hCell([new Paragraph({ alignment: AlignmentType.CENTER, children: headerLogo })], colW[0]),
          hCell([new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'RELATÓRIO DE VISITA', bold: true, size: 26, color: COLOR_INK })] })], colW[1]),
          hCell([
            new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: docCode, size: 18 })] }),
            new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Rev.: ' + rev, size: 18 })] })
          ], colW[2])
        ] })]
      }),
      new Paragraph({ spacing: { after: 0 }, children: [] })
    ] });
    const footer = new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
      new TextRun({ text: 'Página ', size: 18, color: COLOR_SOFT }), new TextRun({ children: [PageNumber.CURRENT], size: 18, color: COLOR_SOFT }),
      new TextRun({ text: ' de ', size: 18, color: COLOR_SOFT }), new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, color: COLOR_SOFT })
    ] })] });

    /* ---------------- Capa ---------------- */
    const body = [];
    if (logo) body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 1400, after: 600 },
      children: [imgRun(logo, fit(logo, { w: 9 * PX_PER_CM, h: 3 * PX_PER_CM }))] }));
    else body.push(new Paragraph({ spacing: { before: 2400 }, children: [] }));
    body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 },
      children: [new TextRun({ text: 'RELATÓRIO DE INSPEÇÃO TÉCNICA', bold: true, size: 40, color: COLOR_INK })] }));
    body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 900 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: COLOR_RULE, space: 8 } }, children: [] }));

    const coverRow = (label, value, big) => new TableRow({ cantSplit: true, children: [
      new TableCell({ width: { size: 6 * CM, type: WidthType.DXA }, borders: noBorders, verticalAlign: VerticalAlign.CENTER,
        margins: { top: 100, bottom: 100 },
        children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: label, size: 22, color: COLOR_SOFT })] })] }),
      new TableCell({ width: { size: 10 * CM, type: WidthType.DXA }, borders: noBorders, verticalAlign: VerticalAlign.CENTER,
        margins: { top: 100, bottom: 100, left: 280 },
        children: [new Paragraph({ children: [new TextRun({ text: t(value), bold: true, size: big ? 36 : 24, color: big ? COLOR_TITLE : COLOR_INK })] })] })
    ] });
    body.push(new Table({ width: { size: CONTENT_W_CM * CM, type: WidthType.DXA }, layout: TableLayoutType.FIXED, columnWidths: [6 * CM, 10 * CM],
      rows: [
        coverRow('Código da Residência', houseCode, true),
        coverRow('Local', local),
        coverRow('Data da Inspeção', fmtDate(insp.inspectionDate)),
        coverRow('Empresa', CFG.company),
        coverRow('Responsável Técnico', tech)
      ] }));

    /* ---------------- Sumário e Índice de Ilustrações ---------------- */
    body.push(titleNoToc('SUMÁRIO'));
    body.push(new TableOfContents('Sumário', { hyperlink: true, headingStyleRange: '1-1' }));
    body.push(titleNoToc('ÍNDICE DE ILUSTRAÇÕES'));
    const figIndexAt = body.length;
    body.push(null); // Índice de Ilustrações, montado depois das figuras

    /* ---------------- 1 a 3: textos fixos ---------------- */
    body.push(H1('1 OBJETIVO', true));
    body.push(P(CFG.texts.objetivo));
    body.push(H1('2 MOTIVO DA VISITA'));
    body.push(P(CFG.texts.motivo));
    body.push(H1('3 DETALHE DA VISITA'));
    body.push(P(CFG.texts.detalhe));

    /* ---------------- 4 Checklist ---------------- */
    body.push(H1('4 CHECKLIST DA INSPEÇÃO', true));
    if (CFG.texts.checklistIntro) body.push(P(CFG.texts.checklistIntro, { keepNext: true }));
    if (images.checklist){
      body.push(new Paragraph({ alignment: AlignmentType.CENTER, keepLines: true, spacing: { before: 120, after: 160 },
        children: [imgRun(images.checklist, fit(images.checklist, CHECKLIST_BOX))] }));
    } else {
      body.push(missingBox('checklist manuscrito preenchido e assinado', 10));
    }

    /* ---------------- 5 Registro fotográfico ---------------- */
    body.push(H1('5 REGISTRO FOTOGRÁFICO', true));
    if (CFG.texts.fotosIntro) body.push(P(CFG.texts.fotosIntro, { keepNext: true }));
    body.push(...figure(images.frente, 'Frente da residência', 'frente da residência'));
    body.push(...figure(images.estaca, 'Local da estaca', 'local da estaca'));
    body.push(...figure(images.estacaCodigo, 'Estaca com o código da residência', 'estaca com o código da residência'));
    (images.extras || []).forEach(ex => {
      const cap = (ex.caption || '').trim() || '[LEGENDA DA FOTO]';
      body.push(...figure(ex.data ? ex : null, cap, cap));
    });

    /* ---------------- 6 Observações técnicas ---------------- */
    body.push(H1('6 OBSERVAÇÕES TÉCNICAS'));
    body.push(P(CFG.texts.observacoesP1));
    const obs = insp.observations || {};
    const finalText = (obs.finalText != null ? obs.finalText : OBS.buildObservationText(obs.chips, obs.freeText)).trim();
    if (finalText){
      finalText.split(/\n+/).map(s => s.trim()).filter(Boolean).forEach(par => body.push(P(par)));
    } else {
      body.push(P('[OBSERVAÇÕES TÉCNICAS]', { bold: true, color: COLOR_TITLE }));
    }

    /* ---------------- 7 Conclusão ---------------- */
    body.push(H1('7 CONCLUSÃO'));
    body.push(P(CFG.texts.conclusao));
    const rec = (insp.recommendation || '').trim();
    if (rec) rec.split(/\n+/).map(s => s.trim()).filter(Boolean).forEach(par => body.push(P(par)));

    /* ---------------- Cartão de contato ---------------- */
    // Preferência: a imagem do cartão (inspecao-sas/cartao-contato.png).
    // Sem ela, monta um cartão em texto com os dados de CFG.contact.
    const c = CFG.contact;
    if (card){
      body.push(new Paragraph({ alignment: AlignmentType.CENTER, keepLines: true, spacing: { before: 400 },
        children: [imgRun(card, fit(card, { w: 11 * PX_PER_CM, h: 7 * PX_PER_CM }))] }));
    } else {
    const line = (text, o = {}) => new Paragraph({ spacing: { after: 20 }, keepNext: true, keepLines: true,
      children: [new TextRun({ text, size: o.size || 19, bold: o.bold, color: o.color || COLOR_INK })] });
    body.push(new Paragraph({ spacing: { before: 600 }, keepNext: true, children: [] }));
    body.push(new Table({
      width: { size: 12 * CM, type: WidthType.DXA }, layout: TableLayoutType.FIXED, columnWidths: [5 * CM, 7 * CM], alignment: AlignmentType.CENTER,
      rows: [new TableRow({ cantSplit: true, children: [
        new TableCell({ width: { size: 5 * CM, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER,
          borders: { top: noBorders.top, bottom: noBorders.bottom, left: noBorders.left, right: { style: BorderStyle.SINGLE, size: 12, color: COLOR_RULE } },
          margins: { right: 200 },
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: logo ? [imgRun(logo, fit(logo, { w: 4.4 * PX_PER_CM, h: 1.6 * PX_PER_CM }))] : [new TextRun('Solar Minas')] })] }),
        new TableCell({ width: { size: 7 * CM, type: WidthType.DXA }, borders: noBorders, verticalAlign: VerticalAlign.CENTER, margins: { left: 280 },
          children: [
            line(c.nome, { bold: true, size: 22 }), line(c.area, { bold: true, size: 17, color: COLOR_TITLE }),
            line(c.email), line(c.celular), line(c.telefone), line(c.site)
          ] })
      ] })]
    }));
    }

    // Índice de Ilustrações: campo TOC \c "Figura" (o Word refaz com F9) já
    // preenchido com uma linha por figura e PAGEREF para a página da legenda.
    const tabRight = [{ type: TabStopType.RIGHT, position: CONTENT_W_CM * CM, leader: LeaderType.DOT }];
    body[figIndexAt] = new TableOfContents('Índice de Ilustrações', {
      hyperlink: true, captionLabelIncludingNumbers: 'Figura',
      contentChildren: figures.map(f => new Paragraph({ style: 'TableofFigures', tabStops: tabRight, children: [
        new TextRun(`Figura ${f.n} - ${f.text}`), new TextRun({ children: [new Tab()] }), new PageReference(f.bm)
      ] }))
    });

    const docOptions = {
      creator: CFG.company,
      title: `Relatório de Inspeção Técnica ${houseCode}`,
      styles: {
        default: { document: { run: { font: FONT, size: 22, color: COLOR_INK }, paragraph: { spacing: { line: 276, lineRule: LineRuleType.AUTO } } } },
        paragraphStyles: [
          { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
            run: { font: FONT, size: 26, bold: true, color: COLOR_TITLE },
            paragraph: { spacing: { before: 360, after: 180 }, keepNext: true, keepLines: true,
              border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: COLOR_RULE, space: 4 } } } },
          { id: 'Caption', name: 'caption', basedOn: 'Normal', next: 'Normal', quickFormat: true,
            run: { font: FONT, size: 20, italics: true, color: COLOR_SOFT }, paragraph: { alignment: AlignmentType.CENTER } },
          { id: 'TOC1', name: 'toc 1', basedOn: 'Normal', next: 'Normal', run: { font: FONT, size: 22 }, paragraph: { spacing: { after: 100 } } },
          { id: 'TableofFigures', name: 'table of figures', basedOn: 'Normal', next: 'Normal', run: { font: FONT, size: 22 }, paragraph: { spacing: { after: 100 } } }
        ]
      },
      sections: [{
        properties: { page: { size: { width: PAGE.w, height: PAGE.h },
          margin: { top: PAGE.top, bottom: PAGE.bottom, left: PAGE.left, right: PAGE.right, header: 0.9 * CM, footer: 0.8 * CM } } },
        headers: { default: header }, footers: { default: footer },
        children: body
      }]
    };

    // Paginação: o estimador do docx grava os números de página do sumário,
    // do índice e do "de Y". Se ele não conseguir diagramar tudo, cai para
    // campos marcados para o Word atualizar ao abrir.
    const L = root.docxLayout || (typeof require !== 'undefined' ? safeRequire('docx/layout') : null);
    let doc = null;
    if (L && L.estimatePageNumbers){
      try{
        const probe = new Document(docOptions);
        const lay = L.layoutDocument(probe);
        if (!lay.stoppedAt) doc = new Document({ ...docOptions, pageNumbers: L.estimatePageNumbers });
        else if (root.console) console.warn('Paginação estimada parou em', lay.stoppedAt);
      }catch(e){ if (root.console) console.warn('Falha na paginação estimada', e); }
    }
    if (!doc) doc = new Document({ ...docOptions, features: { updateFields: true } });

    return outputType === 'nodebuffer' ? Packer.toBuffer(doc) : Packer.toBlob(doc);
  }

  function safeRequire(m){ try { return require(m); } catch(e){ return null; } }

  function reportFileName(houseCode){
    return 'Relatorio_Visita_' + String(houseCode || 'SEM_CODIGO').replace(/[^A-Za-z0-9_-]/g, '') + '.docx';
  }

  const api = { buildReport, reportFileName, fmtDate };
  root.SAS_REPORT = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
