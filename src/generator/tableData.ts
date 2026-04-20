/**
 * @file tableData.ts
 * @responsibility 各テーブルのデータを SELECT * で取得して
 * Tabulator 用の JSON 形式に変換する
 */

import { pool } from "../db/client";
import type { Table } from "../db/schema";
import { quoteIdentifier } from "../db/identifiers";

/** Tabulator に渡す1テーブル分のデータ */
export interface TableData {
  /** 一意なテーブルID */
  id:      string;
  /** スキーマ名 */
  schema:  string;
  /** 生のテーブル名 */
  name:    string;
  /** 画面表示用のテーブル名 */
  displayName: string;
  /** テーブル名 */
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
      const { rows } = await pool.query(
        `SELECT * FROM ${quoteIdentifier(t.schema)}.${quoteIdentifier(t.name)} LIMIT $1`,
        [limit]
      );

      return {
        id: t.id,
        schema: t.schema,
        name: t.name,
        displayName: t.displayName,
        columns: t.columns.map((c) => c.name),
        rows,
      };
    })
  );

  return results;
}
