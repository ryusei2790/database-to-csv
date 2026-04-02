/**
 * @file schema.ts
 * @responsibility PostgreSQLのinformation_schemaを参照して
 * テーブル一覧・カラム情報・外部キー（FK）一覧を取得する
 */

import { pool } from "./client";

/** テーブルの1カラムを表す型 */
export interface Column {
  name:       string;
  type:       string;
  nullable:   boolean;
  isPrimary:  boolean;
}

/** テーブル1件を表す型 */
export interface Table {
  name:    string;
  columns: Column[];
}

/** 外部キー1件を表す型（矢印の始点・終点に使用） */
export interface ForeignKey {
  /** FKを持つテーブル（矢印の元） */
  fromTable:  string;
  /** FKカラム名 */
  fromColumn: string;
  /** 参照先テーブル（矢印の先） */
  toTable:    string;
  /** 参照先カラム名 */
  toColumn:   string;
}

/**
 * public スキーマのテーブル一覧とカラム情報を取得する
 * information_schema.columns を使うことで PostgreSQL バージョンに依存しない
 */
export async function fetchTables(): Promise<Table[]> {
  // PRIMARY KEY 情報と結合して isPrimary フラグを付与する
  const { rows } = await pool.query<{
    table_name:  string;
    column_name: string;
    data_type:   string;
    is_nullable: string;
    is_primary:  string;
  }>(`
    SELECT
      c.table_name,
      c.column_name,
      c.data_type,
      c.is_nullable,
      CASE WHEN kcu.column_name IS NOT NULL THEN 'YES' ELSE 'NO' END AS is_primary
    FROM information_schema.columns c
    LEFT JOIN information_schema.table_constraints tc
      ON tc.table_schema = c.table_schema
      AND tc.table_name  = c.table_name
      AND tc.constraint_type = 'PRIMARY KEY'
    LEFT JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name
      AND kcu.column_name    = c.column_name
    WHERE c.table_schema = 'public'
    ORDER BY c.table_name, c.ordinal_position
  `);

  // テーブル名でグループ化して Table[] に変換する
  const tableMap = new Map<string, Table>();
  for (const row of rows) {
    if (!tableMap.has(row.table_name)) {
      tableMap.set(row.table_name, { name: row.table_name, columns: [] });
    }
    tableMap.get(row.table_name)!.columns.push({
      name:      row.column_name,
      type:      row.data_type,
      nullable:  row.is_nullable === "YES",
      isPrimary: row.is_primary === "YES",
    });
  }

  return Array.from(tableMap.values());
}

/**
 * public スキーマの外部キー一覧を取得する
 * information_schema.referential_constraints を使って
 * fromTable → toTable の方向を取得する
 */
export async function fetchForeignKeys(): Promise<ForeignKey[]> {
  const { rows } = await pool.query<{
    from_table:  string;
    from_column: string;
    to_table:    string;
    to_column:   string;
  }>(`
    SELECT
      kcu.table_name   AS from_table,
      kcu.column_name  AS from_column,
      ccu.table_name   AS to_table,
      ccu.column_name  AS to_column
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema   = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema   = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
    ORDER BY from_table, from_column
  `);

  return rows.map((r) => ({
    fromTable:  r.from_table,
    fromColumn: r.from_column,
    toTable:    r.to_table,
    toColumn:   r.to_column,
  }));
}
