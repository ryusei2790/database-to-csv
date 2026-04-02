---
title: "【保存版】SQLなしでDBを可視化！TypeScript製ER図ツールの全解説"
emoji: "🗄"
type: "tech"
topics: ["sql", "ローカル開発"]
published: true
---

## この記事でわかること

- `information_schema` を使ってPostgreSQLのスキーマを自動取得する方法
- vis-networkでインタラクティブなER図を描画する実装パターン
- SVGベジェ曲線でFK（外部キー）の依存関係を矢印表示する仕組み
- Docker Composeで「起動1コマンドで完結」する開発環境の構成
- TypeScript + Node.jsでHTMLレポートを自動生成するCLIツールの設計

---

## 作ったもの：db-canvas-viewer

GitHubリポジトリ：https://github.com/ryusei2790/database-to-csv

PostgreSQLに接続して、テーブル構造・外部キー・実データを自動取得し、3種類のインタラクティブなHTMLレポートを出力するCLIツールです。

**なぜ作ったか：**

- SQLでデータ構造を確認するのが苦手で、視覚的にDBの全体像を見たかった
- 初学者がテーブル間の依存関係やデータを一目で理解できるツールが欲しかった
- `information_schema` を使えばどんなPostgreSQLにも接続できると気づき、汎用ツールとして設計した

---

## 技術スタック

| カテゴリ | 技術 |
|:--|:--|
| 言語 | TypeScript 5.4 |
| ランタイム | Node.js 20 (Alpine) |
| DB接続 | PostgreSQL 16 / pg 8.11 |
| 環境変数 | dotenv |
| フロントエンド（生成HTML） | vis-network 9.1 / Tabulator 6.2 |
| インフラ | Docker / Docker Compose |

---

## 3種類のHTMLレポート

### 🗂 キャンバスビュー（report.html）

全テーブルのデータをキャンバス上に同時表示し、FK関係をSVGベジェ曲線の矢印で接続します。ドラッグ＆ホイールでパン/ズーム操作が可能です。

```
テーブルカード（全テーブル）
    ↕ SVGベジェ曲線（FK矢印）
テーブルカード（参照先）
```

### 📋 テーブルビューアー（viewer.html）

vis-networkのER図（左パネル）＋Tabulatorのデータテーブル（右パネル）を組み合わせたビューです。ノードをクリックするとテーブルデータが右パネルに表示され、CSVエクスポートが可能です。

### 🗺 スキーマ概観（schema.html）

全カラムを🔑PK / 🔗FK / 通常で色分けしたER図を全画面表示します。階層型・フォース型レイアウトの切り替えが可能です。

---

## アーキテクチャ

```
docker compose up
    ↓
PostgreSQL コンテナ起動（initial.sql でサンプルデータ投入）
    ↓
app コンテナ起動（Node.js / TypeScript）
    ↓
information_schema からスキーマ自動取得
    ↓
SELECT * LIMIT 1000 でデータ取得
    ↓
HTML 生成（3種類）
    ↓
output/ ディレクトリに出力
```

---

## 実装の核心：information_schema でスキーマ自動取得

このツールの汎用性の鍵は `information_schema` の活用です。特定DBに依存したSQL不要で、接続先のPostgreSQLからテーブル・カラム・FK情報を自動検出します。

```typescript
// テーブル一覧の取得
export async function fetchTables(): Promise<Table[]> {
  const result = await pool.query(`
    SELECT
      t.table_name,
      c.column_name,
      c.data_type,
      CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END AS is_primary
    FROM information_schema.tables t
    JOIN information_schema.columns c
      ON t.table_name = c.table_name
      AND t.table_schema = c.table_schema
    LEFT JOIN (
      SELECT ku.table_name, ku.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage ku
        ON tc.constraint_name = ku.constraint_name
      WHERE tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_schema = 'public'
    ) pk ON pk.table_name = c.table_name AND pk.column_name = c.column_name
    WHERE t.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
    ORDER BY t.table_name, c.ordinal_position
  `);
  // ...
}
```

```typescript
// 外部キー一覧の取得
export async function fetchForeignKeys(): Promise<ForeignKey[]> {
  const result = await pool.query(`
    SELECT
      kcu.table_name  AS from_table,
      kcu.column_name AS from_column,
      ccu.table_name  AS to_table,
      ccu.column_name AS to_column
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
  `);
  // ...
}
```

`information_schema` は **PostgreSQL標準の仮想テーブル群** で、DBのメタデータをSQLで取得できます。これにより、どのPostgreSQLDBにも接続するだけで構造を自動把握できます。

---

## キャンバスビューのFK矢印：SVGベジェ曲線

全テーブルを同時表示しFKの依存関係を矢印で繋ぐキャンバスビューには、以下の仕組みを使っています。

**トポロジカルソートでテーブルを階層配置**

FK参照関係を有向グラフとみなし、参照される側（親テーブル）が上層、参照する側（子テーブル）が下層になるよう配置します。

