/**
 * @file tableData.ts
 * @responsibility 各テーブルのデータを SELECT * で取得して
 * Tabulator 用の JSON 形式に変換する
 */

import { pool } from "../db/client";
import type { Table } from "../db/schema";

/** Tabulator に渡す1テーブル分のデータ */
export interface TableData {
  /** テーブル名 */
  name:    string;
  /** カラム名の配列（Tabulator の columns 定義に使用） */
  columns: string[];
  /** 行データの配列 */
  rows:    Record<string, unknown>[];
}

/**
 * テーブル一覧を受け取り、各テーブルの全データを取得する
 * LIMIT で最大取得行数を制限してHTMLサイズが肥大化しないようにする
 *
 * Promise.all で全テーブルを並行クエリして高速化する
 */
export async function fetchAllTableData(tables: Table[]): Promise<TableData[]> {
  const limit = parseInt(process.env.LIMIT ?? "1000", 10);

  const results = await Promise.all(
    tables.map(async (t) => {
      // SQL インジェクション対策：テーブル名を識別子として引用符で囲む
      // pg の $1 プレースホルダはテーブル名には使えないため
      // テーブル名を英数字・アンダースコアに限定して検証する
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(t.name)) {
        console.warn(`⚠️  テーブル名が不正なためスキップ: ${t.name}`);
        return { name: t.name, columns: [], rows: [] };
      }

      const { rows } = await pool.query(
        `SELECT * FROM "${t.name}" LIMIT $1`,
        [limit]
      );

      return {
        name:    t.name,
        columns: t.columns.map((c) => c.name),
        rows,
      };
    })
  );

  return results;
}
