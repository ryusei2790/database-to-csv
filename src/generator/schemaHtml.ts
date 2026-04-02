/**
 * @file schemaHtml.ts
 * @responsibility 全テーブルとFK関係を一画面で把握できるスキーマ概観ページを生成する
 *
 * report.html との違い：
 *   - 全画面で vis-network を表示（テーブルデータパネルなし）
 *   - 各ノードに全カラム情報を表示（PK / FK / 通常カラムを色分け）
 *   - 矢印ラベルに「どのカラム同士が紐づいているか」を明記
 *   - ER図だけに集中した「一目でわかる」スキーマビューワー
 */

import type { Table, ForeignKey } from "../db/schema";

interface SchemaHtmlInput {
  tables:      Table[];
  foreignKeys: ForeignKey[];
  dbName:      string;
  generatedAt: string;
}

/**
 * FKカラムのセットを作成して「このカラムはFKか」を O(1) で判定できるようにする
 * キー形式: "テーブル名.カラム名"
 */
function buildFkColumnSet(foreignKeys: ForeignKey[]): Set<string> {
  const set = new Set<string>();
  for (const fk of foreignKeys) {
    set.add(`${fk.fromTable}.${fk.fromColumn}`);
  }
  return set;
}

/**
 * vis-network の nodes / edges JSON を生成する
 *
 * vis-network の multi:"html" は <b><i> 等しかサポートしないため、
 * プレーンテキスト＋絵文字記号でカラム種別を表現する：
 *   🔑 PK カラム
 *   🔗 FK カラム
 *   通常カラムはインデントのみ
 */
function buildNetworkData(
  tables:      Table[],
  foreignKeys: ForeignKey[]
): { nodesJson: string; edgesJson: string } {
  const fkColumnSet = buildFkColumnSet(foreignKeys);

  // ─── ノード生成 ───────────────────────────────────
  const nodes = tables.map((t) => {
    const columnLines = t.columns.map((c) => {
      const key = `${t.name}.${c.name}`;
      if (c.isPrimary) {
        return `🔑 ${c.name} : ${c.type}`;
      } else if (fkColumnSet.has(key)) {
        return `🔗 ${c.name} : ${c.type}`;
      } else {
        return `   ${c.name} : ${c.type}`;
      }
    });

    const label = [
      ` ${t.name} `,
      `──────────────────────`,
      ...columnLines,
    ].join("\n");

    return {
      id:    t.name,
      label,
      title: `テーブル: ${t.name}（${t.columns.length} カラム）`,
      color: {
        background: "#1a2744",
        border:     "#3182ce",
        highlight: { background: "#2a3f6b", border: "#63b3ed" },
        hover:     { background: "#1e3256", border: "#4299e1" },
      },
    };
  });

  // ─── エッジ生成 ───────────────────────────────────
  const edges = foreignKeys.map((fk) => ({
    from:   fk.fromTable,
    to:     fk.toTable,
    // エッジラベルに「どのカラム同士か」を表示
    label:  `${fk.fromColumn}\n→ ${fk.toColumn}`,
    title:  `${fk.fromTable}.${fk.fromColumn} → ${fk.toTable}.${fk.toColumn}`,
    arrows: {
      to: {
        enabled: true,
        scaleFactor: 1.2,
      },
    },
    color: { color: "#4a5568", highlight: "#63b3ed", hover: "#63b3ed" },
    font:  { color: "#63b3ed", size: 11, align: "middle", background: "#0f1117" },
    width: 2,
    smooth: { enabled: true, type: "cubicBezier", roundness: 0.4 },
  }));

  return {
    nodesJson: JSON.stringify(nodes),
    edgesJson: JSON.stringify(edges),
  };
}

/**
 * スキーマ概観ページの HTML 文字列を生成して返す
 */
