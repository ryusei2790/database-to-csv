/**
 * @file tableViewerHtml.ts
 * @responsibility ER図とTabulatorを組み合わせたテーブルビューアーHTMLを生成する。
 * 左パネルにvis-networkのER図、右パネルにTabulatorのデータビューアーを配置し、
 * ノードクリックでテーブルを切り替えてCSVエクスポートができる。
 */

import type { TableData } from "./tableData";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface TableViewerHtmlInput {
  nodesJson:   string;
  edgesJson:   string;
  tableData:   TableData[];
  dbName:      string;
  generatedAt: string;
}

/**
 * HTML 全体を文字列として生成して返す
 */
export function generateTableViewerHtml(input: TableViewerHtmlInput): string {
  const { nodesJson, edgesJson, tableData, dbName, generatedAt } = input;

  // XSS 対策として </script> タグをエスケープする
  const tableDataJson = JSON.stringify(tableData)
    .replace(/<\/script>/gi, "<\\/script>");
  const safeDbName = escapeHtml(dbName);
  const safeGeneratedAt = escapeHtml(generatedAt);

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Table Viewer — ${safeDbName}</title>
  <script src="./assets/vis-network.min.js"></script>
  <link href="./assets/tabulator.min.css" rel="stylesheet" />
  <script src="./assets/tabulator.min.js"></script>

  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #0f1117;
      color: #e2e8f0;
      height: 100vh;
      display: flex;
      flex-direction: column;
    }

    /* ─── ヘッダー ──────────────────────────── */
    header {
      background: #1a1d2e;
      border-bottom: 1px solid #2d3748;
      padding: 12px 20px;
      display: flex;
      align-items: center;
      gap: 16px;
      flex-shrink: 0;
    }
    header h1 { font-size: 16px; font-weight: 600; color: #63b3ed; }
    header .meta { font-size: 12px; color: #718096; }
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

    /* ─── メインレイアウト（左: ER図 / 右: データ） ── */
    .main {
      display: flex;
      flex: 1;
      overflow: hidden;
    }

    /* ─── ER図パネル ─────────────────────────── */
    .er-panel {
      width: 45%;
      min-width: 300px;
      border-right: 1px solid #2d3748;
      display: flex;
      flex-direction: column;
    }
    .panel-title {
      padding: 8px 16px;
      font-size: 12px;
      font-weight: 600;
      color: #a0aec0;
      background: #161923;
      border-bottom: 1px solid #2d3748;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    #er-diagram {
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }

    /* ─── データパネル ─────────────────────────── */
    .data-panel {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .data-header {
      padding: 8px 16px;
      background: #161923;
      border-bottom: 1px solid #2d3748;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }
    #table-name {
      font-size: 14px;
      font-weight: 600;
      color: #68d391;
    }
    .btn-csv {
      background: #2b6cb0;
      color: white;
      border: none;
      padding: 5px 14px;
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
      transition: background 0.15s;
    }
    .btn-csv:hover { background: #3182ce; }
    .btn-csv:disabled { background: #4a5568; cursor: default; }

    #table-container {
      flex: 1;
      overflow: auto;
      padding: 0;
    }

    /* Tabulator のダークテーマ上書き */
    .tabulator {
      background: #0f1117 !important;
      border: none !important;
      font-size: 13px;
    }
    .tabulator .tabulator-header {
      background: #1a1d2e !important;
      border-bottom: 1px solid #2d3748 !important;
    }
    .tabulator .tabulator-col {
      background: #1a1d2e !important;
      color: #a0aec0 !important;
      border-right: 1px solid #2d3748 !important;
    }
    .tabulator .tabulator-row {
      background: #0f1117 !important;
      color: #e2e8f0 !important;
      border-bottom: 1px solid #1a1d2e !important;
    }
    .tabulator .tabulator-row:hover {
      background: #1a1d2e !important;
    }
    .tabulator .tabulator-row.tabulator-row-even {
      background: #141720 !important;
    }
    .tabulator .tabulator-cell {
      border-right: 1px solid #1e2433 !important;
    }

    /* プレースホルダー */
    .placeholder {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: #4a5568;
      font-size: 14px;
    }
  </style>
</head>
<body>

<header>
  <h1>📋 Table Viewer — ${safeDbName}</h1>
  <span class="meta">Generated: ${safeGeneratedAt}</span>
  <nav class="header-nav">
    <a href="report.html" class="btn-nav">🗂 キャンバスビュー</a>
    <a href="schema.html" class="btn-nav">🗺 スキーマ概観</a>
  </nav>
</header>

<div class="main">

  <!-- ER図パネル -->
  <div class="er-panel">
    <div class="panel-title">ER Diagram（クリックでテーブルデータを表示）</div>
    <div id="er-diagram"></div>
  </div>

  <!-- データパネル -->
  <div class="data-panel">
    <div class="data-header">
      <span id="table-name">← テーブルをクリックしてください</span>
      <button class="btn-csv" id="btn-csv" disabled onclick="downloadCsv()">
        CSV ダウンロード
      </button>
    </div>
    <div id="table-container">
      <div class="placeholder">ER図からテーブルを選択してください</div>
    </div>
  </div>

</div>

<script>
  // ─────────────────────────────────────────────────
  // テーブルデータ（ビルド時に埋め込まれる）
  // ─────────────────────────────────────────────────
  const TABLE_DATA = ${tableDataJson};

  // テーブル名 → データのマップを作成して O(1) で検索できるようにする
  const tableMap = {};
  TABLE_DATA.forEach(function(t) { tableMap[t.id] = t; });

  // ─────────────────────────────────────────────────
  // vis-network ER図の初期化
  // ─────────────────────────────────────────────────
  const nodes = new vis.DataSet(${nodesJson});
  const edges = new vis.DataSet(${edgesJson});

  const container = document.getElementById("er-diagram");
  const network = new vis.Network(container, { nodes, edges }, {
    nodes: {
      shape: "box",
      font: {
        face:  "monospace",
        size:  12,
        color: "#e2e8f0",
        multi: true,
      },
      color: {
        background: "#1a2744",
        border:     "#3182ce",
        highlight: {
          background: "#2a3f6b",
          border:     "#63b3ed",
        },
        hover: {
          background: "#1e3256",
          border:     "#4299e1",
        },
      },
      margin: { top: 8, right: 12, bottom: 8, left: 12 },
      widthConstraint: { minimum: 160 },
    },
    edges: {
      color:  { color: "#4a5568", highlight: "#63b3ed" },
      smooth: { type: "cubicBezier", forceDirection: "vertical" },
      font:   { color: "#718096", size: 10, align: "middle" },
    },
    layout: {
      // 階層レイアウト：参照される側（親テーブル）が上に来る
      hierarchical: {
        enabled:        true,
        direction:      "UD",
        sortMethod:     "directed",
        levelSeparation: 150,
        nodeSpacing:    200,
      },
    },
    interaction: {
      hover: true,
      tooltipDelay: 200,
    },
    physics: { enabled: false },
  });

  // afterDrawing の次フレームで fit() を呼んでコンテナサイズ確定後に全体表示する
  network.once("afterDrawing", function () {
    requestAnimationFrame(function () { network.fit({ animation: false }); });
  });

  // ─────────────────────────────────────────────────
  // ノードクリック → テーブルデータを右パネルに表示
  // ─────────────────────────────────────────────────
  let currentTable     = null;
  let tabulatorInstance = null;

  network.on("click", function(params) {
    if (params.nodes.length === 0) return;
    const tableId = params.nodes[0];
    showTable(tableId);
  });

  function showTable(tableId) {
    const data = tableMap[tableId];
    if (!data) return;

    currentTable = tableId;
    document.getElementById("table-name").textContent = data.displayName;
    document.getElementById("btn-csv").disabled = false;

    // Tabulator のカラム定義を生成する
    const columns = data.columns.map(function(col) {
      return {
        title:   col,
        field:   col,
        headerFilter: true,
        resizable: true,
        formatter: function(cell) {
          const val = cell.getValue();
          if (val === null || val === undefined) {
            return '<span style="color:#4a5568">NULL</span>';
          }
          return String(val);
        },
      };
    });

    const container = document.getElementById("table-container");
    container.innerHTML = '<div id="tabulator-target"></div>';

    // 既存インスタンスを破棄して再生成する
    if (tabulatorInstance) {
      tabulatorInstance.destroy();
    }
    tabulatorInstance = new Tabulator("#tabulator-target", {
      data:           data.rows,
      columns:        columns,
      layout:         "fitDataFill",
      height:         "100%",
      pagination:     "local",
      paginationSize: 50,
      movableColumns: true,
    });
  }

  // ─────────────────────────────────────────────────
  // CSV ダウンロード
  // ─────────────────────────────────────────────────
  function downloadCsv() {
    if (!tabulatorInstance || !currentTable) return;
    const data = tableMap[currentTable];
    tabulatorInstance.download("csv", data.displayName + ".csv");
  }

  // 最初のテーブルを自動選択して即座にデータを表示する
  if (TABLE_DATA.length > 0) {
    const firstName = TABLE_DATA[0].id;
    showTable(firstName);
    // vis-network のノードも選択状態にする
    network.selectNodes([firstName]);
  }
</script>

</body>
</html>`;
}
