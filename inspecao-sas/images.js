/* ======================================================================
   INSPEÇÃO SAS — FOTOS: redimensionamento no aparelho e círculo vermelho
====================================================================== */
(function(root){

  // Decodifica respeitando a orientação EXIF (fotos de celular em pé).
  async function decode(blob){
    if (root.createImageBitmap){
      try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); }
      catch(e){ /* cai para <img> */ }
    }
    const url = URL.createObjectURL(blob);
    try{
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
      await img.decode();
      return img;
    } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }
  const dims = src => ({ w: src.naturalWidth || src.width, h: src.naturalHeight || src.height });

  function canvasToBlob(canvas, quality){
    return new Promise((resolve, reject) =>
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('Falha ao gerar JPEG')), 'image/jpeg', quality));
  }

  // Redimensiona mantendo a proporção: lado maior <= maxSide.
  async function resizeToJpeg(file, maxSide, quality){
    const src = await decode(file);
    const { w, h } = dims(src);
    const scale = Math.min(1, maxSide / Math.max(w, h));
    const cw = Math.round(w * scale), ch = Math.round(h * scale);
    const canvas = document.createElement('canvas');
    canvas.width = cw; canvas.height = ch;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cw, ch);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, cw, ch);
    if (src.close) src.close();
    const blob = await canvasToBlob(canvas, quality);
    canvas.width = canvas.height = 0; // libera memória no iOS
    return { blob, width: cw, height: ch };
  }

  // Círculos em coordenadas relativas: cx, cy em fração da largura/altura,
  // r em fração da largura. Assim a anotação independe da resolução.
  function strokeFor(w, h){ return Math.max(4, Math.round(Math.max(w, h) * 0.007)); }
  function drawCircles(ctx, w, h, circles){
    ctx.save();
    ctx.strokeStyle = '#E00000';
    ctx.lineWidth = strokeFor(w, h);
    circles.forEach(c => {
      ctx.beginPath();
      ctx.arc(c.cx * w, c.cy * h, Math.max(c.r * w, 4), 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.restore();
  }

  // Gera a imagem final com os círculos gravados.
  async function burnCircles(blob, circles, quality){
    const src = await decode(blob);
    const { w, h } = dims(src);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(src, 0, 0, w, h);
    if (src.close) src.close();
    drawCircles(ctx, w, h, circles);
    const out = await canvasToBlob(canvas, quality);
    canvas.width = canvas.height = 0;
    return { blob: out, width: w, height: h };
  }

  /* ------------------------------------------------------------------
     Editor do círculo: tela cheia, toque e arraste a partir do centro.
     openCircleEditor(blob, circles) -> Promise<circles | null>
  ------------------------------------------------------------------ */
  function openCircleEditor(blob, initialCircles){
    return new Promise(async (resolve) => {
      const src = await decode(blob);
      const { w: iw, h: ih } = dims(src);
      let circles = (initialCircles || []).map(c => ({ ...c }));
      let redo = [];
      let drawing = null;

      const wrap = document.createElement('div');
      wrap.className = 'annot-modal';
      wrap.innerHTML = `
        <div class="annot-top">
          <strong>Figura 2: marque o local da estaca</strong>
          <span>Toque no centro e arraste para abrir o círculo.</span>
        </div>
        <div class="annot-stage"><canvas></canvas></div>
        <div class="annot-bar">
          <button type="button" class="btn-tool" data-a="undo">↶ Desfazer</button>
          <button type="button" class="btn-tool" data-a="redo">↷ Refazer</button>
          <button type="button" class="btn-tool ghost" data-a="cancel">Cancelar</button>
          <button type="button" class="btn-tool ok" data-a="ok">✓ Concluir</button>
        </div>`;
      document.body.appendChild(wrap);
      document.body.classList.add('modal-open');
      const stage = wrap.querySelector('.annot-stage');
      const canvas = wrap.querySelector('canvas');
      const ctx = canvas.getContext('2d');
      let cw = 0, ch = 0;

      function layout(){
        const maxW = stage.clientWidth, maxH = stage.clientHeight;
        const s = Math.min(maxW / iw, maxH / ih);
        cw = Math.round(iw * s); ch = Math.round(ih * s);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = cw * dpr; canvas.height = ch * dpr;
        canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        render();
      }
      function render(){
        ctx.clearRect(0, 0, cw, ch);
        ctx.drawImage(src, 0, 0, cw, ch);
        const all = drawing ? circles.concat([drawing]) : circles;
        drawCircles(ctx, cw, ch, all);
        wrap.querySelector('[data-a=undo]').disabled = !circles.length;
        wrap.querySelector('[data-a=redo]').disabled = !redo.length;
      }
      function pos(e){
        const r = canvas.getBoundingClientRect();
        return { x: Math.min(Math.max(e.clientX - r.left, 0), cw), y: Math.min(Math.max(e.clientY - r.top, 0), ch) };
      }
      canvas.addEventListener('pointerdown', e => {
        e.preventDefault();
        canvas.setPointerCapture(e.pointerId);
        const p = pos(e);
        drawing = { cx: p.x / cw, cy: p.y / ch, r: 0, _x: p.x, _y: p.y };
        render();
      });
      canvas.addEventListener('pointermove', e => {
        if (!drawing) return;
        const p = pos(e);
        drawing.r = Math.hypot(p.x - drawing._x, p.y - drawing._y) / cw;
        render();
      });
      const finish = () => {
        if (!drawing) return;
        if (drawing.r * cw >= 10){
          circles.push({ cx: drawing.cx, cy: drawing.cy, r: drawing.r });
          redo = [];
        }
        drawing = null;
        render();
      };
      canvas.addEventListener('pointerup', finish);
      canvas.addEventListener('pointercancel', () => { drawing = null; render(); });

      function close(result){
        window.removeEventListener('resize', layout);
        document.body.classList.remove('modal-open');
        wrap.remove();
        if (src.close) src.close();
        resolve(result);
      }
      wrap.querySelector('.annot-bar').addEventListener('click', e => {
        const a = e.target.closest('[data-a]'); if (!a) return;
        const act = a.dataset.a;
        if (act === 'undo' && circles.length){ redo.push(circles.pop()); render(); }
        else if (act === 'redo' && redo.length){ circles.push(redo.pop()); render(); }
        else if (act === 'cancel') close(null);
        else if (act === 'ok') close(circles);
      });
      window.addEventListener('resize', layout);
      requestAnimationFrame(layout);
    });
  }

  /* ------------------------------------------------------------------
     CHECKLIST COMO DOCUMENTO (igual ao "digitalizar" da câmera)
     1. acha os 4 cantos da folha (papel claro sobre fundo mais escuro);
     2. a pessoa confere e arrasta os cantos, se precisar;
     3. a folha é endireitada (sem perspectiva) e o fundo fica branco.
     Cantos em fração da imagem: [{x,y} TL, TR, BR, BL].
  ------------------------------------------------------------------ */
  // Detecção em imagem pequena: limiar de Otsu, maior mancha clara, cantos
  // pelos extremos de x+y e x-y. Se não achar a folha, devolve null.
  function detectQuad(gray, w, h){
    const hist = new Array(256).fill(0);
    for (let k = 0; k < gray.length; k++) hist[gray[k]]++;
    let sum = 0; for (let k = 0; k < 256; k++) sum += k * hist[k];
    let sumB = 0, wB = 0, best = 0, th = 128;
    for (let k = 0; k < 256; k++){
      wB += hist[k]; if (!wB) continue;
      const wF = gray.length - wB; if (!wF) break;
      sumB += k * hist[k];
      const mB = sumB / wB, mF = (sum - sumB) / wF, v = wB * wF * (mB - mF) * (mB - mF);
      if (v > best){ best = v; th = k; }
    }
    const lab = new Int32Array(w * h).fill(-1);
    let maior = null, id = 0;
    const pilha = new Int32Array(w * h);
    for (let start = 0; start < w * h; start++){
      if (lab[start] !== -1 || gray[start] <= th) continue;
      let topo = 0, n = 0, tl = start, tr = start, br = start, bl = start;
      pilha[topo++] = start; lab[start] = id;
      while (topo){
        const q = pilha[--topo]; n++;
        const x = q % w, y = (q - x) / w;
        const s1 = x + y, s2 = x - y;
        if (s1 < (tl % w) + ((tl / w) | 0)) tl = q;
        if (s1 > (br % w) + ((br / w) | 0)) br = q;
        if (s2 > (tr % w) - ((tr / w) | 0)) tr = q;
        if (s2 < (bl % w) - ((bl / w) | 0)) bl = q;
        if (x > 0 && lab[q - 1] === -1 && gray[q - 1] > th){ lab[q - 1] = id; pilha[topo++] = q - 1; }
        if (x < w - 1 && lab[q + 1] === -1 && gray[q + 1] > th){ lab[q + 1] = id; pilha[topo++] = q + 1; }
        if (y > 0 && lab[q - w] === -1 && gray[q - w] > th){ lab[q - w] = id; pilha[topo++] = q - w; }
        if (y < h - 1 && lab[q + w] === -1 && gray[q + w] > th){ lab[q + w] = id; pilha[topo++] = q + w; }
      }
      if (!maior || n > maior.n) maior = { n, tl, tr, br, bl };
      id++;
    }
    if (!maior || maior.n < w * h * 0.12) return null;
    const pt = q => ({ x: (q % w + 0.5) / w, y: (((q / w) | 0) + 0.5) / h });
    return [pt(maior.tl), pt(maior.tr), pt(maior.br), pt(maior.bl)];
  }
  // Girar 90° no sentido horário = o lado esquerdo da folha vira o topo.
  const girarQuad = (q, voltas) => q.map((_, i) => q[(i - voltas + 400) % 4]);
  // Folha deitada fotografada com o celular em pé: deixa o topo no lado
  // direito da foto (como o Juliano fotografa), girando 90° para a esquerda.
  function deitarSeEmPe(q, iw, ih){
    const px = q.map(p => ({ x: p.x * iw, y: p.y * ih }));
    const larg = dist(px[0], px[1]), alt = dist(px[0], px[3]);
    return alt > larg ? girarQuad(q, 3) : q;
  }
  const QUAD_PADRAO = [{ x: 0.06, y: 0.06 }, { x: 0.94, y: 0.06 }, { x: 0.94, y: 0.94 }, { x: 0.06, y: 0.94 }];

  // Homografia que leva o retângulo de saída (0..W, 0..H) aos 4 cantos na foto.
  function homografia(W, H, q){
    const src = [[0, 0], [W, 0], [W, H], [0, H]], A = [], b = [];
    for (let k = 0; k < 4; k++){
      const [x, y] = src[k], u = q[k].x, v = q[k].y;
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
    }
    for (let c = 0; c < 8; c++){                       // Gauss com pivô
      let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
      for (let r = 0; r < 8; r++){ if (r === c) continue; const f = A[r][c] / A[c][c];
        for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k]; b[r] -= f * b[c]; }
    }
    return b.map((v, k) => v / A[k][k]).concat(1);
  }
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  // Tamanho de saída: proporção medida na foto; perto de A4, vira A4 exato.
  function tamanhoSaida(q, iw, ih, lado){
    const px = q.map(p => ({ x: p.x * iw, y: p.y * ih }));
    const larg = (dist(px[0], px[1]) + dist(px[3], px[2])) / 2, alt = (dist(px[0], px[3]) + dist(px[1], px[2])) / 2;
    let r = larg / alt;
    const A4 = 297 / 210;
    if (Math.abs(r / A4 - 1) < 0.18) r = A4; else if (Math.abs(r * A4 - 1) < 0.18) r = 1 / A4;
    return r >= 1 ? { W: lado, H: Math.round(lado / r) } : { W: Math.round(lado * r), H: lado };
  }
  // Endireita a folha e clareia o fundo (divide pela iluminação local), para
  // o manuscrito ficar legível mesmo com sombra leve.
  function endireitar(srcCanvas, q, W, H, realcar){
    const iw = srcCanvas.width, ih = srcCanvas.height;
    const sd = srcCanvas.getContext('2d').getImageData(0, 0, iw, ih).data;
    const m = homografia(W, H, q.map(p => ({ x: p.x * iw, y: p.y * ih })));
    const out = document.createElement('canvas'); out.width = W; out.height = H;
    const octx = out.getContext('2d'), img = octx.createImageData(W, H), d = img.data;
    for (let y = 0; y < H; y++){
      for (let x = 0; x < W; x++){
        const z = m[6] * x + m[7] * y + 1;
        let u = (m[0] * x + m[1] * y + m[2]) / z, v = (m[3] * x + m[4] * y + m[5]) / z;
        u = Math.min(Math.max(u, 0), iw - 1.001); v = Math.min(Math.max(v, 0), ih - 1.001);
        const x0 = u | 0, y0 = v | 0, fx = u - x0, fy = v - y0, i0 = (y0 * iw + x0) * 4, i1 = i0 + iw * 4, o = (y * W + x) * 4;
        for (let c = 0; c < 3; c++)
          d[o + c] = (sd[i0 + c] * (1 - fx) + sd[i0 + 4 + c] * fx) * (1 - fy) + (sd[i1 + c] * (1 - fx) + sd[i1 + 4 + c] * fx) * fy;
        d[o + 3] = 255;
      }
    }
    octx.putImageData(img, 0, 0);
    if (realcar){
      // iluminação local = versão bem borrada (reduz e amplia de volta)
      const bw = Math.max(8, Math.round(W / 24)), bh = Math.max(8, Math.round(H / 24));
      const pq = document.createElement('canvas'); pq.width = bw; pq.height = bh;
      const pctx = pq.getContext('2d'); pctx.imageSmoothingQuality = 'high'; pctx.filter = 'blur(2px)';
      pctx.drawImage(out, 0, 0, bw, bh);
      const fundo = document.createElement('canvas'); fundo.width = W; fundo.height = H;
      const fctx = fundo.getContext('2d'); fctx.imageSmoothingQuality = 'high'; fctx.drawImage(pq, 0, 0, W, H);
      const f = fctx.getImageData(0, 0, W, H).data;
      for (let k = 0; k < d.length; k += 4){
        for (let c = 0; c < 3; c++){
          let v = d[k + c] / Math.max(f[k + c], 1) * 255;          // fundo vira branco
          v = 255 - (255 - Math.min(v, 255)) * 1.35;              // traço um pouco mais forte
          d[k + c] = v < 0 ? 0 : v;
        }
      }
      octx.putImageData(img, 0, 0);
      pq.width = pq.height = fundo.width = fundo.height = 0;
    }
    return out;
  }
  async function carregarCanvas(blob, maxLado){
    const src = await decode(blob);
    const { w, h } = dims(src);
    const s = Math.min(1, maxLado / Math.max(w, h));
    const c = document.createElement('canvas'); c.width = Math.round(w * s); c.height = Math.round(h * s);
    const ctx = c.getContext('2d'); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(src, 0, 0, c.width, c.height);
    if (src.close) src.close();
    return c;
  }
  // Cantos sugeridos para uma foto (null se não achar a folha).
  async function sugerirCantos(blob){
    const c = await carregarCanvas(blob, 360);
    const { width: w, height: h } = c, d = c.getContext('2d').getImageData(0, 0, w, h).data;
    const g = new Uint8Array(w * h);
    for (let k = 0, j = 0; j < g.length; k += 4, j++) g[j] = (d[k] * 0.299 + d[k + 1] * 0.587 + d[k + 2] * 0.114) | 0;
    c.width = c.height = 0;
    return detectQuad(g, w, h);
  }
  // Imagem final do checklist: endireitada, lado maior = lado, JPEG.
  async function digitalizar(blob, q, lado, quality, realcar){
    const src = await carregarCanvas(blob, 2600);
    const { W, H } = tamanhoSaida(q, src.width, src.height, lado);
    const out = endireitar(src, q, W, H, realcar);
    src.width = src.height = 0;
    const res = await canvasToBlob(out, quality);
    out.width = out.height = 0;
    return { blob: res, width: W, height: H };
  }

  /* Tela de enquadramento: foto com os 4 cantos para arrastar.
     openDocFrame(blob, quad) -> Promise<{ quad, realcar } | null>  (null = cancelou) */
  function openDocFrame(blob, quadInicial, realcarInicial){
    return new Promise(async (resolve) => {
      const src = await decode(blob);
      const { w: iw, h: ih } = dims(src);
      let quad = (quadInicial || QUAD_PADRAO).map(p => ({ ...p }));
      let realcar = realcarInicial !== false;
      let arrastando = -1;
      const wrap = document.createElement('div');
      wrap.className = 'annot-modal';
      wrap.innerHTML = `
        <div class="annot-top">
          <strong>Checklist: enquadre a folha</strong>
          <span>Arraste os círculos até os cantos da folha. A faixa laranja (▲ TOPO) é o alto da folha no relatório: se não for, toque em ↻ Girar.</span>
        </div>
        <div class="annot-stage"><canvas></canvas></div>
        <label class="doc-realce"><input type="checkbox" ${realcar ? 'checked' : ''}> Fundo branco (realçar a escrita)</label>
        <div class="annot-bar">
          <button type="button" class="btn-tool" data-a="girar">↻ Girar</button>
          <button type="button" class="btn-tool" data-a="auto">🔍 Achar cantos</button>
          <button type="button" class="btn-tool ghost" data-a="cancel">Cancelar</button>
          <button type="button" class="btn-tool ok" data-a="ok">✓ Usar</button>
        </div>`;
      document.body.appendChild(wrap);
      document.body.classList.add('modal-open');
      const stage = wrap.querySelector('.annot-stage'), canvas = wrap.querySelector('canvas'), ctx = canvas.getContext('2d');
      let cw = 0, ch = 0;
      function layout(){
        const s = Math.min((stage.clientWidth - 24) / iw, (stage.clientHeight - 24) / ih);
        cw = Math.round(iw * s); ch = Math.round(ih * s);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = cw * dpr; canvas.height = ch * dpr; canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); render();
      }
      function render(){
        ctx.clearRect(0, 0, cw, ch); ctx.drawImage(src, 0, 0, cw, ch);
        const P = quad.map(p => [p.x * cw, p.y * ch]);
        ctx.save();                                       // escurece o que fica fora da folha
        ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.beginPath(); ctx.rect(0, 0, cw, ch);
        ctx.moveTo(...P[0]); P.slice(1).forEach(p => ctx.lineTo(...p)); ctx.closePath(); ctx.fill('evenodd');
        ctx.strokeStyle = '#33D17A'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(...P[0]); P.slice(1).forEach(p => ctx.lineTo(...p)); ctx.closePath(); ctx.stroke();
        // lado que será o topo da folha no relatório
        ctx.strokeStyle = '#FF9F1C'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(...P[0]); ctx.lineTo(...P[1]); ctx.stroke();
        const mx = (P[0][0] + P[1][0]) / 2, my = (P[0][1] + P[1][1]) / 2;
        ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const rot = Math.atan2(P[1][1] - P[0][1], P[1][0] - P[0][0]);
        ctx.save(); ctx.translate(mx, my); ctx.rotate(rot); ctx.fillStyle = '#FF9F1C'; ctx.fillRect(-46, 8, 92, 22);
        ctx.fillStyle = '#000'; ctx.fillText('▲ TOPO', 0, 19); ctx.restore();
        P.forEach(([x, y], k) => { ctx.beginPath(); ctx.arc(x, y, k === arrastando ? 20 : 15, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(51,209,122,.35)'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke(); });
        ctx.restore();
      }
      const pos = e => { const r = canvas.getBoundingClientRect();
        return { x: Math.min(Math.max((e.clientX - r.left) / cw, 0), 1), y: Math.min(Math.max((e.clientY - r.top) / ch, 0), 1) }; };
      canvas.addEventListener('pointerdown', e => {
        e.preventDefault(); const p = pos(e);
        let k = -1, dmin = Infinity;
        quad.forEach((q, i) => { const dd = Math.hypot((q.x - p.x) * cw, (q.y - p.y) * ch); if (dd < dmin){ dmin = dd; k = i; } });
        if (dmin > 60) return;                            // toque longe dos cantos: ignora
        arrastando = k; canvas.setPointerCapture(e.pointerId); render();
      });
      canvas.addEventListener('pointermove', e => { if (arrastando < 0) return; quad[arrastando] = pos(e); render(); });
      const soltar = () => { arrastando = -1; render(); };
      canvas.addEventListener('pointerup', soltar); canvas.addEventListener('pointercancel', soltar);
      wrap.querySelector('.doc-realce input').onchange = e => { realcar = e.target.checked; };
      function close(r){ window.removeEventListener('resize', layout); document.body.classList.remove('modal-open'); wrap.remove(); if (src.close) src.close(); resolve(r); }
      wrap.querySelector('.annot-bar').addEventListener('click', async e => {
        const a = e.target.closest('[data-a]'); if (!a) return;
        if (a.dataset.a === 'auto'){ const q = await sugerirCantos(blob); quad = deitarSeEmPe(q || QUAD_PADRAO.map(p => ({ ...p })), iw, ih); render(); }
        else if (a.dataset.a === 'girar'){ quad = girarQuad(quad, 1); render(); }
        else if (a.dataset.a === 'cancel') close(null);
        else if (a.dataset.a === 'ok') close({ quad, realcar });
      });
      window.addEventListener('resize', layout);
      requestAnimationFrame(layout);
    });
  }

  root.SAS_IMG = { decode, resizeToJpeg, burnCircles, openCircleEditor, sugerirCantos, digitalizar, openDocFrame, detectQuad, homografia, girarQuad, deitarSeEmPe, dims };
})(window);