export function generateSchemaHtml(input: SchemaHtmlInput): string {
  const { tables, foreignKeys, dbName, generatedAt } = input;
  const { nodesJson, edgesJson } = buildNetworkData(tables, foreignKeys);

  // 統計情報
  const tableCount = tables.length;
  const fkCount    = foreignKeys.length;
  const colCount   = tables.reduce((s, t) => s + t.columns.length, 0);

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Schema Overview — ${dbName}</title>

  <!-- vis-network: ER図描画 -->
  <script src="https://unpkg.com/vis-network@9.1.9/standalone/umd/vis-network.min.js"></script>

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

    /* ─── ヘッダー ─────────────────────────────── */
    header {
      background: #1a1d2e;
      border-bottom: 1px solid #2d3748;
      padding: 10px 20px;
      display: flex;
      align-items: center;
      gap: 20px;
      flex-shrink: 0;
    }

    header h1 {
      font-size: 15px;
      font-weight: 600;
      color: #63b3ed;
      white-space: nowrap;
    }

    /* ─── 統計バッジ ────────────────────────────── */
    .stats {
      display: flex;
      gap: 10px;
      flex: 1;
    }
    .stat-badge {
      background: #2d3748;
      border-radius: 20px;
      padding: 3px 12px;
      font-size: 12px;
      color: #a0aec0;
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .stat-badge strong { color: #e2e8f0; }

    /* ─── 凡例 ──────────────────────────────────── */
    .legend {
      display: flex;
      gap: 14px;
      align-items: center;
      flex-shrink: 0;
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 12px;
      color: #a0aec0;
    }
    .legend-dot {
      width: 10px;
      height: 10px;
      border-radius: 2px;
    }

    /* ─── ツールバー ────────────────────────────── */
    .toolbar {
      background: #161923;
      border-bottom: 1px solid #2d3748;
      padding: 7px 20px;
      display: flex;
      align-items: center;
      gap: 10px;
      flex-shrink: 0;
    }

    .toolbar-label {
      font-size: 11px;
      color: #4a5568;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .btn {
      background: #2d3748;
      color: #a0aec0;
      border: 1px solid #4a5568;
      padding: 4px 12px;
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .btn:hover { background: #3d4a5c; color: #e2e8f0; }

    .btn-primary {
      background: #2b6cb0;
      color: #fff;
      border-color: #3182ce;
    }
    .btn-primary:hover { background: #3182ce; }

    .spacer { flex: 1; }

    /* ─── ER図（全画面） ──────────────────────────── */
    #schema-diagram {
      flex: 1;
      min-height: 0;  /* flex子要素がコンテンツに合わせて無限に伸びるのを防ぐ */
      overflow: hidden;
      width: 100%;
    }

    /* ─── テーブルリスト サイドバー ──────────────── */
    .sidebar {
      position: fixed;
      top: 0;
      left: 0;
      height: 100vh;
      width: 200px;
      background: #1a1d2e;
      border-right: 1px solid #2d3748;
      padding-top: 90px;
      overflow-y: auto;
      transform: translateX(-200px);
      transition: transform 0.2s ease;
      z-index: 100;
    }
    .sidebar.open { transform: translateX(0); }
    .sidebar h2 {
      padding: 8px 14px;
      font-size: 11px;
      color: #4a5568;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .sidebar-item {
      padding: 7px 14px;
      font-size: 13px;
      color: #a0aec0;
      cursor: pointer;
      transition: all 0.1s;
    }
    .sidebar-item:hover { background: #2d3748; color: #e2e8f0; }
  </style>
</head>
<body>

<!-- ヘッダー -->
<header>
  <h1>🗺 Schema Overview — ${dbName}</h1>

  <div class="stats">
    <div class="stat-badge">📋 テーブル <strong>${tableCount}</strong></div>
    <div class="stat-badge">↔ リレーション <strong>${fkCount}</strong></div>
    <div class="stat-badge">📌 カラム合計 <strong>${colCount}</strong></div>
  </div>

  <div class="legend">
    <div class="legend-item">
      <span style="color:#f6c90e">🔑</span> Primary Key
    </div>
    <div class="legend-item">
      <span style="color:#63b3ed">🔗</span> Foreign Key
    </div>
    <div class="legend-item">
      <span style="color:#a0aec0">　</span> Column
    </div>
  </div>
</header>

<!-- ツールバー -->
<div class="toolbar">
  <span class="toolbar-label">レイアウト:</span>
  <button class="btn" onclick="setLayout('hierarchical')">階層型</button>
  <button class="btn" onclick="setLayout('force')">フォース</button>
  <button class="btn" onclick="network.fit()">全体表示</button>

  <div class="spacer"></div>

  <span style="font-size:11px; color:#4a5568;">Generated: ${generatedAt}</span>
  <a href="report.html" style="text-decoration:none; margin-left:8px;">
    <button class="btn btn-primary">🗂 キャンバスビュー</button>
  </a>
  <a href="viewer.html" style="text-decoration:none; margin-left:8px;">
    <button class="btn btn-primary">📋 テーブルビューアー</button>
  </a>
</div>

<!-- ER図（全画面） -->
<div id="schema-diagram"></div>

<!-- テーブル一覧サイドバー（ノードクリックで飛ぶ） -->
<div class="sidebar" id="sidebar">
  <h2>テーブル一覧</h2>
  ${tables
    .map(
      (t) =>
        `<div class="sidebar-item" onclick="focusTable('${t.name}')">${t.name}</div>`
    )
    .join("\n  ")}
</div>

<script>
  // ─────────────────────────────────────────────────
  // vis-network 初期化
  // ─────────────────────────────────────────────────
  const nodes = new vis.DataSet(${nodesJson});
  const edges = new vis.DataSet(${edgesJson});

  const container = document.getElementById("schema-diagram");

  // 階層レイアウトのオプション
  const hierarchicalOptions = {
    nodes: {
      shape: "box",
      font: {
        face:  "monospace",
        size:  12,
        color: "#e2e8f0",
      },
      margin:          { top: 10, right: 14, bottom: 10, left: 14 },
      widthConstraint: { minimum: 200, maximum: 320 },
      shadow:          { enabled: true, color: "rgba(0,0,0,0.5)", size: 10 },
    },
    edges: {
      smooth: { enabled: true, type: "cubicBezier", roundness: 0.4 },
    },
    layout: {
      hierarchical: {
        enabled:         true,
        direction:       "LR",
        sortMethod:      "directed",
        levelSeparation: 320,
        nodeSpacing:     160,  // ノード間隔を広げて重なりを防ぐ
        treeSpacing:     200,
      },
    },
    interaction: {
      hover:        true,
      tooltipDelay: 100,
      navigationButtons: true,
      keyboard:     true,
    },
    physics: { enabled: false },
  };

  // フォースレイアウトのオプション（physics ON）
  const forceOptions = {
    ...hierarchicalOptions,
    layout: { hierarchical: { enabled: false } },
    physics: {
      enabled:     true,
      solver:      "forceAtlas2Based",
      forceAtlas2Based: {
        gravitationalConstant: -80,
        centralGravity:        0.01,
        springLength:          250,
        springConstant:        0.05,
      },
      stabilization: { iterations: 150 },
    },
  };

  const network = new vis.Network(container, { nodes, edges }, hierarchicalOptions);

  // 初回描画後に全体表示する
  // ※ physics:false の階層レイアウトでは stabilizationIterationsDone が発火しないため
  //    afterDrawing で一度だけ fit() を呼ぶ
  // afterDrawing の次フレームで fit() を呼んでコンテナサイズ確定後に全体表示する
  network.once("afterDrawing", function () {
    requestAnimationFrame(function () { network.fit({ animation: false }); });
  });

  // ─────────────────────────────────────────────────
  // レイアウト切り替え
  // ─────────────────────────────────────────────────
  function setLayout(type) {
    if (type === "hierarchical") {
      network.setOptions(hierarchicalOptions);
      network.fit({ animation: true });
    } else {
      network.setOptions(forceOptions);
    }
  }

  // ─────────────────────────────────────────────────
  // テーブルにフォーカス（サイドバー用）
  // ─────────────────────────────────────────────────
  function focusTable(tableName) {
    network.focus(tableName, {
      scale:     1.5,
      animation: { duration: 600, easingFunction: "easeInOutQuad" },
    });
    network.selectNodes([tableName]);
  }
</script>

</body>
</html>`;
}
