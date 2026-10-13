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

  root.SAS_IMG = { decode, resizeToJpeg, burnCircles, openCircleEditor };
})(window);
