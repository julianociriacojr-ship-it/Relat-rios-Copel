/* ======================================================================
   MEMORIAL DESCRITIVO POR COMUNIDADE — GERAÇÃO DO .DOCX
   buildMemorial({
     communityId,
     coords: { '86204POE01': { lat, lon }, ... },   // das inspeções no aparelho
     engineer,                                       // Engenheiro Responsável
     images: { logo, mapa, vistas: [img, img, img], card },
     outputType: 'blob' | 'nodebuffer'
   })
   img = { data, width, height, type: 'jpg'|'png' } ou null
====================================================================== */
(function(root){
  const CFG = root.SAS_CONFIG || require('./config.js');
  const OBS = root.SAS_OBS || require('./observations.js');
  const MEM = root.SAS_MEMORIAL_CONFIG || require('./memorial-config.js');

  const FONT = 'Calibri';
  const CM = 567;
  const PX_PER_CM = 96 / 2.54;
  const CONTENT_W_CM = 16;

  const t = s => OBS.noLongDash(s);
  function fit(img, box){ const r = Math.min(box.w / img.width, box.h / img.height); return { width: Math.round(img.width * r), height: Math.round(img.height * r) }; }
  // Coordenada com sinal e vírgula decimal: -25,504500
  function fmtCoord(v){ return (typeof v === 'number' && isFinite(v)) ? v.toFixed(6).replace('.', ',') : null; }

  // Dados da comunidade usados nos textos.
  function communityVars(communityId){
    const c = OBS.getCommunity(communityId);
    if (!c) throw new Error('Comunidade não encontrada: ' + communityId);
    const m = MEM.comunidades[communityId] || { nome: 'Comunidade ' + c.nome, ilha: null };
    const ilha = m.ilha;
    return {
      c, m,
      COMUNIDADE: m.nome,
      LOCALIZADA: ilha ? `localizada na ${ilha}, município de ${c.municipio} - PR` : `localizada no município de ${c.municipio} - PR`,
      SITUADA: ilha ? `situada na ${ilha}, pertencente ao município de ${c.municipio}, Estado do Paraná` : `situada no município de ${c.municipio}, Estado do Paraná`,
      LOCAL: [m.nome, ilha, 'Município de ' + c.municipio, 'Paraná'].filter(Boolean).join(' - ') + '.',
      QTD: String(c.moradias),
      TRANSPORTE: (m.transporte || MEM.padrao.transporte).replace(/\{REGIAO\}/g, ilha || m.nome),
      ACESSO: m.acesso || MEM.padrao.acesso,
      ACESSO_CONCLUSAO: m.acessoConclusao || MEM.padrao.acessoConclusao
    };
  }
  function fill(text, v){ return t(String(text).replace(/\{([A-Z_]+)\}/g, (all, k) => (v[k] != null ? v[k] : all))); }

  // Linhas da Tabela 1: todas as moradias da comunidade, na ordem do código.
  function coordinateRows(communityId, coords){
    const c = OBS.getCommunity(communityId);
    const rows = [];
    for (let n = 1; n <= c.moradias; n++){
      const code = OBS.buildHouseCode(communityId, String(n).padStart(2, '0'));
      const p = coords[code];
      rows.push({ code, lat: p ? fmtCoord(p.lat) : null, lon: p ? fmtCoord(p.lon) : null });
    }
    return rows;
  }

  async function buildMemorial({ communityId, coords, engineer, images, outputType }){
    const D = root.docx || require('docx');
    const {
      Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, WidthType, AlignmentType,
      BorderStyle, Header, Footer, PageNumber, TableOfContents, SequentialIdentifier, HeadingLevel, VerticalAlign,
      TableLayoutType, Bookmark, PageReference, TabStopType, LeaderType, Tab, LineRuleType, LevelFormat, ShadingType, HeightRule
    } = D;
    const v = communityVars(communityId);
    const rows = coordinateRows(communityId, coords || {});
    const eng = (engineer || '').trim() || '[ENGENHEIRO RESPONSÁVEL]';
    images = images || {};

    const imgRun = (img, size) => new ImageRun({ type: img.type || 'jpg', data: img.data, transformation: size });
    const P = (children, o = {}) => new Paragraph({
      alignment: o.align || AlignmentType.JUSTIFIED,
      spacing: { after: o.after != null ? o.after : 120, before: o.before || 0, line: 276, lineRule: LineRuleType.AUTO },
      keepNext: o.keepNext, keepLines: o.keepLines, pageBreakBefore: o.pageBreakBefore, indent: o.indent,
      children: typeof children === 'string' ? [new TextRun({ text: children, bold: o.bold, size: o.size })] : children
    });
    const label = (lab, val) => P([new TextRun({ text: lab + ' ', bold: true }), new TextRun(t(val))], { after: 0, align: AlignmentType.LEFT });

    const grid = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
    const gridBorders = { top: grid, bottom: grid, left: grid, right: grid };
    const cell = (text, w, o = {}) => new TableCell({
      width: { size: w, type: WidthType.DXA }, borders: gridBorders, verticalAlign: VerticalAlign.CENTER,
      shading: o.fill ? { type: ShadingType.CLEAR, color: 'auto', fill: o.fill } : undefined,
      margins: { left: 80, right: 80 },
      children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: t(text), bold: o.bold, color: o.color })] })]
    });

    /* ------- figuras com legenda "Figura N: ..." e marcador para o índice ------- */
    const figures = [];
    function figure(img, legenda, missingDesc, box){
      const n = figures.length + 1, bm = 'Figura_' + n;
      figures.push({ n, text: t(legenda), bm });
      const out = [];
      if (img){
        out.push(new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, keepLines: true, spacing: { before: 120, after: 60 },
          children: [imgRun(img, fit(img, box))] }));
      } else {
        // Quadro reservado do tamanho da imagem, para colar a montagem no Word.
        const dash = { style: BorderStyle.DASHED, size: 8, color: 'C2410C' };
        const wTw = Math.round(box.w / PX_PER_CM * CM), hTw = Math.round(box.h / PX_PER_CM * CM);
        out.push(new Table({ width: { size: wTw, type: WidthType.DXA }, layout: TableLayoutType.FIXED, columnWidths: [wTw], alignment: AlignmentType.CENTER,
          rows: [new TableRow({ cantSplit: true, height: { value: hTw, rule: HeightRule.EXACT }, children: [new TableCell({
            width: { size: wTw, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER, borders: { top: dash, bottom: dash, left: dash, right: dash },
            children: [
              new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, children: [new TextRun({ text: `[INSERIR IMAGEM: ${missingDesc}]`, bold: true, color: 'C2410C' })] }),
              new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 120 }, children: [new TextRun({ text: 'Espaço reservado: apague este quadro e cole a imagem aqui.', italics: true, size: 18, color: '5B6A70' })] })
            ] })] })] }));
      }
      out.push(new Paragraph({ style: 'Caption', alignment: AlignmentType.CENTER, keepLines: true, spacing: { before: 60, after: 240 },
        children: [new Bookmark({ id: bm, children: [new TextRun('Figura '), new SequentialIdentifier('Figura'), new TextRun(': ' + t(legenda))] })] }));
      return out;
    }

    /* ------- partes geradas ------- */
    function tabelaDistribuicao(){
      const w = [3.6 * CM, 7.4 * CM, 3.6 * CM];
      const head = new TableRow({ tableHeader: true, children: [cell('Município', w[0], { bold: true }), cell('Localidade', w[1], { bold: true }), cell('Nº de Moradias', w[2], { bold: true })] });
      const body = CFG.communities.map(c => {
        const hl = c.id === communityId ? { fill: 'FFF2CC', bold: true } : {};
        return new TableRow({ cantSplit: true, children: [cell(c.municipio, w[0], hl), cell(c.nome.replace(', ', ' - '), w[1], hl), cell(String(c.moradias), w[2], hl)] });
      });
      const total = CFG.communities.reduce((s, c) => s + c.moradias, 0);
      body.push(new TableRow({ cantSplit: true, children: [
        new TableCell({ columnSpan: 2, width: { size: w[0] + w[1], type: WidthType.DXA }, borders: gridBorders,
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Total', bold: true })] })] }),
        cell(String(total), w[2], { bold: true })
      ] }));
      return [
        P([new TextRun({ text: 'Distribuição das unidades', bold: true })], { before: 200, after: 60, keepNext: true, align: AlignmentType.LEFT }),
        new Table({ width: { size: w[0] + w[1] + w[2], type: WidthType.DXA }, layout: TableLayoutType.FIXED, columnWidths: w, alignment: AlignmentType.CENTER, rows: [head, ...body] })
      ];
    }
    function tabelaCoordenadas(){
      const w = [5 * CM, 3.6 * CM, 3.6 * CM];
      const head = new TableRow({ tableHeader: true, children: [cell('Registro da Residência', w[0], { bold: true }), cell('Latitude', w[1], { bold: true }), cell('Longitude', w[2], { bold: true })] });
      const body = rows.map(r => new TableRow({ cantSplit: true, children: [
        cell(r.code, w[0]),
        cell(r.lat || '[PENDENTE]', w[1], r.lat ? {} : { color: 'C2410C', bold: true }),
        cell(r.lon || '[PENDENTE]', w[2], r.lon ? {} : { color: 'C2410C', bold: true })
      ] }));
      return [
        P('Tabela 1 - Relação das Coordenadas Geográficas das Residências', { keepNext: true, align: AlignmentType.CENTER, before: 120 }),
        new Table({ width: { size: w[0] + w[1] + w[2], type: WidthType.DXA }, layout: TableLayoutType.FIXED, columnWidths: w, alignment: AlignmentType.CENTER, rows: [head, ...body] }),
        P([new TextRun({ text: 'Coordenadas em graus decimais (WGS 84), com sinal: latitude negativa ao sul do Equador e longitude negativa a oeste de Greenwich.', italics: true, size: 18 })], { before: 80, align: AlignmentType.CENTER })
      ];
    }

    /* ------- capa ------- */
    const body = [];
    body.push(P([new TextRun({ text: MEM.titulo, bold: true, size: 28 })], { align: AlignmentType.CENTER, before: 200, after: 480 }));
    body.push(P([new TextRun({ text: MEM.subtitulo, bold: true })], { align: AlignmentType.LEFT, after: 240 }));
    body.push(label('Empreendimento:', MEM.empreendimento));
    body.push(label('Contratante:', MEM.contratante));
    body.push(label('Comunidade:', v.LOCAL));
    body.push(new Paragraph({ spacing: { before: 9000 }, children: [] }));
    body.push(label('Empresa Executora:', MEM.empresa));
    body.push(label('Engenheiro Responsável:', eng));

    /* ------- sumário e índice ------- */
    const centerTitle = (text, pageBreakBefore, before) => P([new TextRun({ text, bold: true, size: 32 })], { align: AlignmentType.CENTER, pageBreakBefore, before: before || 0, after: 160, keepNext: true });
    body.push(centerTitle('Sumário', true));
    body.push(new TableOfContents('Sumário', { hyperlink: true, headingStyleRange: '1-1' }));
    body.push(centerTitle('Índice de Ilustrações', false, 600));
    const figIndexAt = body.length;
    body.push(null);

    /* ------- seções ------- */
    let first = true;
    MEM.secoes.forEach(sec => {
      body.push(new Paragraph({ heading: sec.nivel === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_1, pageBreakBefore: first, keepNext: true, keepLines: true,
        children: [new TextRun(t(sec.titulo))] }));
      first = false;
      sec.itens.forEach(item => {
        if (item === 'IDENTIFICACAO'){
          body.push(label('Empreendimento:', 'Implantação de Sistemas de Aquecimento Solar Residencial'));
          body.push(label('Quantidade de Sistemas:', `${v.QTD} unidades`));
          body.push(label('Local de Implantação:', v.LOCAL));
        } else if (item === 'TABELA_DISTRIBUICAO') body.push(...tabelaDistribuicao());
        else if (item === 'TABELA_COORDENADAS') body.push(...tabelaCoordenadas());
        else if (item === 'FIGURA_MAPA') body.push(...figure(images.mapa, `Localização da ${v.COMUNIDADE}.`, `imagem aérea com a localização da ${v.COMUNIDADE}`, { w: 15 * PX_PER_CM, h: 17.5 * PX_PER_CM }));
        else if (item === 'FIGURAS_VISTAS'){
          MEM.vistas.forEach((vista, k) => body.push(...figure((images.vistas || [])[k], vista.legenda, vista.legenda.replace(/\.$/, '').toLowerCase(), { w: 15 * PX_PER_CM, h: 8.5 * PX_PER_CM })));
        } else if (item && item.bullets){
          item.bullets.forEach((b, k) => body.push(new Paragraph({ numbering: { reference: 'bullets', level: 0 }, alignment: AlignmentType.JUSTIFIED,
            spacing: { after: 40, line: 276, lineRule: LineRuleType.AUTO }, keepNext: k < item.bullets.length - 1, children: [new TextRun(fill(b, v))] })));
          body.push(new Paragraph({ spacing: { after: 60 }, children: [] }));
        } else body.push(P(fill(item, v)));
      });
    });

    /* ------- cartão de contato ------- */
    if (images.card){
      body.push(new Paragraph({ alignment: AlignmentType.CENTER, keepLines: true, spacing: { before: 600 },
        children: [imgRun(images.card, fit(images.card, { w: 11 * PX_PER_CM, h: 7 * PX_PER_CM }))] }));
    }

    const tabRight = [{ type: TabStopType.RIGHT, position: CONTENT_W_CM * CM, leader: LeaderType.DOT }];
    body[figIndexAt] = new TableOfContents('Índice de Ilustrações', {
      hyperlink: true, captionLabelIncludingNumbers: 'Figura',
      contentChildren: figures.map(f => new Paragraph({ style: 'TableofFigures', tabStops: tabRight, children: [
        new TextRun(`Figura ${f.n}: ${f.text}`), new TextRun({ children: [new Tab()] }), new PageReference(f.bm)
      ] }))
    });

    // Cabeçalho do modelo: logo centralizado em todas as páginas.
    const header = new Header({ children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 },
      children: images.logo ? [imgRun(images.logo, fit(images.logo, { w: 6.6 * PX_PER_CM, h: 3.6 * PX_PER_CM }))] : [new TextRun({ text: 'Solar Minas', bold: true })] })] });
    const footer = new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
      new TextRun({ text: 'Página ', size: 18, color: '5B6A70' }), new TextRun({ children: [PageNumber.CURRENT], size: 18, color: '5B6A70' }),
      new TextRun({ text: ' de ', size: 18, color: '5B6A70' }), new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, color: '5B6A70' })
    ] })] });

    const docOptions = {
      creator: MEM.empresa,
      title: `Memorial Descritivo - ${v.COMUNIDADE}`,
      numbering: { config: [{ reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] }] },
      styles: {
        default: { document: { run: { font: FONT, size: 24 }, paragraph: { spacing: { line: 276, lineRule: LineRuleType.AUTO } } } },
        paragraphStyles: [
          { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
            run: { font: FONT, size: 24, bold: true, color: '000000' }, paragraph: { spacing: { before: 360, after: 200 }, keepNext: true, keepLines: true } },
          { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
            run: { font: FONT, size: 24, bold: true, color: '000000' }, paragraph: { spacing: { before: 300, after: 200 }, keepNext: true, keepLines: true } },
          { id: 'Caption', name: 'caption', basedOn: 'Normal', next: 'Normal', quickFormat: true,
            run: { font: FONT, size: 18, bold: true, italics: true, color: '000000' }, paragraph: { alignment: AlignmentType.CENTER } },
          { id: 'TOC1', name: 'toc 1', basedOn: 'Normal', next: 'Normal', run: { font: FONT, size: 22, bold: true }, paragraph: { spacing: { after: 80 } } },
          { id: 'TableofFigures', name: 'table of figures', basedOn: 'Normal', next: 'Normal', run: { font: FONT, size: 22, bold: true }, paragraph: { spacing: { after: 40 } } }
        ]
      },
      sections: [{
        properties: { page: { size: { width: 21 * CM, height: 29.7 * CM },
          margin: { top: 4.3 * CM, bottom: 2 * CM, left: 3 * CM, right: 2 * CM, header: 0.5 * CM, footer: 0.8 * CM } } },
        headers: { default: header }, footers: { default: footer },
        children: body
      }]
    };

    const L = root.docxLayout || (typeof require !== 'undefined' ? safeRequire('docx/layout') : null);
    let doc = null;
    if (L && L.estimatePageNumbers){
      try{
        const lay = L.layoutDocument(new Document(docOptions));
        if (!lay.stoppedAt) doc = new Document({ ...docOptions, pageNumbers: L.estimatePageNumbers });
        else if (root.console) console.warn('Paginação estimada parou em', lay.stoppedAt);
      }catch(e){ if (root.console) console.warn('Falha na paginação estimada', e); }
    }
    if (!doc) doc = new Document({ ...docOptions, features: { updateFields: true } });
    return outputType === 'nodebuffer' ? Packer.toBuffer(doc) : Packer.toBlob(doc);
  }
  function safeRequire(m){ try { return require(m); } catch(e){ return null; } }

  function memorialFileName(communityId){
    const v = communityVars(communityId);
    return 'Memorial_Descritivo_' + v.COMUNIDADE.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '') + '.docx';
  }

  const api = { buildMemorial, memorialFileName, coordinateRows, communityVars, fmtCoord };
  root.SAS_MEMORIAL = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
