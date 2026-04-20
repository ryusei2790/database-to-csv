/**
 * @file index.ts
 * @responsibility CLIエントリーポイント
 * DB接続 → スキーマ取得 → データ取得 → HTML生成 → ファイル出力 の全体フローを管理する
 */

import * as fs   from "fs";
import * as path from "path";

import { pool }               from "./db/client";
import { fetchTables, fetchForeignKeys } from "./db/schema";
import { fetchAllTableData }  from "./generator/tableData";
import { buildVisNetworkData } from "./generator/erDiagram";
import { generateHtml }            from "./generator/html";
import { generateTableViewerHtml } from "./generator/tableViewerHtml";
import { generateSchemaHtml }      from "./generator/schemaHtml";
import { copyRuntimeAssets }       from "./generator/assets";

/** 出力先ディレクトリ（docker-compose のボリュームマウントと合わせる） */
const OUTPUT_DIR    = path.join(__dirname, "..", "output");
const REPORT_PATH   = path.join(OUTPUT_DIR, "report.html");
const VIEWER_PATH   = path.join(OUTPUT_DIR, "viewer.html");
const SCHEMA_PATH   = path.join(OUTPUT_DIR, "schema.html");

async function main(): Promise<void> {
  console.log("🔌 PostgreSQL に接続中...");

  try {
    // ─── 1. スキーマ情報の取得 ──────────────────────
    console.log("📋 スキーマ情報を取得中...");
    const [tables, foreignKeys] = await Promise.all([
      fetchTables(),
      fetchForeignKeys(),
    ]);
    console.log(`   ✅ テーブル数: ${tables.length}, 外部キー数: ${foreignKeys.length}`);

    // ─── 2. テーブルデータの取得 ────────────────────
    console.log("📊 テーブルデータを取得中...");
    const tableData = await fetchAllTableData(tables);
    const totalRows = tableData.reduce((sum, t) => sum + t.rows.length, 0);
    console.log(`   ✅ 合計 ${totalRows} 行取得`);

    // ─── 3. HTML 生成 ────────────────────────────────
    console.log("🎨 HTML を生成中...");
    const dbName      = process.env.DB_NAME ?? "unknown";
    const generatedAt = new Date().toLocaleString("ja-JP");

    const { nodesJson, edgesJson } = buildVisNetworkData(tables, foreignKeys);

    const reportHtml = generateHtml({
      tableData,
      foreignKeys,
      dbName,
      generatedAt,
    });

    const viewerHtml = generateTableViewerHtml({
      nodesJson,
      edgesJson,
      tableData,
      dbName,
      generatedAt,
    });

    const schemaHtml = generateSchemaHtml({
      tables,
      foreignKeys,
      dbName,
      generatedAt,
    });

    // ─── 4. ファイル出力 ─────────────────────────────
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    copyRuntimeAssets(OUTPUT_DIR);
    fs.writeFileSync(REPORT_PATH, reportHtml, "utf-8");
    fs.writeFileSync(VIEWER_PATH, viewerHtml, "utf-8");
    fs.writeFileSync(SCHEMA_PATH, schemaHtml, "utf-8");

    console.log(`\n✅ 完了！レポートを出力しました:`);
    console.log(`   🗂  キャンバスビュー  : output/report.html`);
    console.log(`   📋 テーブルビューアー : output/viewer.html`);
    console.log(`   🗺  スキーマ概観      : output/schema.html`);

  } catch (err) {
    console.error("\n❌ エラーが発生しました:");
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  } finally {
    // 接続プールを終了してプロセスを正常終了させる
    await pool.end();
  }
}

main();