```javascript
function computeLevels() {
  const deps = {};
  TABLE_DATA.forEach(t => deps[t.name] = []);
  FOREIGN_KEYS.forEach(fk => {
    if (deps[fk.fromTable]) deps[fk.fromTable].push(fk.toTable);
  });

  const levels = {};
  const visiting = {};

  function getLevel(name) {
    if (name in levels) return levels[name];
    if (visiting[name]) { levels[name] = 0; return 0; } // 循環FK対策
    visiting[name] = true;
    const maxDep = (deps[name] || []).reduce(
      (m, dep) => Math.max(m, getLevel(dep)), -1
    );
    levels[name] = maxDep + 1;
    delete visiting[name];
    return levels[name];
  }

  TABLE_DATA.forEach(t => getLevel(t.name));
  return levels;
}
```

**SVGベジェ曲線で矢印を描画**

S字カーブのベジェ曲線で、FK元カラム → FK先カラムを繋ぎます。

```javascript
const cpOffset = Math.max(50, Math.abs(fromY - toY) * 0.4);
const path = `M ${fromX} ${fromY} `
           + `C ${fromX} ${fromY - cpOffset} `
           + `  ${toX} ${toY + cpOffset} `
           + `  ${toX} ${toY}`;
```

`cpOffset` をFK元/先の距離に応じて動的に調整することで、近いテーブルでも遠いテーブルでも自然なカーブになります。

---

## vis-networkのつまずきポイントと解決策

### 問題1：コンテナ高さが44312pxになる

vis-networkのコンテナに `flex: 1` を設定するだけでは、flex子要素がコンテンツに合わせて無限に伸びてしまいます。

```css
/* ❌ これだけだとNG */
#er-diagram {
  flex: 1;
}

/* ✅ min-height: 0 を追加 */
#er-diagram {
  flex: 1;
  min-height: 0;   /* flexboxの高さ上限を親に委ねる */
  overflow: hidden;
}
```

### 問題2：初期表示で全体フィットしない

`network.fit()` を呼ぶタイミングが早すぎると、コンテナのサイズが確定する前に実行されてしまいます。

```javascript
// ❌ loadイベントは既に発火済みの場合がある
window.addEventListener('load', () => network.fit());

// ✅ afterDrawing + requestAnimationFrame で確実に
network.once("afterDrawing", function () {
  requestAnimationFrame(function () {
    network.fit({ animation: false });
  });
});
```

### 問題3：ノードラベルにHTMLタグが表示される

vis-networkの `multi: "html"` は `<b>`, `<i>` のみサポートで、`<font color="">` 等は**文字列として表示**されます。

```javascript
// ❌ <font>タグはそのまま表示される
return `<font color="#f6c90e">🔑</font> ${c.name} : ${c.type}`;

// ✅ 絵文字をプレーンテキストとして使う
if (c.isPrimary) {
  return `🔑 ${c.name} : ${c.type}`;
} else if (fkColumnSet.has(key)) {
  return `🔗 ${c.name} : ${c.type}`;
}
```

---

## Docker Composeの構成

`docker-compose.yml` のポイントは `depends_on` の `condition: service_healthy` です。PostgreSQLが完全に起動してからappコンテナが動き出します。

```yaml
services:
  postgres:
    image: postgres:16-alpine
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB"]
      interval: 5s
      retries: 5

  app:
    build: .
    depends_on:
      postgres:
        condition: service_healthy  # DBが健全になってから起動
    environment:
      DB_HOST: postgres
      DB_PORT: 5432
      LIMIT: 1000
    volumes:
      - ./output:/app/output  # 生成HTMLをホストにマウント
```

---

## セットアップ

```bash
git clone https://github.com/ryusei2790/database-to-csv.git
cd database-to-csv
docker compose up
```

生成されたHTMLが `output/` に出力されます。ブラウザで `output/report.html` を開くだけで確認できます。

**自分のDBに接続する場合**は `docker-compose.yml` の環境変数を書き換えるだけです：

```yaml
environment:
  DB_HOST: your-db-host
  DB_PORT: 5432
  DB_USER: your-user
  DB_PASSWORD: your-password
  DB_NAME: your-db-name
  LIMIT: 1000
```

---

## まとめ

- `information_schema` を使えばPostgreSQLのスキーマをSQL1本で自動取得できる
- vis-networkのflex高さ問題は `min-height: 0` で解決できる
- vis-networkのfit()は `afterDrawing` + `requestAnimationFrame` のタイミングが確実
- SVGベジェ曲線のコントロールポイントをFK距離に応じて動的調整するとER図が見やすい
- Docker Composeの `service_healthy` 条件でDB起動待ちを確実にハンドリングできる

---

## 📺 YouTube でも解説しています

この記事の内容を動画でも解説しています。手を動かしながら学びたい方はこちらもどうぞ！

👉 [ryuseiUeda のYouTubeチャンネル](http://www.youtube.com/@ryuseiUeda-0106)

---

## 📲 SNS でもつながりましょう

最新情報や学習の進捗はSNSで発信しています。

- 📸 Instagram: [@obako_illustrate](https://www.instagram.com/obako_illustrate/?hl=ja)
- 💬 LINE公式: [LINE登録はこちら](https://line.me/R/ti/p/@202qpxlu)

---
