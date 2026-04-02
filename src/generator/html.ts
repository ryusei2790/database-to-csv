/**
 * @file html.ts
 * @responsibility 全テーブルデータをキャンバス上に同時表示し、
 * FK関係を矢印で結んだインタラクティブなビューを生成する。
 * テーブルはトポロジカル順（親テーブルが上、子テーブルが下）に配置され、
 * パン/ズーム操作に対応する。
 */

import type { TableData } from "./tableData";
import type { ForeignKey } from "../db/schema";

export interface HtmlGeneratorInput {
  tableData:   TableData[];
  foreignKeys: ForeignKey[];
  dbName:      string;
  generatedAt: string;
}

/**
 * HTML 全体を文字列として生成して返す。
 * テーブルカードとFK矢印はすべてクライアントサイドのJSで描画される。
 */
export function generateHtml(input: HtmlGeneratorInput): string {
  const { tableData, foreignKeys, dbName, generatedAt } = input;

  // XSS 対策として </script> タグをエスケープする
  const tableDataJson = JSON.stringify(tableData)
    .replace(/<\/script>/gi, "<\\/script>");
  const foreignKeysJson = JSON.stringify(foreignKeys)
    .replace(/<\/script>/gi, "<\\/script>");

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>DB Viewer — ${dbName}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #0f1117;
      color: #e2e8f0;
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    /* ─── ヘッダー ─────────────────────────────────── */
    header {
      background: #1a1d2e;
      border-bottom: 1px solid #2d3748;
      padding: 10px 20px;
      display: flex;
      align-items: center;
      gap: 16px;
      flex-shrink: 0;
      z-index: 100;
    }
    header h1  { font-size: 15px; font-weight: 600; color: #63b3ed; }
    .meta      { font-size: 12px; color: #718096; }
    .hint      { font-size: 11px; color: #4a5568; }
    .header-nav {
      margin-left: auto;
      display: flex;
      gap: 8px;
    }
    .btn-nav {
      background: #2b6cb0;
      color: #fff;
      border: none;
      padding: 5px 14px;
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
      text-decoration: none;
      display: inline-block;
    }
    .btn-nav:hover { background: #3182ce; }

    /* ─── キャンバスラッパー（ビューポート） ─────────── */
    #canvas-wrapper {
      flex: 1;
      overflow: hidden;
      position: relative;
      cursor: grab;
      user-select: none;
    }
    #canvas-wrapper.dragging { cursor: grabbing; }

    /* ─── キャンバス（パン/ズーム対象） ─────────────── */
    #canvas {
      position: absolute;
      top: 0;
      left: 0;
      transform-origin: 0 0;
    }

    /* ─── FK矢印 SVG オーバーレイ ──────────────────── */
    #arrows-svg {
      position: absolute;
      top: 0;
      left: 0;
      pointer-events: none;
      overflow: visible;
    }
    .fk-arrow {
      stroke: #4299e1;
      stroke-width: 1.5;
      fill: none;
      opacity: 0.65;
    }

    /* ─── テーブルカード ────────────────────────────── */
    .table-card {
      position: absolute;
      background: #1a1d2e;
      border: 1px solid #2d3748;
      border-radius: 6px;
      overflow: hidden;
      box-shadow: 0 4px 16px rgba(0,0,0,0.5);
      z-index: 1;
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    .table-card:hover {
      border-color: #4299e1;
      box-shadow: 0 4px 24px rgba(66,153,225,0.3);
      z-index: 2;
    }

    /* カードヘッダー（テーブル名） */
    .card-header {
      background: #1e3a5f;
      color: #63b3ed;
      font-size: 13px;
      font-weight: 700;
      padding: 0 12px;
      height: 36px;
      line-height: 36px;
      letter-spacing: 0.02em;
      border-bottom: 1px solid #2d3748;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* データテーブル */
    .card-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 12px;
    }
    .card-table thead tr { background: #161923; }
    .card-table th {
      height: 30px;
      padding: 0 6px;
      text-align: left;
      color: #a0aec0;
      font-weight: 600;
      font-size: 11px;
      border-bottom: 1px solid #2d3748;
      border-right: 1px solid #1e2433;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      cursor: default;
    }
    .card-table th:last-child { border-right: none; }

    /* PKカラムハイライト（黄色系） */
    .card-table th.pk-col {
      background: rgba(236,201,75,0.12);
      color: #ecc94b;
    }
    /* FKカラムハイライト（青系） */
    .card-table th.fk-col {
      background: rgba(66,153,225,0.12);
      color: #63b3ed;
    }

    .card-table td {
      height: 26px;
      padding: 0 6px;
      border-bottom: 1px solid #1a1f2e;
      border-right: 1px solid #161923;
      color: #e2e8f0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .card-table td:last-child { border-right: none; }
    .card-table tbody tr:hover td         { background: #1e2640 !important; }
    .card-table tbody tr:nth-child(even) td { background: #141720; }

    .null-val { color: #4a5568; font-style: italic; }

    /* 省略行フッター */
    .more-rows {
      font-size: 11px;
      color: #4a5568;
      text-align: center;
      padding: 4px 0;
      background: #0f1117;
      border-top: 1px dashed #2d3748;
    }
  </style>
</head>
<body>

<header>
  <h1>🗄 DB Viewer — ${dbName}</h1>
  <span class="meta">Generated: ${generatedAt}</span>
  <span class="hint">🖱 ドラッグでパン &nbsp;/&nbsp; ホイールでズーム</span>
  <nav class="header-nav">
    <a href="viewer.html" class="btn-nav">📋 テーブルビューアー</a>
    <a href="schema.html" class="btn-nav">🗺 スキーマ概観</a>
  </nav>
</header>

<div id="canvas-wrapper">
  <div id="canvas">
    <svg id="arrows-svg">
      <defs>
        <!-- FK矢印の矢頭マーカー -->
        <marker id="arrowhead"
                markerWidth="8" markerHeight="6"
                refX="8" refY="3" orient="auto">
          <polygon points="0 0, 8 3, 0 6" fill="#4299e1" opacity="0.85" />
        </marker>
      </defs>
    </svg>
  </div>
</div>

<script>
  // ─── 埋め込みデータ ──────────────────────────────────
  var TABLE_DATA   = ${tableDataJson};
  var FOREIGN_KEYS = ${foreignKeysJson};

  // ─── レイアウト定数 ──────────────────────────────────
  var CARD_W        = 280;  // カード幅（固定）
  var CARD_HEADER_H = 36;   // テーブル名ヘッダーの高さ
  var COL_HEADER_H  = 30;   // カラム名行の高さ
  var DATA_ROW_H    = 26;   // データ行1行の高さ
  var MAX_ROWS      = 10;   // カードに表示する最大行数
  var H_GAP         = 80;   // 同じレベルのカード間の水平余白
  var V_GAP         = 100;  // レベル間の垂直余白
  var PAD           = 60;   // キャンバス外周の余白

  // ─── テーブル名→データのマップ ──────────────────────
  var tableMap = {};
  TABLE_DATA.forEach(function(t) { tableMap[t.name] = t; });

  // ─── トポロジカル深さ計算 ────────────────────────────
  // FKを持つテーブル（子）は参照先テーブル（親）より深いレベルに配置される。
  // レベル0 = 外部キーを持たないテーブル（最上位の親）
  // レベルN = レベルN-1のテーブルを参照するテーブル
  function computeLevels() {
    var deps = {};
    TABLE_DATA.forEach(function(t) { deps[t.name] = []; });
    FOREIGN_KEYS.forEach(function(fk) {
      if (deps[fk.fromTable]) deps[fk.fromTable].push(fk.toTable);
    });

    var levels = {};
    var visiting = {};

    function getLevel(name) {
      if (name in levels) return levels[name];
      if (visiting[name]) { levels[name] = 0; return 0; } // 循環FK対策
      visiting[name] = true;
      var maxDep = -1;
      (deps[name] || []).forEach(function(dep) {
        var d = getLevel(dep);
        if (d > maxDep) maxDep = d;
      });
      levels[name] = maxDep + 1;
      delete visiting[name];
      return levels[name];
    }

    TABLE_DATA.forEach(function(t) { getLevel(t.name); });
    return levels;
  }

  // ─── カード位置の計算 ────────────────────────────────
  // レベルごとにテーブルをグループ化し、各レベルを水平中央揃えで配置する。
  var positions = {};
  var canvasTotalW = 0;
  var canvasTotalH = 0;

  function computePositions() {
    var levels = computeLevels();

    var groups = {};
    TABLE_DATA.forEach(function(t) {
      var l = levels[t.name] || 0;
      if (!groups[l]) groups[l] = [];
      groups[l].push(t);
    });

    var levelNums = Object.keys(groups).map(Number).sort(function(a,b){ return a-b; });

    // 最も多いテーブル数のレベルが全体の幅を決める（中央揃えのため）
    var maxCount = 0;
    levelNums.forEach(function(l) {
      if (groups[l].length > maxCount) maxCount = groups[l].length;
    });
    var totalInnerW = maxCount * CARD_W + (maxCount - 1) * H_GAP;

    var yOffset = PAD;

    levelNums.forEach(function(lvl) {
      var tablesInLevel = groups[lvl];
      var count = tablesInLevel.length;
      var levelInnerW = count * CARD_W + (count - 1) * H_GAP;
      // 最大幅に対して中央に揃える
      var xStart = PAD + (totalInnerW - levelInnerW) / 2;
      var maxH = 0;

      tablesInLevel.forEach(function(t, i) {
        var rowCount = Math.min(t.rows.length, MAX_ROWS);
        var cardH = CARD_HEADER_H + COL_HEADER_H + rowCount * DATA_ROW_H;
        if (t.rows.length > MAX_ROWS) cardH += 24; // 省略行フッター
        positions[t.name] = {
          x: xStart + i * (CARD_W + H_GAP),
          y: yOffset,
          h: cardH
        };
        if (cardH > maxH) maxH = cardH;
      });

      yOffset += maxH + V_GAP;
    });

    canvasTotalW = PAD + totalInnerW + PAD;
    canvasTotalH = yOffset;
  }

  computePositions();

  // ─── テーブルカードの描画 ────────────────────────────
  var canvas = document.getElementById('canvas');

  // PKカラムとFKカラムを判定するセット（ハイライト用）
  // "tableName.colName" → "pk" | "fk"
  var colRoles = {};
  FOREIGN_KEYS.forEach(function(fk) {
    colRoles[fk.fromTable + '.' + fk.fromColumn] = 'fk';
    // 参照先カラムがすでにFKとして登録されていない場合のみPKとしてマークする
    var toKey = fk.toTable + '.' + fk.toColumn;
    if (!colRoles[toKey]) colRoles[toKey] = 'pk';
  });

  TABLE_DATA.forEach(function(t) {
    var pos = positions[t.name];

    var card = document.createElement('div');
    card.className = 'table-card';
    card.id = 'card-' + t.name;
    card.style.left  = pos.x + 'px';
    card.style.top   = pos.y + 'px';
    card.style.width = CARD_W + 'px';

    // テーブル名ヘッダー
    var hdr = document.createElement('div');
    hdr.className = 'card-header';
    hdr.textContent = t.name;
    hdr.title = t.name;
    card.appendChild(hdr);

    // データテーブル（カラムヘッダー + データ行）
    var tbl = document.createElement('table');
    tbl.className = 'card-table';

    // カラムヘッダー行
    var thead = document.createElement('thead');
    var headerTr = document.createElement('tr');
    t.columns.forEach(function(col) {
      var th = document.createElement('th');
      th.className = 'col-header';
      th.setAttribute('data-col', col);
      th.setAttribute('data-table', t.name);
      th.textContent = col;
      th.title = col;
      var role = colRoles[t.name + '.' + col];
      if (role === 'fk') th.classList.add('fk-col');
      if (role === 'pk') th.classList.add('pk-col');
      headerTr.appendChild(th);
    });
    thead.appendChild(headerTr);
    tbl.appendChild(thead);

    // データ行（最大MAX_ROWS件）
    var tbody = document.createElement('tbody');
    var rowCount = Math.min(t.rows.length, MAX_ROWS);
    for (var ri = 0; ri < rowCount; ri++) {
      var tr = document.createElement('tr');
      t.columns.forEach(function(col) {
        var td = document.createElement('td');
        var val = t.rows[ri][col];
        if (val === null || val === undefined) {
          td.innerHTML = '<span class="null-val">NULL</span>';
        } else {
          td.textContent = String(val);
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    }
    tbl.appendChild(tbody);
    card.appendChild(tbl);

    // 省略行フッター
    if (t.rows.length > MAX_ROWS) {
      var more = document.createElement('div');
      more.className = 'more-rows';
      more.textContent = '+ ' + (t.rows.length - MAX_ROWS) + ' more rows';
      card.appendChild(more);
    }

    canvas.appendChild(card);
  });

  // ─── FK矢印の描画 ────────────────────────────────────
  // 矢印は子テーブルのFKカラムヘッダーから親テーブルのPKカラムヘッダーへ向かう。
  // ベジェ曲線で滑らかに接続し、矢頭は参照先（親）に向ける。
  var svg = document.getElementById('arrows-svg');
  svg.setAttribute('width',  canvasTotalW);
  svg.setAttribute('height', canvasTotalH);

  FOREIGN_KEYS.forEach(function(fk) {
    var fromPos = positions[fk.fromTable];
    var toPos   = positions[fk.toTable];
    var fromTd  = tableMap[fk.fromTable];
    var toTd    = tableMap[fk.toTable];
    if (!fromPos || !toPos || !fromTd || !toTd) return;

    var fromColIdx = fromTd.columns.indexOf(fk.fromColumn);
    var toColIdx   = toTd.columns.indexOf(fk.toColumn);
    if (fromColIdx === -1 || toColIdx === -1) return;

    // カード幅をカラム数で等分してカラム中心のX座標を求める
    var fromColW = CARD_W / fromTd.columns.length;
    var toColW   = CARD_W / toTd.columns.length;
    var fromX = fromPos.x + (fromColIdx + 0.5) * fromColW;
    var toX   = toPos.x   + (toColIdx   + 0.5) * toColW;

    // カラムヘッダー行の中央Y座標
    var fromY = fromPos.y + CARD_HEADER_H + COL_HEADER_H / 2;
    var toY   = toPos.y   + CARD_HEADER_H + COL_HEADER_H / 2;

    // ベジェ曲線の制御点：垂直方向にオフセットしてS字カーブを作る
    var dy = Math.abs(fromY - toY);
    var cpOffset = Math.max(50, dy * 0.4);
    var cp1y, cp2y;
    if (fromY > toY) {
      // 子が下・親が上：矢印が上方向に向かう
      cp1y = fromY - cpOffset;
      cp2y = toY   + cpOffset;
    } else {
      // 子が上・親が下（非典型的な構成）
      cp1y = fromY + cpOffset;
      cp2y = toY   - cpOffset;
    }

    var pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pathEl.setAttribute('d',
      'M ' + fromX + ' ' + fromY +
      ' C ' + fromX + ' ' + cp1y +
      ' '   + toX   + ' ' + cp2y +
      ' '   + toX   + ' ' + toY
    );
    pathEl.setAttribute('class', 'fk-arrow');
    pathEl.setAttribute('marker-end', 'url(#arrowhead)');

    // SVGタイトル要素でホバー時にFK情報をツールチップ表示する
    var titleEl = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    titleEl.textContent =
      fk.fromTable + '.' + fk.fromColumn + ' → ' +
      fk.toTable   + '.' + fk.toColumn;
    pathEl.appendChild(titleEl);

    svg.appendChild(pathEl);
  });

  // ─── パン/ズーム ──────────────────────────────────────
  var scale = 1, panX = 0, panY = 0;
  var isDragging = false, lastMouseX = 0, lastMouseY = 0;
  var wrapper = document.getElementById('canvas-wrapper');

  function applyTransform() {
    canvas.style.transform =
      'translate(' + panX + 'px, ' + panY + 'px) scale(' + scale + ')';
  }

  // ホイールズーム（マウス位置を中心に拡大縮小）
  wrapper.addEventListener('wheel', function(e) {
    e.preventDefault();
    var factor = e.deltaY < 0 ? 1.1 : 0.9;
    var newScale = Math.max(0.1, Math.min(3, scale * factor));
    var rect = wrapper.getBoundingClientRect();
    var mx = e.clientX - rect.left;
    var my = e.clientY - rect.top;
    panX = mx - (mx - panX) * (newScale / scale);
    panY = my - (my - panY) * (newScale / scale);
    scale = newScale;
    applyTransform();
  }, { passive: false });

  // マウスドラッグでパン（テーブルカード上は除外）
  wrapper.addEventListener('mousedown', function(e) {
    if (e.target.closest && e.target.closest('.table-card')) return;
    isDragging = true;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    wrapper.classList.add('dragging');
  });

  window.addEventListener('mousemove', function(e) {
    if (!isDragging) return;
    panX += e.clientX - lastMouseX;
    panY += e.clientY - lastMouseY;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    applyTransform();
  });

  window.addEventListener('mouseup', function() {
    isDragging = false;
    wrapper.classList.remove('dragging');
  });

  // 初期表示：全テーブルが画面内に収まるようにスケールとパンを調整する
  (function fitToView() {
    var wRect = wrapper.getBoundingClientRect();
    var fitScale = Math.min(
      (wRect.width  - 40) / canvasTotalW,
      (wRect.height - 40) / canvasTotalH,
      1.0  // 100%より大きくはしない
    );
    scale = fitScale;
    panX  = (wRect.width  - canvasTotalW * fitScale) / 2;
    panY  = (wRect.height - canvasTotalH * fitScale) / 2;
    applyTransform();
  })();
</script>

</body>
</html>`;
}
