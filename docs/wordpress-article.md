# AIにコードは書かせられる。でもデータベースが見えないと詰む話【db-canvas-viewer】

---

## はじめに

AIがコードを書いてくれる時代になりました。

ChatGPTやClaude Codeに「このAPIを実装して」と伝えれば、数十秒で動くコードが出てきます。コード生成は、もはや「解決済みの課題」と言っていいかもしれません。

でも、こんな経験はありませんか？

- 「AIに指示したいけど、テーブルの構造を説明できない」
- 「どのテーブルがどこと繋がってるか、毎回SQLで確認してる」
- 「初めて触るDBは何があるかわからなくて、AIへの指示が雑になる」

**AI駆動開発で本当のボトルネックは、コードではなくデータベースの可視化です。**

この記事では、その問題を解決するオープンソースツール「db-canvas-viewer」の仕組みと使い方を紹介します。

**この記事でわかること：**

- なぜAI駆動開発でDBの可視化がボトルネックになるのか
- db-canvas-viewerで何が解決できるのか
- SQL不要でER図・テーブルデータ・FK関係を確認する方法
- Dockerで3コマンド起動する手順

---

## AI駆動開発の「本当の壁」とは何か

### コード生成はもう問題じゃない

2024〜2025年で、AIによるコード生成の精度は劇的に向上しました。

「TypeScriptでRESTful APIを作って」「このバグを修正して」「テストコードを書いて」——これらはAIが十分に対応できます。

プログラミング学習者がAIと一緒に実務レベルのアプリを作れるようになったのは、この進化のおかげです。

### AIへの指示精度を決めるのは「DBの理解度」

ところが、AI駆動開発には見落とされがちな壁があります。

**AIへの指示の質は、開発者がデータベース構造をどれだけ把握しているかに直結します。**

例えば、こんな指示の違いを比べてみてください：

```
❌ 悪い指示:
「注文履歴を取得するAPIを作って」

✅ 良い指示:
「ordersテーブルとorder_itemsテーブルをJOINして、
 customer_idで絞り込む注文履歴取得APIを作って。
 外部キーはorders.id → order_items.order_idで繋がってる」
```

同じことを依頼していても、後者の指示はAIが一発で正しいコードを出してきます。前者は「どんなテーブル構造ですか？」という確認から始まります。

**AIを使いこなせる開発者とそうでない開発者の差は、DBを素早く把握できるかどうかです。**

### 「テーブル構造がわからない」が開発を止める

では、DBの構造を確認するにはどうすればいいか。

従来の方法はこうです：

```sql
-- テーブル一覧を確認
\dt

-- カラム構造を確認
\d+ orders

-- 外部キーを確認
SELECT
  kcu.table_name, kcu.column_name,
  ccu.table_name AS foreign_table_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ...
```

毎回SQLを叩いて、テキスト形式の結果を読んで、頭の中でER図を組み立てる。

慣れた人にとっては問題ありませんが、**プログラミング学習者や初めて触るDBではこれがひとつのハードルになります。**

しかも、AI駆動開発では「DB構造をAIに説明する」という作業が発生します。SQLの出力結果をコピーしてAIに貼り付けて、「この構造で…」という説明を毎回する必要があります。

---

## db-canvas-viewerで解決できること

**db-canvas-viewer**は、PostgreSQLに接続するだけで、テーブル構造・FK関係・実データを3種類のHTMLレポートとして自動生成するCLIツールです。

GitHubリポジトリ：https://github.com/ryusei2790/database-to-csv

SQLを1行も書かずに、以下がブラウザで確認できます。

### 🗂 キャンバスビュー：全テーブルを一画面で

全テーブルのデータをキャンバス上に同時表示し、FK（外部キー）関係をベジェ曲線の矢印で接続します。

- ドラッグでパン（画面移動）
- ホイールでズームイン/アウト
- FK依存関係を矢印で視覚的に把握

AIに「このDB構造で…」と説明するときも、このビューをスクリーンショットするだけで済みます。

### 📋 テーブルビューアー：ER図クリックでデータ確認

左パネルにER図、右パネルにテーブルデータが表示されます。

- ER図のノードをクリックするとデータが右パネルに表示
- カラムフィルター・ページネーション付き
- CSVダウンロードボタン1クリックで出力

「どんなデータが入ってるか」をSQLなしで確認できるため、AIへの指示に使うサンプルデータを素早く取得できます。

### 🗺 スキーマ概観：PK・FK・カラムを色分けで全画面表示

全カラムを🔑PK / 🔗FK / 通常で色分けしたER図を全画面表示します。

- 階層型レイアウトで依存関係が一目瞭然
- フォース型レイアウトに切り替えも可能
- テーブル一覧サイドバーで特定テーブルへのフォーカスができる

---

## db-canvas-viewerの技術的な仕組み

### information_schemaでスキーマを自動取得

このツールの汎用性の核心は、PostgreSQL標準の`information_schema`の活用です。

```typescript
// テーブル・カラム・PK情報を一括取得
const result = await pool.query(`
  SELECT
    t.table_name,
    c.column_name,
    c.data_type,
    CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END AS is_primary
  FROM information_schema.tables t
  JOIN information_schema.columns c
    ON t.table_name = c.table_name
  WHERE t.table_schema = 'public'
    AND t.table_type = 'BASE TABLE'
  ORDER BY t.table_name, c.ordinal_position
