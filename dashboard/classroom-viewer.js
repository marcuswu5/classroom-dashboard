(function () {
  'use strict';

  const CW = 36,
    CH = 40,
    MARGIN_X = 28,
    MARGIN_Y = 28,
    MAX_CHAIRS_ROW = 48;
  const DEFAULT_FLOOR_W = 1020,
    DEFAULT_FLOOR_H = 640;
  const FLOOR_W_MIN = 400,
    FLOOR_W_MAX = 2400,
    FLOOR_H_MIN = 300,
    FLOOR_H_MAX = 1600;
  let layoutFloorW = DEFAULT_FLOOR_W,
    layoutFloorH = DEFAULT_FLOOR_H;
  function curveXMax() {
    return layoutFloorW - MARGIN_X;
  }
  const MIN_LEAF = 48,
    LEAF_PAD = 8;
  const DEFAULT_GAP = 24;
  const CURVE_MIN = 0,
    CURVE_MAX = 50,
    GAP_C_MIN = -8,
    GAP_C_MAX = 40,
    GAP_R_MIN = -8,
    GAP_R_MAX = 50;
  const LAYOUT_FORMAT_VERSION = 1;
  const MAX_LAYOUT_DEPTH = 48;

  let layoutRoot = null;
  let globalCurve = 16,
    globalGapC = 4,
    globalGapR = 6;

  function defaultSeatLabelSettings() {
    return {
      show: false,
      rowAxis: 'letters',
      colAxis: 'numbers',
      rowOrder: 'desc',
      colOrder: 'desc',
      sep: '-',
    };
  }

  function sanitizeSeatLabels(raw) {
    const d = defaultSeatLabelSettings();
    if (!raw || typeof raw !== 'object') return d;
    d.show = !!raw.show;
    d.rowAxis = raw.rowAxis === 'numbers' ? 'numbers' : 'letters';
    d.colAxis = raw.colAxis === 'letters' ? 'letters' : 'numbers';
    d.rowOrder = raw.rowOrder === 'desc' ? 'desc' : 'asc';
    d.colOrder = raw.colOrder === 'desc' ? 'desc' : 'asc';
    const sp = typeof raw.sep === 'string' ? raw.sep.slice(0, 3) : '-';
    d.sep = sp.length ? sp : '-';
    return d;
  }

  let seatLabelSettings = defaultSeatLabelSettings();

  function clampGapStyle(s) {
    return s === 'stair' ? 'stair' : 'aisle';
  }

  function getNodeAtPathFrom(root, path) {
    let n = root;
    for (const idx of path) {
      n = getChild(n, idx);
      if (!n) return null;
    }
    return n;
  }

  function validateUi(ui, sanitizedRoot) {
    const sl = sanitizeSeatLabels(ui.seatLabels);
    const d = { selectKind: 'leaf', selectPath: [], seatLabels: sl };
    const path = Array.isArray(ui.selectPath) ? ui.selectPath.map((x) => parseInt(x, 10)) : [];
    if (path.length > MAX_LAYOUT_DEPTH) return d;
    if (path.some((x) => x !== 0 && x !== 1)) return d;
    const n = getNodeAtPathFrom(sanitizedRoot, path);
    if (!n) return d;
    const kind = ui.selectKind === 'split' ? 'split' : 'leaf';
    if (kind === 'split' && (n.type === 'v' || n.type === 'h'))
      return { selectKind: 'split', selectPath: path.slice(), seatLabels: sl };
    if (n.type === 'leaf') return { selectKind: 'leaf', selectPath: path.slice(), seatLabels: sl };
    return d;
  }

  function sanitizeLayoutNode(node, depth) {
    if (depth > MAX_LAYOUT_DEPTH) throw new Error('Layout too deep');
    if (!node || typeof node !== 'object') throw new Error('Invalid node');
    if (node.type === 'leaf') {
      const id = typeof node.id === 'number' && Number.isFinite(node.id) ? Math.floor(node.id) : 0;
      let mainRows = node.mainRows;
      if (!Array.isArray(mainRows) || !mainRows.length) mainRows = [5];
      mainRows = mainRows.map((n0) => {
        const x = parseInt(n0, 10);
        if (isNaN(x)) return 1;
        return Math.min(MAX_CHAIRS_ROW, Math.max(0, x));
      });
      return { type: 'leaf', id, mainRows };
    }
    if (node.type === 'v') {
      const ratio =
        typeof node.ratio === 'number' && Number.isFinite(node.ratio)
          ? Math.min(0.99, Math.max(0.01, node.ratio))
          : 0.5;
      let gap = +node.gap;
      if (isNaN(gap)) gap = DEFAULT_GAP;
      gap = Math.min(80, Math.max(8, gap));
      return {
        type: 'v',
        ratio,
        gap,
        gapStyle: clampGapStyle(node.gapStyle),
        left: sanitizeLayoutNode(node.left, depth + 1),
        right: sanitizeLayoutNode(node.right, depth + 1),
      };
    }
    if (node.type === 'h') {
      const ratio =
        typeof node.ratio === 'number' && Number.isFinite(node.ratio)
          ? Math.min(0.99, Math.max(0.01, node.ratio))
          : 0.5;
      let gap = +node.gap;
      if (isNaN(gap)) gap = DEFAULT_GAP;
      gap = Math.min(80, Math.max(8, gap));
      return {
        type: 'h',
        ratio,
        gap,
        gapStyle: clampGapStyle(node.gapStyle),
        top: sanitizeLayoutNode(node.top, depth + 1),
        bottom: sanitizeLayoutNode(node.bottom, depth + 1),
      };
    }
    throw new Error('Unknown layout node type');
  }

  function requireFloorDim(v, min, max) {
    const x = Math.round(+v);
    if (!Number.isFinite(x)) throw new Error('Invalid data: floorW and floorH are required');
    return Math.min(max, Math.max(min, x));
  }

  function parseSnapshotShape(raw) {
    if (!raw || typeof raw !== 'object') throw new Error('Invalid data');
    if (raw.formatVersion !== LAYOUT_FORMAT_VERSION) throw new Error('Unsupported file version');
    if (!raw.ui || typeof raw.ui !== 'object') throw new Error('Invalid data: ui is required');
    if (!raw.ui.seatLabels || typeof raw.ui.seatLabels !== 'object')
      throw new Error('Invalid data: ui.seatLabels is required');
    const layoutRoot0 = sanitizeLayoutNode(raw.layoutRoot, 0);
    const gc = Math.round(+raw.globalCurve);
    const gC = Math.round(+raw.globalGapC);
    const gR = Math.round(+raw.globalGapR);
    if (![gc, gC, gR].every((x) => Number.isFinite(x))) throw new Error('Invalid spacing values');
    const globalCurve0 = Math.min(CURVE_MAX, Math.max(CURVE_MIN, gc));
    const globalGapC0 = Math.min(GAP_C_MAX, Math.max(GAP_C_MIN, gC));
    const globalGapR0 = Math.min(GAP_R_MAX, Math.max(GAP_R_MIN, gR));
    const floorW = requireFloorDim(raw.floorW, FLOOR_W_MIN, FLOOR_W_MAX);
    const floorH = requireFloorDim(raw.floorH, FLOOR_H_MIN, FLOOR_H_MAX);
    const ui = validateUi(raw.ui, layoutRoot0);
    const name = typeof raw.name === 'string' ? raw.name.slice(0, 80).trim() : '';
    const seatLabels = ui.seatLabels;
    return {
      layoutRoot: layoutRoot0,
      globalCurve: globalCurve0,
      globalGapC: globalGapC0,
      globalGapR: globalGapR0,
      floorW,
      floorH,
      ui,
      seatLabels,
      name: name || 'Untitled',
    };
  }

  function getChild(node, idx) {
    if (node.type === 'v') return idx === 0 ? node.left : node.right;
    if (node.type === 'h') return idx === 0 ? node.top : node.bottom;
    return null;
  }

  function countLeaves(node) {
    if (node.type === 'leaf') return 1;
    if (node.type === 'v') return countLeaves(node.left) + countLeaves(node.right);
    return countLeaves(node.top) + countLeaves(node.bottom);
  }

  function bendYAtX(cx, xMin, xMax, amt) {
    if (xMax - xMin <= 1e-6) return 0;
    const t = (cx - xMin) / (xMax - xMin);
    const tn = Math.min(1, Math.max(0, t));
    const n = tn * 2 - 1;
    return amt * n * n;
  }

  /** 0-based index to Excel-style column letters (0→A, 25→Z, 26→AA). */
  function indexToLetters(zeroBased) {
    let n = Math.floor(zeroBased);
    if (n < 0) n = 0;
    n++;
    let s = '';
    while (n > 0) {
      n--;
      s = String.fromCharCode(65 + (n % 26)) + s;
      n = Math.floor(n / 26);
    }
    return s || 'A';
  }

  function formatSeatAxis(mode, displayIndex) {
    if (mode === 'letters') return indexToLetters(displayIndex);
    return String(displayIndex + 1);
  }

  /**
   * gr = global row (0 = top of floor). gcol = column slot 0..gnCol-1 with slot 0 = rightmost seat in that row.
   */
  function computeSeatLabel(gm, gnCol, gr, gcol) {
    const cfg = seatLabelSettings;
    const rowDisp = cfg.rowOrder === 'desc' ? gm - 1 - gr : gr;
    const colDisp = cfg.colOrder === 'desc' ? gcol : gnCol - 1 - gcol;
    const rowPart = formatSeatAxis(cfg.rowAxis, rowDisp);
    const colPart = formatSeatAxis(cfg.colAxis, colDisp);
    const sep = cfg.sep || '-';
    return rowPart + sep + colPart;
  }

  /** Logical row height (curve removed) so global row bands align across the floor. */
  function seatLogicalRowY(ch) {
    const ix = ch.cx + CW / 2;
    return ch.cy + CH / 2 - bendYAtX(ix, MARGIN_X, curveXMax(), globalCurve);
  }

  /** Assign ch.gr in 0..gm-1 (0 = top of floor). Returns gm. */
  function assignGlobalRowIndices(chairs) {
    if (!chairs.length) return 1;
    for (const ch of chairs) ch._ly = seatLogicalRowY(ch);
    const sorted = [...chairs].sort((a, b) => a._ly - b._ly);
    const stepY = CH + Math.max(0, globalGapR);
    const thresh = stepY * 0.55;
    const clusters = [];
    for (const ch of sorted) {
      const ly = ch._ly;
      if (!clusters.length) clusters.push({ sum: ly, count: 1, members: [ch] });
      else {
        const last = clusters[clusters.length - 1];
        const avg = last.sum / last.count;
        if (Math.abs(ly - avg) <= thresh) {
          last.sum += ly;
          last.count++;
          last.members.push(ch);
        } else clusters.push({ sum: ly, count: 1, members: [ch] });
      }
    }
    const gm = clusters.length;
    clusters.forEach((cl, gr) => {
      for (const m of cl.members) {
        m.gr = gr;
        delete m._ly;
      }
    });
    return gm;
  }

  /** Within each global row, set gcol (0 = rightmost) and gnCol = seats in that row — continues across aisles. */
  function assignGlobalColumnIndices(chairs) {
    const byRow = new Map();
    for (const ch of chairs) {
      if (!byRow.has(ch.gr)) byRow.set(ch.gr, []);
      byRow.get(ch.gr).push(ch);
    }
    for (const rowChairs of byRow.values()) {
      rowChairs.sort((a, b) => b.cx + CW / 2 - (a.cx + CW / 2));
      const gnCol = rowChairs.length;
      rowChairs.forEach((ch, gcol) => {
        ch.gnCol = gnCol;
        ch.gcol = gcol;
      });
    }
  }

  function partitionV(w, gap, ratio) {
    const g = Math.min(gap, Math.max(0, w - 2 * MIN_LEAF));
    const inner = w - g;
    let lw = inner * ratio,
      rw = inner - lw;
    if (lw < MIN_LEAF) {
      lw = MIN_LEAF;
      rw = inner - lw;
    }
    if (rw < MIN_LEAF) {
      rw = MIN_LEAF;
      lw = inner - rw;
    }
    if (lw < MIN_LEAF || rw < MIN_LEAF) {
      lw = inner / 2;
      rw = inner - lw;
    }
    return { gap: g, lw, rw };
  }

  function partitionH(h, gap, ratio) {
    const g = Math.min(gap, Math.max(0, h - 2 * MIN_LEAF));
    const inner = h - g;
    let th = inner * ratio,
      bh = inner - th;
    if (th < MIN_LEAF) {
      th = MIN_LEAF;
      bh = inner - th;
    }
    if (bh < MIN_LEAF) {
      bh = MIN_LEAF;
      th = inner - bh;
    }
    if (th < MIN_LEAF || bh < MIN_LEAF) {
      th = inner / 2;
      bh = inner - th;
    }
    return { gap: g, th, bh };
  }

  function assignRects(node, x, y, w, h, pathToNode) {
    if (node.type === 'leaf') {
      return [{ kind: 'leaf', node, path: pathToNode.slice(), rect: { x, y, w, h } }];
    }
    if (node.type === 'v') {
      const { gap: g, lw, rw } = partitionV(w, node.gap, node.ratio);
      const out = [];
      out.push(...assignRects(node.left, x, y, lw, h, pathToNode.concat([0])));
      out.push({
        kind: 'gap',
        split: node,
        path: pathToNode.slice(),
        rect: { x: x + lw, y, w: g, h },
        style: node.gapStyle,
      });
      out.push(...assignRects(node.right, x + lw + g, y, rw, h, pathToNode.concat([1])));
      return out;
    }
    const { gap: g, th, bh } = partitionH(h, node.gap, node.ratio);
    const out = [];
    out.push(...assignRects(node.top, x, y, w, th, pathToNode.concat([0])));
    out.push({
      kind: 'gap',
      split: node,
      path: pathToNode.slice(),
      rect: { x, y: y + th, w, h: g },
      style: node.gapStyle,
    });
    out.push(...assignRects(node.bottom, x, y + th + g, w, bh, pathToNode.concat([1])));
    return out;
  }

  function assignRectsRoot() {
    return assignRects(layoutRoot, MARGIN_X, MARGIN_Y, layoutFloorW - 2 * MARGIN_X, layoutFloorH - 2 * MARGIN_Y, []);
  }

  function buildLeafChairs(leaf, rect) {
    const pad = LEAF_PAD;
    const innerLeft = rect.x + pad,
      innerTop = rect.y + pad;
    const innerW = rect.w - 2 * pad,
      innerH = rect.h - 2 * pad;
    const out = [];
    if (innerW < CW || innerH < CH) return out;

    const gapC = globalGapC,
      gapR = globalGapR,
      amt = globalCurve;
    const stepX = CW + gapC,
      stepY = CH + gapR;
    const rows = leaf.mainRows;
    const nm = rows.length;
    if (!nm) return out;

    const yCursor = innerTop;
    const maxCols = Math.max(1, ...rows);
    const colXs = [0];
    for (let c = 0; c < maxCols; c++) colXs.push(colXs[c] + stepX);
    for (let r = 0; r < nm; r++) {
      const ncr = Math.min(rows[r], maxCols);
      const rowW = colXs[ncr] - colXs[0] + CW;
      const dx = Math.max(0, (innerW - rowW) / 2);
      for (let c = 0; c < ncr; c++) {
        let cx = innerLeft + dx + colXs[c];
        let cy = yCursor + r * stepY;
        cy += bendYAtX(cx + CW / 2, MARGIN_X, curveXMax(), amt);
        const ix = cx + CW / 2,
          iy = cy + CH / 2;
        if (ix >= rect.x && ix <= rect.x + rect.w && iy >= rect.y && iy <= rect.y + rect.h)
          out.push({ cx, cy, r, c });
      }
    }
    return out;
  }

  function buildChairLayout() {
    const items = assignRectsRoot();
    const all = [];
    for (const it of items) {
      if (it.kind !== 'leaf') continue;
      all.push(...buildLeafChairs(it.node, it.rect));
    }
    const gm = assignGlobalRowIndices(all);
    assignGlobalColumnIndices(all);
    for (const ch of all) ch.label = computeSeatLabel(gm, ch.gnCol, ch.gr, ch.gcol);
    return all;
  }

  function drawAisleRect(ctx, x, y, w, h) {
    ctx.save();
    ctx.fillStyle = '#E0D8CC';
    ctx.strokeStyle = '#B8B0A4';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([8, 6]);
    ctx.strokeStyle = '#C0B8A8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const midY = y + h / 2;
    for (let px = x + 8; px <= x + w - 8; px += 4) {
      if (px === x + 8) ctx.moveTo(px, midY);
      else ctx.lineTo(px, midY);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(100,90,75,.45)';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('aisle', x + w / 2, y + h / 2);
    ctx.restore();
  }

  function drawStairInRect(ctx, x, y, w, h) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    const steps = 10,
      sh = h / steps;
    for (let i = 0; i < steps; i++) {
      const yy = y + i * sh;
      ctx.fillStyle = 'rgba(80,55,25,' + (0.04 + i * 0.028) + ')';
      ctx.fillRect(x + 1, yy + 1, w - 2, sh - 2);
      if (i > 0) {
        ctx.strokeStyle = '#9B8B70';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 2, yy);
        ctx.lineTo(x + w - 2, yy);
        ctx.stroke();
      }
    }
    ctx.fillStyle = 'rgba(70,50,20,.55)';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('▲', x + w / 2, y + h / 2);
    ctx.restore();
  }

  function drawArmchair(ctx, x, y) {
    const sx = CW / 680,
      sy = CH / 720;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(sx, sy);
    const base = '#E8D5C0',
      str = '#5A3E28',
      cush = '#D4B896',
      legs = '#CDB898',
      dsk = '#C8B880';
    function P(d) {
      return new Path2D(d);
    }
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    function fi(p, f, lw) {
      ctx.fillStyle = f;
      ctx.strokeStyle = str;
      ctx.lineWidth = lw;
      ctx.fill(p);
      ctx.stroke(p);
    }
    fi(
      P(
        'M200 430 C192 420 185 360 188 300 C190 245 198 200 210 185 C225 165 255 155 340 152 C425 155 455 165 470 185 C482 200 490 245 492 300 C495 360 488 420 480 430 Z'
      ),
      base,
      7
    );
    fi(P('M200 430 C190 432 168 435 155 438 C138 442 132 450 130 460 C128 472 132 485 140 490 C150 496 170 497 185 495 C200 493 210 488 215 480 C220 470 220 455 218 442 Z'), base, 6);
    fi(P('M480 430 C490 432 512 435 525 438 C542 442 548 450 550 460 C552 472 548 485 540 490 C530 496 510 497 495 495 C480 493 470 488 465 480 C460 470 460 455 462 442 Z'), base, 6);
    fi(P('M195 440 C195 460 198 490 205 510 C212 528 225 535 340 536 C455 535 468 528 475 510 C482 490 485 460 485 440 Z'), base, 7);
    fi(P('M220 440 C218 452 220 468 228 478 C240 490 280 496 340 496 C400 496 440 490 452 478 C460 468 462 452 460 440 C450 430 410 423 340 423 C270 423 230 430 220 440 Z'), cush, 5);
    ctx.beginPath();
    ctx.moveTo(260, 464);
    ctx.quadraticCurveTo(300, 458, 340, 456);
    ctx.quadraticCurveTo(380, 458, 420, 464);
    ctx.strokeStyle = str;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.globalAlpha = 1;
    [P('M225 530 C222 545 220 558 218 572 C217 580 220 586 228 587 C237 588 244 583 246 574 C248 560 248 545 246 530 Z'), P('M435 530 C438 545 440 558 442 572 C443 580 440 586 432 587 C423 588 416 583 414 574 C412 560 412 545 414 530 Z')].forEach((l) => fi(l, legs, 6));
    [
      [240, 220, 440, 222, 2.5, 0.3],
      [225, 265, 455, 265, 2, 0.2],
    ].forEach(([x1, y1, x2, y2, lw, a]) => {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo((x1 + x2) / 2, (y1 + y2) / 2 - 8, x2, y2);
      ctx.strokeStyle = str;
      ctx.globalAlpha = a;
      ctx.lineWidth = lw;
      ctx.stroke();
      ctx.globalAlpha = 1;
    });
    fi(P('M532 418 C530 414 522 410 370 410 C330 410 312 413 308 419 C305 424 306 440 310 445 C314 450 332 453 370 453 C522 453 530 449 532 445 Z'), dsk, 5);
    ctx.beginPath();
    ctx.arc(532, 450, 5.5, 0, Math.PI * 2);
    ctx.fillStyle = '#C8B89A';
    ctx.fill();
    ctx.strokeStyle = str;
    ctx.lineWidth = 3.5;
    ctx.stroke();
    ctx.strokeStyle = str;
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(532, 450);
    ctx.bezierCurveTo(525, 462, 510, 472, 498, 478);
    ctx.stroke();
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(498, 453);
    ctx.bezierCurveTo(500, 464, 504, 474, 510, 482);
    ctx.bezierCurveTo(516, 490, 524, 494, 530, 486);
    ctx.stroke();
    [
      [510, 423, 360, 422],
      [514, 432, 358, 431],
      [512, 442, 360, 441],
    ].forEach(([x1, y1, x2, y2], i) => {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = str;
      ctx.globalAlpha = 0.25 - i * 0.05;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawSeatLabels(ctx, chairs) {
    if (!seatLabelSettings.show) return;
    ctx.save();
    const fz = Math.max(8, Math.min(11, 10 * (layoutFloorW / 1020)));
    const lw = Math.max(2, 2.2 * (layoutFloorW / 1020));
    for (const ch of chairs) {
      if (!ch.label) continue;
      const tx = ch.cx + CW / 2,
        ty = ch.cy + CH * 0.34;
      ctx.font = 'bold ' + fz + 'px Helvetica Neue,Helvetica,Arial,sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = lw;
      ctx.strokeStyle = 'rgba(253,250,245,.92)';
      ctx.fillStyle = 'rgba(42,34,24,.92)';
      ctx.strokeText(ch.label, tx, ty);
      ctx.fillText(ch.label, tx, ty);
    }
    ctx.restore();
  }

  function draw() {
    const cv = document.getElementById('cv');
    const wrap = document.getElementById('canvasWrap');
    if (!cv || !layoutRoot || !wrap) return;

    const pad = 8;
    const availW = Math.max(1, wrap.clientWidth - pad);
    const availH = Math.max(1, wrap.clientHeight - pad);
    const scale = Math.min(availW / layoutFloorW, availH / layoutFloorH);
    const dpr = window.devicePixelRatio || 1;
    const bw = Math.max(1, Math.round(layoutFloorW * scale * dpr));
    const bh = Math.max(1, Math.round(layoutFloorH * scale * dpr));
    cv.width = bw;
    cv.height = bh;
    cv.style.width = Math.round(layoutFloorW * scale) + 'px';
    cv.style.height = Math.round(layoutFloorH * scale) + 'px';
    const ctx = cv.getContext('2d');
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    ctx.clearRect(0, 0, layoutFloorW, layoutFloorH);

    const flat = assignRectsRoot();
    for (const it of flat) {
      if (it.kind === 'gap') {
        if (it.style === 'stair') drawStairInRect(ctx, it.rect.x, it.rect.y, it.rect.w, it.rect.h);
        else drawAisleRect(ctx, it.rect.x, it.rect.y, it.rect.w, it.rect.h);
      }
    }

    const chairs = buildChairLayout();
    for (const ch of chairs) drawArmchair(ctx, ch.cx, ch.cy);
    drawSeatLabels(ctx, chairs);

    const tot = chairs.length;
    const statsEl = document.getElementById('stats');
    if (statsEl) {
      statsEl.innerHTML =
        '<div class="stat">Zones <strong>' +
        countLeaves(layoutRoot) +
        '</strong></div>' +
        '<div class="stat">Seats <strong>' +
        tot +
        '</strong></div>';
    }
  }

  function syncSeatLabelsButton() {
    const btn = document.getElementById('btnSeatLabels');
    if (!btn) return;
    const on = !!seatLabelSettings.show;
    btn.disabled = !layoutRoot;
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.setAttribute('aria-label', on ? 'Seat labels on. Click to hide.' : 'Seat labels off. Click to show.');
  }

  function setViewMode(hasLayout) {
    const wrap = document.getElementById('canvasWrap');
    const cv = document.getElementById('cv');
    const emptyMsg = document.getElementById('emptyMsg');
    const hud = document.getElementById('hud');
    if (wrap) wrap.classList.toggle('is-empty', !hasLayout);
    if (cv) cv.hidden = !hasLayout;
    if (emptyMsg) emptyMsg.hidden = hasLayout;
    if (hud) hud.hidden = !hasLayout;
    syncSeatLabelsButton();
  }

  function setStatus(msg, isErr) {
    const el = document.getElementById('status');
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('err', !!isErr);
  }

  function applyPayload(text) {
    const raw = JSON.parse(text);
    const p = parseSnapshotShape(raw);
    layoutRoot = p.layoutRoot;
    globalCurve = p.globalCurve;
    globalGapC = p.globalGapC;
    globalGapR = p.globalGapR;
    layoutFloorW = p.floorW;
    layoutFloorH = p.floorH;
    seatLabelSettings = sanitizeSeatLabels(p.seatLabels);
    const titleEl = document.getElementById('layoutTitle');
    if (titleEl) titleEl.textContent = p.name;
    document.title = p.name + ' — Classroom viewer';
    setViewMode(true);
    setStatus('Loaded.', false);
    requestAnimationFrame(() => {
      draw();
      requestAnimationFrame(() => draw());
    });
  }

  function handleFile(file) {
    if (!file) return;
    setStatus('Reading…', false);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        applyPayload(String(reader.result));
      } catch (e) {
        layoutRoot = null;
        layoutFloorW = DEFAULT_FLOOR_W;
        layoutFloorH = DEFAULT_FLOOR_H;
        seatLabelSettings = defaultSeatLabelSettings();
        const titleEl = document.getElementById('layoutTitle');
        if (titleEl) titleEl.textContent = '';
        document.title = 'Classroom viewer';
        setViewMode(false);
        setStatus(e.message || 'Could not read file.', true);
      }
    };
    reader.onerror = () => {
      setStatus('Could not read file.', true);
    };
    reader.readAsText(file);
  }

  function init() {
    const fileInput = document.getElementById('fileInput');
    const btnPick = document.getElementById('btnPick');
    const canvasWrap = document.getElementById('canvasWrap');
    const floor = document.getElementById('floor');

    if (btnPick && fileInput) {
      btnPick.addEventListener('click', () => {
        fileInput.value = '';
        fileInput.click();
      });
    }

    const btnSeatLabels = document.getElementById('btnSeatLabels');
    if (btnSeatLabels) {
      btnSeatLabels.addEventListener('click', () => {
        if (!layoutRoot) return;
        seatLabelSettings.show = !seatLabelSettings.show;
        syncSeatLabelsButton();
        draw();
      });
    }

    if (fileInput) {
      fileInput.addEventListener('change', () => {
        const f = fileInput.files && fileInput.files[0];
        if (f) handleFile(f);
      });
    }

    function bindDropTarget(el) {
      if (!el) return;
      el.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        el.classList.add('dragover');
      });
      el.addEventListener('dragleave', (e) => {
        e.preventDefault();
        if (!el.contains(e.relatedTarget)) el.classList.remove('dragover');
      });
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        el.classList.remove('dragover');
        const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) handleFile(f);
      });
    }

    bindDropTarget(canvasWrap);
    bindDropTarget(floor);

    let resizeTimer = null;
    function scheduleDraw() {
      if (!layoutRoot) return;
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => draw(), 80);
    }

    window.addEventListener('resize', scheduleDraw);

    if (canvasWrap && typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => scheduleDraw());
      ro.observe(canvasWrap);
    }

    setViewMode(false);

    initGoogleFormsIntegration();
  }

  function extractFormIdFromUrl(text) {
    const raw = String(text || '').trim();
    if (!raw) return { id: '', error: '' };
    const mE = raw.match(/\/forms\/d\/e\/([^/?#]+)/i);
    if (mE) return { id: mE[1].trim(), error: '' };
    const mD = raw.match(/\/forms\/d\/([^/?#]+)/i);
    if (mD) {
      const seg = mD[1].trim();
      if (seg.toLowerCase() === 'e') {
        const m2 = raw.match(/\/forms\/d\/e\/([^/?#]+)/i);
        if (m2) return { id: m2[1].trim(), error: '' };
        return {
          id: '',
          error:
            'That link could not be read. Copy the full address from Google Forms (starts with docs.google.com).',
        };
      }
      return { id: seg, error: '' };
    }
    if (/^[a-zA-Z0-9_-]+$/.test(raw) && raw.length >= 6) return { id: raw, error: '' };
    return {
      id: '',
      error:
        'Paste the full form link from your browser, or the long ID by itself. If you only have a short forms.gle link, open it once, then copy the long address.',
    };
  }

  function formsAppOriginHint() {
    if (typeof window === 'undefined') return 'this app’s web address';
    const p = window.location.protocol;
    if (p === 'http:' || p === 'https:') return window.location.origin;
    return 'the web address for this app (not a file on your desktop)';
  }

  function initGoogleFormsIntegration() {
    const LS_KEY = 'cd.formsFormId';
    const bar = document.getElementById('formsBar');
    const input = document.getElementById('formsFormId');
    const linkRedirect = document.getElementById('formsLinkRedirect');
    const btnGis = document.getElementById('formsBtnGis');
    const btnRefresh = document.getElementById('formsBtnRefresh');
    const btnDisc = document.getElementById('formsBtnDisconnect');
    const st = document.getElementById('formsStatus');
    const out = document.getElementById('formsOut');
    if (!bar || !input) return;

    let cfg = { clientId: '', scopes: [] };
    let gisReady = false;

    function formsSetStatus(msg, ok) {
      if (!st) return;
      st.textContent = msg || '';
      st.classList.toggle('ok', !!ok);
    }

    function friendlyOAuthQueryParam(err) {
      const raw = decodeURIComponent(String(err || '').replace(/\+/g, ' '));
      const c = raw.toLowerCase();
      if (c.includes('access_denied')) {
        return 'Sign-in was cancelled. Click “Sign in with Google” again when you are ready.';
      }
      if (c.includes('invalid_client') || c.includes('unauthorized_client')) {
        return 'Google sign-in is not configured correctly on this computer. Ask whoever set up the app to check the Google Cloud client ID and secret.';
      }
      if (c.includes('redirect_uri_mismatch')) {
        return 'The sign-in address does not match Google Cloud settings. The redirect URL in Google Cloud must match this app (see server instructions).';
      }
      if (c.includes('missing_code')) {
        return 'Sign-in did not finish. Please try “Sign in with Google” again.';
      }
      if (c.includes('invalid_state')) {
        return 'That sign-in session expired. Please try “Sign in with Google” again.';
      }
      if (raw.length > 120) {
        return 'Something went wrong while connecting to Google. Try again, or use the other sign-in option.';
      }
      return 'Could not connect to Google: ' + raw;
    }

    function friendlyApiSummaryError(status, body) {
      if (status === 404) {
        return 'That form was not found. Check the link or ID, and make sure you are signed in with the Google account that owns the form.';
      }
      if (status === 403) {
        return 'Google did not allow access to that form. Sign in with the account that owns or edits the form.';
      }
      const msg = (body && (body.message || body.error)) || '';
      const m = String(msg).toLowerCase();
      if (m.includes('not found') || m.includes('404')) {
        return 'That form was not found. Double-check the link or ID.';
      }
      if (m.includes('permission') || m.includes('403')) {
        return 'You may need to sign in with the Google account that owns this form.';
      }
      return 'Could not load results right now. Check your internet connection and try “Update results” again.';
    }

    /** Returns resolved form id, or '' if empty/invalid (sets status on invalid paste). */
    function normalizeFormFieldAndSave() {
      const raw = (input.value || '').trim();
      if (!raw) return '';
      const parsed = extractFormIdFromUrl(raw);
      if (parsed.id) {
        input.value = parsed.id;
        try {
          localStorage.setItem(LS_KEY, parsed.id);
        } catch {
          /* ignore */
        }
        return parsed.id;
      }
      if (parsed.error) formsSetStatus(parsed.error, false);
      return '';
    }

    function escapeHtml(s) {
      return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }
    function escapeAttr(s) {
      return String(s).replace(/"/g, '%22');
    }

    async function loadConfig() {
      try {
        const r = await fetch('/api/auth/config', { credentials: 'same-origin' });
        if (!r.ok) throw new Error('config');
        cfg = await r.json();
        return true;
      } catch {
        return false;
      }
    }

    async function loadAuthStatus() {
      try {
        const r = await fetch('/api/auth/status', { credentials: 'same-origin' });
        if (!r.ok) throw new Error('bad');
        return await r.json();
      } catch {
        return { connected: false };
      }
    }

    function renderSummary(data) {
      if (!out) return;
      const lines = [];
      lines.push('<strong>' + escapeHtml(data.title) + '</strong>');
      if (data.responderUrl) {
        lines.push(
          'Link for students: <a href="' +
            escapeAttr(data.responderUrl) +
            '" target="_blank" rel="noopener">' +
            escapeHtml(data.responderUrl) +
            '</a>'
        );
      }
      const a = data.attendance;
      lines.push(
        'Total responses: <strong>' +
          a.responseCount +
          '</strong> · Different email addresses: <strong>' +
          a.uniqueRespondents +
          '</strong>'
      );
      const qz = data.quiz;
      if (qz && qz.questions && qz.questions.length) {
        lines.push('<div class="forms-quiz">Quiz questions');
        if (qz.overallPercentCorrect != null) {
          lines.push(
            ' · About <strong>' +
              qz.overallPercentCorrect +
              '%</strong> correct on average</div><ul>'
          );
        } else {
          lines.push('</div><ul>');
        }
        for (const q of qz.questions) {
          const pct = q.percentCorrect != null ? q.percentCorrect + '%' : '—';
          lines.push(
            '<li>' +
              escapeHtml(q.title) +
              ': <strong>' +
              pct +
              '</strong> (' +
              q.correctCount +
              '/' +
              q.answeredCount +
              ')</li>'
          );
        }
        lines.push('</ul>');
      } else {
        lines.push(
          '<span>No auto-graded quiz questions found. In Google Forms, turn on “Make this a quiz” and use multiple choice (or other supported types) to see scores here.</span>'
        );
      }
      out.innerHTML = lines.join('');
      out.hidden = false;
    }

    async function refreshSummary() {
      const formId = normalizeFormFieldAndSave();
      if (!formId) {
        if (!(input.value || '').trim()) {
          formsSetStatus('Paste your form link or ID above, then click “Update results”.', false);
        }
        return;
      }
      formsSetStatus('Loading results…', false);
      try {
        const r = await fetch(
          '/api/forms/' + encodeURIComponent(formId) + '/summary',
          { credentials: 'same-origin' }
        );
        if (r.status === 401) {
          formsSetStatus('Please sign in with Google first (use the button above).', false);
          return;
        }
        let j = {};
        try {
          j = await r.json();
        } catch {
          j = {};
        }
        if (!r.ok) {
          if (out) out.hidden = true;
          formsSetStatus(friendlyApiSummaryError(r.status, j), false);
          return;
        }
        renderSummary(j);
        formsSetStatus('Results are up to date.', true);
      } catch {
        if (out) out.hidden = true;
        formsSetStatus(
          'Could not reach the server. Open this page at ' +
            formsAppOriginHint() +
            ' instead of double-clicking the HTML file.',
          false
        );
      }
    }

    function tryInitGis() {
      if (!cfg.clientId || !btnGis || btnGis.dataset.gisBound === '1') return;
      const g = window.google;
      if (!g || !g.accounts || !g.accounts.oauth2 || !g.accounts.oauth2.initCodeClient) return;
      gisReady = true;
      btnGis.dataset.gisBound = '1';
      btnGis.disabled = false;
      const client = g.accounts.oauth2.initCodeClient({
        client_id: cfg.clientId,
        scope: (cfg.scopes || []).join(' '),
        ux_mode: 'popup',
        callback: async function (resp) {
          if (!resp || !resp.code) return;
            formsSetStatus('Finishing sign-in…', false);
          try {
            const r = await fetch('/api/auth/google/code', {
              method: 'POST',
              credentials: 'same-origin',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ code: resp.code }),
            });
            const j = await r.json();
            if (!r.ok) {
              const err = String(j.error || '').toLowerCase();
              if (err.includes('invalid_grant') || err.includes('bad')) {
                formsSetStatus('That sign-in did not work. Close any extra windows and try again.', false);
              } else {
                formsSetStatus('Sign-in did not finish. Try “Sign in with Google” in the main window instead.', false);
              }
              return;
            }
            formsSetStatus(
              'You are signed in' + (j.email ? ' as ' + j.email : '') + '.',
              true
            );
            if (btnDisc) btnDisc.disabled = false;
            if (btnRefresh) btnRefresh.disabled = false;
          } catch {
            formsSetStatus('Could not finish sign-in. Check your connection or use the main “Sign in with Google” button.', false);
          }
        },
      });
      btnGis.addEventListener('click', function () {
        client.requestCode();
      });
    }

    async function bootstrap() {
      const ok = await loadConfig();
      if (!ok) {
        formsSetStatus(
          'This page could not reach the forms service. Open it at ' +
            formsAppOriginHint() +
            '. If you are testing locally, run npm start in the server folder first.',
          false
        );
        if (linkRedirect) {
          linkRedirect.setAttribute('tabindex', '-1');
          linkRedirect.style.pointerEvents = 'none';
          linkRedirect.style.opacity = '0.5';
        }
        return;
      }
      const status = await loadAuthStatus();
      if (linkRedirect) {
        linkRedirect.hidden = !cfg.clientId;
        linkRedirect.removeAttribute('style');
        linkRedirect.removeAttribute('tabindex');
      }
      if (btnGis) btnGis.hidden = !cfg.clientId;
      if (btnDisc) btnDisc.disabled = !status.connected;
      if (btnRefresh) btnRefresh.disabled = !status.connected;
      if (status.connected) {
        formsSetStatus(
          'Signed in' + (status.email ? ' as ' + status.email : '') + '. You can update results below.',
          true
        );
      } else {
        formsSetStatus(
          cfg.clientId
            ? 'Next step: click “Sign in with Google” so this page can read your form responses.'
            : 'This copy of the app is not fully set up yet (missing Google client ID on the server).',
          false
        );
      }

      try {
        const saved = localStorage.getItem(LS_KEY);
        if (saved) input.value = saved;
      } catch {
        /* ignore */
      }

      tryInitGis();
      if (!gisReady) {
        let n = 0;
        const t = setInterval(function () {
          n += 1;
          tryInitGis();
          if (gisReady || n > 80) clearInterval(t);
        }, 150);
      }

      const params = new URLSearchParams(window.location.search);
      if (params.get('forms_connected')) {
        formsSetStatus('You are signed in to Google. Paste your form link, then click “Update results”.', true);
        if (btnDisc) btnDisc.disabled = false;
        if (btnRefresh) btnRefresh.disabled = false;
        window.history.replaceState({}, '', window.location.pathname);
      }
      const ferr = params.get('forms_error');
      if (ferr) {
        formsSetStatus(friendlyOAuthQueryParam(ferr), false);
        window.history.replaceState({}, '', window.location.pathname);
      }
    }

    if (btnRefresh) btnRefresh.addEventListener('click', refreshSummary);
    if (btnDisc) {
      btnDisc.addEventListener('click', async function () {
        if (
          !window.confirm(
            'Sign out from Google on this computer? You can sign in again later.'
          )
        ) {
          return;
        }
        try {
          await fetch('/api/auth/disconnect', { method: 'POST', credentials: 'same-origin' });
          if (out) out.hidden = true;
          formsSetStatus('You are signed out. Sign in again when you want to load form results.', false);
          btnDisc.disabled = true;
          if (btnRefresh) btnRefresh.disabled = true;
        } catch {
          formsSetStatus('Could not sign out. Check your connection and try again.', false);
        }
      });
    }
    input.addEventListener('blur', function () {
      const raw = (input.value || '').trim();
      if (!raw) return;
      normalizeFormFieldAndSave();
    });
    input.addEventListener('paste', function () {
      setTimeout(function () {
        normalizeFormFieldAndSave();
      }, 0);
    });

    bootstrap();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
