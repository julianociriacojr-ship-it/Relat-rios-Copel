/* ======================================================================
   INSPEÇÃO SAS — GERAÇÃO DO PDF (jsPDF local, sem rede)
   Mesma estrutura e textos do .docx. Como a paginação é feita aqui,
   o sumário e o índice saem com os números de página exatos.
   buildPdf({ inspection, images, logo }) -> ArrayBuffer
   img = { data: Uint8Array, width, height, type: 'jpg'|'png' } ou null
====================================================================== */
(function(root){
  const CFG = root.SAS_CONFIG || require('./config.js');
  const OBS = root.SAS_OBS || require('./observations.js');

  // A4 em mm, margens iguais às do .docx
  const PW = 210, PH = 297;
  const ML = 30, MR = 20, CW = PW - ML - MR;    // largura útil 160 mm
  const HEAD_Y = 9, HEAD_H = 14;                // cabeçalho
  const TOP = 30, BOTTOM = PH - 20;             // área do corpo
  const FOOT_Y = PH - 10;
  const BODY = 11, LINE = 5.6;                  // 11 pt, entrelinha ~1,3

  const C_TITLE = [194, 65, 12], C_RULE = [232, 145, 45], C_INK = [27, 34, 38], C_SOFT = [91, 106, 112], C_GRID = [166, 166, 166];

  const t = s => OBS.noLongDash(s);
  function fmtDate(iso){
    if (!iso) return '[DATA DA INSPEÇÃO]';
    const [y, m, d] = String(iso).slice(0, 10).split('-');
    return (y && m && d) ? `${d}/${m}/${y}` : '[DATA DA INSPEÇÃO]';
  }
  function fit(img, w, h){ const r = Math.min(w / img.width, h / img.height); return { w: img.width * r, h: img.height * r }; }
  const fmt = img => (img.type === 'png' ? 'PNG' : 'JPEG');

  function buildPdf({ inspection: insp, images, logo, card }){
    const { jsPDF } = root.jspdf || require('jspdf');
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });

    const community = OBS.getCommunity(insp.communityId);
    const local = community ? community.nome : '[LOCALIDADE]';
    const houseCode = insp.houseNumber ? OBS.buildHouseCode(insp.communityId, insp.houseNumber) : (insp.houseCode || '[CÓDIGO DA RESIDÊNCIA]');
    const docCode = insp.docCode || CFG.docCode;
    const rev = insp.rev || CFG.rev;
    const tech = (insp.technician || '').trim() || '[RESPONSÁVEL TÉCNICO]';
    doc.setProperties({ title: `Relatório de Inspeção Técnica ${houseCode}`, author: CFG.company, creator: CFG.company });

    let y = TOP;
    const color = c => doc.setTextColor(c[0], c[1], c[2]);
    const font = (style, size, c) => { doc.setFont('helvetica', style); doc.setFontSize(size); color(c || C_INK); };
    const newPage = () => { doc.addPage(); y = TOP; };
    const room = () => BOTTOM - y;

    // Texto justificado, linha a linha (última linha do parágrafo alinhada à esquerda).
    function paragraph(text, opts = {}){
      font(opts.style || 'normal', opts.size || BODY, opts.color);
      const lines = doc.splitTextToSize(t(text), CW);
      lines.forEach((ln, k) => {
        if (y + LINE > BOTTOM){ newPage(); font(opts.style || 'normal', opts.size || BODY, opts.color); }
        const last = k === lines.length - 1;
        const words = ln.trim().split(/\s+/);
        if (last || words.length < 2 || opts.left){
          doc.text(ln.trim(), ML, y + 4);
        } else {
          const wsum = words.reduce((s, w) => s + doc.getTextWidth(w), 0);
          const gap = (CW - wsum) / (words.length - 1);
          let x = ML;
          words.forEach(w => { doc.text(w, x, y + 4); x += doc.getTextWidth(w) + gap; });
        }
        y += LINE;
      });
      y += 3;
    }

    const headings = [];   // { text, page }
    function heading(text, pageBreak){
      if (pageBreak) newPage();
      else if (room() < 32) newPage();   // evita título órfão no fim da página
      y += pageBreak ? 0 : 3;
      font('bold', 13, C_TITLE);
      doc.text(text, ML, y + 5);
      doc.setDrawColor(...C_RULE); doc.setLineWidth(0.35);
      doc.line(ML, y + 7.5, ML + CW, y + 7.5);
      headings.push({ text, page: doc.getNumberOfPages() });
      y += 12;
    }

    function missingBox(desc, h){
      doc.setDrawColor(...C_TITLE); doc.setLineWidth(0.5);
      doc.setLineDashPattern([2, 1.5], 0);
      doc.rect(ML, y, CW, h);
      doc.setLineDashPattern([], 0);
      font('bold', BODY, C_TITLE);
      doc.text(`[INSERIR FOTO: ${desc}]`, PW / 2 + (ML - MR) / 2, y + h / 2 + 1.5, { align: 'center' });
      y += h;
    }

    const figures = [];    // { n, text, page }
    function figure(img, captionText, missingDesc){
      const n = figures.length + 1;
      // Fotos horizontais 16:9 na largura útil (160 x 90 mm): duas por página.
      const size = img ? fit(img, CW, 92) : { w: CW, h: 90 };
      if (room() < size.h + 10) newPage();
      y += 2;
      if (img){
        doc.addImage(img.data, fmt(img), ML + (CW - size.w) / 2, y, size.w, size.h, undefined, 'FAST');
        y += size.h;
      } else missingBox(missingDesc, size.h);
      font('italic', 10, C_SOFT);
      const cap = `Figura ${n} - ${t(captionText)}`;
      doc.text(cap, ML + CW / 2, y + 5, { align: 'center' });
      figures.push({ n, text: t(captionText), page: doc.getNumberOfPages() });
      y += 10;
    }

    /* ---------------- Capa ---------------- */
    y = 52;
    if (logo){ const s = fit(logo, 90, 30); doc.addImage(logo.data, fmt(logo), ML + (CW - s.w) / 2, y, s.w, s.h, undefined, 'FAST'); y += s.h + 18; }
    else y += 40;
    font('bold', 20, C_INK);
    doc.text('RELATÓRIO DE INSPEÇÃO TÉCNICA', ML + CW / 2, y, { align: 'center' });
    y += 8;
    doc.setDrawColor(...C_RULE); doc.setLineWidth(0.6); doc.line(ML, y, ML + CW, y);
    y += 26;
    const coverRows = [
      ['Código da Residência', houseCode, true], ['Local', local], ['Data da Inspeção', fmtDate(insp.inspectionDate)],
      ['Empresa', CFG.company], ['Responsável Técnico', tech]
    ];
    coverRows.forEach(([label, value, big]) => {
      font('normal', 11, C_SOFT);
      doc.text(label, ML + 57, y, { align: 'right' });
      font('bold', big ? 18 : 12, big ? C_TITLE : C_INK);
      doc.text(doc.splitTextToSize(t(value), CW - 64), ML + 64, y);
      y += big ? 13 : 10;
    });

    /* ---------------- Sumário e Índice: páginas reservadas ---------------- */
    doc.addPage(); const tocPage = doc.getNumberOfPages();
    doc.addPage(); const figPage = doc.getNumberOfPages();

    /* ---------------- 1 a 3 ---------------- */
    heading('1 OBJETIVO', true);
    paragraph(CFG.texts.objetivo);
    heading('2 MOTIVO DA VISITA');
    paragraph(CFG.texts.motivo);
    heading('3 DETALHE DA VISITA');
    paragraph(CFG.texts.detalhe);

    /* ---------------- 4 Checklist ---------------- */
    heading('4 CHECKLIST DA INSPEÇÃO', true);
    if (CFG.texts.checklistIntro) paragraph(CFG.texts.checklistIntro);
    if (images.checklist){
      const s = fit(images.checklist, CW, BOTTOM - y - 4);
      doc.addImage(images.checklist.data, fmt(images.checklist), ML + (CW - s.w) / 2, y + 2, s.w, s.h, undefined, 'FAST');
      y += s.h + 6;
    } else missingBox('checklist manuscrito preenchido e assinado', 90);

    /* ---------------- 5 Registro fotográfico ---------------- */
    heading('5 REGISTRO FOTOGRÁFICO', true);
    if (CFG.texts.fotosIntro) paragraph(CFG.texts.fotosIntro);
    figure(images.frente, 'Frente da residência', 'frente da residência');
    figure(images.estaca, 'Local da estaca', 'local da estaca');
    figure(images.estacaCodigo, 'Estaca com o código da residência', 'estaca com o código da residência');
    (images.extras || []).forEach(ex => {
      const cap = (ex.caption || '').trim() || '[LEGENDA DA FOTO]';
      figure(ex.data ? ex : null, cap, cap);
    });

    /* ---------------- 6 Observações ---------------- */
    heading('6 OBSERVAÇÕES TÉCNICAS');
    paragraph(CFG.texts.observacoesP1);
    const obs = insp.observations || {};
    const finalText = (obs.finalText != null ? obs.finalText : OBS.buildObservationText(obs.chips, obs.freeText)).trim();
    if (finalText) finalText.split(/\n+/).map(s => s.trim()).filter(Boolean).forEach(p => paragraph(p));
    else paragraph('[OBSERVAÇÕES TÉCNICAS]', { style: 'bold', color: C_TITLE });

    /* ---------------- 7 Conclusão ---------------- */
    heading('7 CONCLUSÃO');
    paragraph(CFG.texts.conclusao);
    const rec = (insp.recommendation || '').trim();
    if (rec) rec.split(/\n+/).map(s => s.trim()).filter(Boolean).forEach(p => paragraph(p));

    /* ---------------- Cartão de contato ---------------- */
    const c = CFG.contact;
    if (card){
      const s = fit(card, 110, 63);
      if (room() < s.h + 6) newPage(); else y += 6;
      doc.addImage(card.data, fmt(card), ML + (CW - s.w) / 2, y, s.w, s.h, undefined, 'FAST');
      y += s.h;
    } else {
      const cardH = 40;
      if (room() < cardH + 6) newPage(); else y += 6;
      const cx = ML + 20;
      if (logo){ const s = fit(logo, 44, 16); doc.addImage(logo.data, fmt(logo), cx, y + (cardH - s.h) / 2, s.w, s.h, undefined, 'FAST'); }
      doc.setDrawColor(...C_RULE); doc.setLineWidth(0.6); doc.line(cx + 50, y, cx + 50, y + cardH);
      let ly = y + 5;
      const cl = (txt, style, size, col) => { font(style, size, col); doc.text(txt, cx + 56, ly); ly += size * 0.48; };
      cl(c.nome, 'bold', 11); cl(c.area, 'bold', 8.5, C_TITLE); ly += 1;
      [c.email, c.celular, c.telefone, c.site].forEach(v => cl(v, 'normal', 9.5));
    }

    /* ---------------- Sumário e Índice (agora com as páginas) ---------------- */
    function tocTitle(page, text){
      doc.setPage(page);
      font('bold', 14, C_TITLE);
      doc.text(text, ML, TOP + 5);
      doc.setDrawColor(...C_RULE); doc.setLineWidth(0.4); doc.line(ML, TOP + 8, ML + CW, TOP + 8);
    }
    function tocLine(yy, text, page){
      font('normal', BODY);
      const pg = String(page);
      const tw = doc.getTextWidth(text), pw = doc.getTextWidth(pg);
      doc.text(text, ML, yy);
      doc.text(pg, ML + CW, yy, { align: 'right' });
      const dotW = doc.getTextWidth('.');
      const start = ML + tw + 1.5, end = ML + CW - pw - 1.5;
      if (end > start) doc.text('.'.repeat(Math.floor((end - start) / dotW)), start, yy);
    }
    tocTitle(tocPage, 'SUMÁRIO');
    headings.forEach((h, k) => tocLine(TOP + 18 + k * 8, h.text, h.page));
    tocTitle(figPage, 'ÍNDICE DE ILUSTRAÇÕES');
    figures.forEach((f, k) => tocLine(TOP + 18 + k * 8, `Figura ${f.n} - ${f.text}`, f.page));

    /* ---------------- Cabeçalho e rodapé em todas as páginas ---------------- */
    const total = doc.getNumberOfPages();
    const colW = [42, 66, 52];
    for (let p = 1; p <= total; p++){
      doc.setPage(p);
      doc.setDrawColor(...C_GRID); doc.setLineWidth(0.25);
      let x = ML;
      colW.forEach(w => { doc.rect(x, HEAD_Y, w, HEAD_H); x += w; });
      if (logo){ const s = fit(logo, 34, 10); doc.addImage(logo.data, fmt(logo), ML + (colW[0] - s.w) / 2, HEAD_Y + (HEAD_H - s.h) / 2, s.w, s.h, undefined, 'FAST'); }
      font('bold', 12, C_INK);
      doc.text('RELATÓRIO DE VISITA', ML + colW[0] + colW[1] / 2, HEAD_Y + HEAD_H / 2 + 1.6, { align: 'center' });
      font('normal', 8.5);
      const cx3 = ML + colW[0] + colW[1] + colW[2] / 2;
      doc.text(docCode, cx3, HEAD_Y + 5.6, { align: 'center' });
      doc.text('Rev.: ' + rev, cx3, HEAD_Y + 10.2, { align: 'center' });
      font('normal', 9, C_SOFT);
      doc.text(`Página ${p} de ${total}`, ML + CW / 2, FOOT_Y, { align: 'center' });
    }

    return doc.output('arraybuffer');
  }

  function pdfFileName(houseCode){
    return 'Relatorio_Visita_' + String(houseCode || 'SEM_CODIGO').replace(/[^A-Za-z0-9_-]/g, '') + '.pdf';
  }

  const api = { buildPdf, pdfFileName };
  root.SAS_PDF = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