`);
```

`information_schema`はPostgreSQLに標準搭載されているメタデータテーブル群です。これにより、**接続先のDBに合わせた設定不要で構造を自動取得**できます。

外部キーも同様に自動取得します：

```typescript
// FK関係を自動取得
SELECT
  kcu.table_name  AS from_table,
  kcu.column_name AS from_column,
  ccu.table_name  AS to_table,
  ccu.column_name AS to_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON ...
JOIN information_schema.constraint_column_usage ccu ON ...
WHERE tc.constraint_type = 'FOREIGN KEY'
```

### SVGベジェ曲線でFK矢印を描画

キャンバスビューのFK矢印はSVGで描かれており、FK元カラムからFK先カラムへS字カーブで接続します。

制御点（コントロールポイント）をテーブル間距離に応じて動的に調整することで、近くても遠くても自然なカーブになります：

```javascript
const cpOffset = Math.max(50, Math.abs(fromY - toY) * 0.4);
const path = `M ${fromX} ${fromY} `
           + `C ${fromX} ${fromY - cpOffset} `
           + `  ${toX} ${toY + cpOffset} `
           + `  ${toX} ${toY}`;
```

### トポロジカルソートで親テーブルを上位に配置

FK参照関係を有向グラフとみなし、参照される側（親テーブル）が上層、参照する側（子テーブル）が下層になるよう自動配置します。循環FK（相互参照）が存在する場合もクラッシュしないよう対策済みです。

```javascript
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
```

---

## セットアップ方法：3コマンドで起動

### 前提条件

- Docker / Docker Composeがインストール済みであること

### 起動手順

```bash
# リポジトリをクローン
git clone https://github.com/ryusei2790/database-to-csv.git
cd database-to-csv

# 起動（PostgreSQL初期化 + HTMLレポート生成）
docker compose up
```

これだけです。`output/`ディレクトリにHTMLが生成されます：

```
output/
├── report.html   # キャンバスビュー
├── viewer.html   # テーブルビューアー + CSVエクスポート
└── schema.html   # スキーマ概観ER図
```

ブラウザで`output/report.html`を開くと確認できます。

### 自分のDBに接続する場合

`docker-compose.yml`の環境変数を書き換えるだけです：

```yaml
environment:
  DB_HOST: your-db-host
  DB_PORT: 5432
  DB_USER: your-user
  DB_PASSWORD: your-password
  DB_NAME: your-db-name
  LIMIT: 1000   # 取得する最大行数
```

---

## よくある質問

**Q. PostgreSQL以外のDB（MySQL・SQLiteなど）にも対応していますか？**

現在はPostgreSQL専用です。`information_schema`はMySQLにも存在するため、対応拡張の余地はあります。

**Q. データは外部に送信されますか？**

送信されません。完全ローカルで動作します。生成されたHTMLも単体で動くスタンドアロンファイルです（CDN依存あり）。

**Q. 大きなDBでも使えますか？**

`LIMIT`環境変数でテーブルごとの最大取得行数を制御できます（デフォルト1000行）。スキーマ取得（テーブル構造・FK）はデータ量に関係なく動作します。

**Q. AI（ChatGPT・Claudeなど）と組み合わせるにはどうすればいいですか？**

スキーマ概観のスクリーンショットをAIに貼り付けるだけで、DB構造を視覚的に伝えられます。また、テーブルビューアーのCSVエクスポートでサンプルデータをAIに渡すこともできます。

**Q. TypeScriptやDockerの知識は必要ですか？**

使用するだけであれば不要です。`docker compose up`の1コマンドで動きます。コードを読んで学習したい方向けに、各ファイルに設計意図のコメントを入れています。

---

## まとめ

- AI駆動開発の本当のボトルネックは「コード生成」ではなく「DB構造の把握」
- AIへの指示精度はDBをどれだけ素早く理解できるかに直結する
- db-canvas-viewerはSQL不要でPostgreSQLの構造・データ・FK関係を可視化する
- `information_schema`により接続先DB問わず自動スキーマ取得が可能
- `docker compose up`の1コマンドで起動でき、3種類のHTMLレポートを生成する

**DB構造が見えると、AIへの指示が変わります。指示が変わると、開発速度が変わります。**

ぜひ試してみてください。

---

## この記事を書いた人

**ryusei Ueda**
動画編集 × プログラミング学習中。DaVinci Resolveを使った動画編集と、Web開発・AI活用開発を並行して進めています。学んだことをZenn・note・WordPressで発信中。

- 📺 YouTube: [ryuseiUeda チャンネル](http://www.youtube.com/@ryuseiUeda-0106)
- 📸 Instagram: [@obako_illustrate](https://www.instagram.com/obako_illustrate/?hl=ja)
- 🐦 X (Twitter): [@zzkptrjmj36b7ic](https://x.com/zzkptrjmj36b7ic)

---

## 📲 LINE 公式アカウント

限定情報やお役立ちコンテンツをLINEで配信しています。ぜひ登録してください！

👉 [LINE公式アカウントに登録する](https://line.me/R/ti/p/@202qpxlu)

---
