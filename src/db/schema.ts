/**
 * @file schema.ts
 * @responsibility PostgreSQLのinformation_schemaを参照して
 * テーブル一覧・カラム情報・外部キー（FK）一覧を取得する
 */

import { pool } from "./client";
import { formatQualifiedName, makeTableId } from "./identifiers";

/** テーブルの1カラムを表す型 */
export interface Column {
  name:       string;
  type:       string;
  nullable:   boolean;
  isPrimary:  boolean;
}

/** テーブル1件を表す型 */
export interface Table {
  id:          string;
  schema:      string;
  name:        string;
  displayName: string;
  columns:     Column[];
}

/** 外部キー1件を表す型（矢印の始点・終点に使用） */
export interface ForeignKey {
  fromSchema: string;
  /** FKを持つテーブル（矢印の元） */
  fromTable:  string;
  fromDisplayName: string;
  /** FKカラム名 */
  fromColumn: string;
  toSchema: string;
  /** 参照先テーブル（矢印の先） */
  toTable:    string;
  toDisplayName: string;
  /** 参照先カラム名 */
  toColumn:   string;
}

function parseTargetSchemas(): string[] | null {
  const raw = process.env.DB_SCHEMA?.trim();
  if (!raw) return null;

  const schemas = raw
    .split(",")
    .map((schema) => schema.trim())
    .filter(Boolean);

  return schemas.length > 0 ? schemas : null;
}

async function resolveTargetSchemas(): Promise<string[]> {
  const configured = parseTargetSchemas();
  if (configured) return configured;

  const { rows } = await pool.query<{ schema_name: string }>(`
    SELECT schema_name
    FROM information_schema.schemata
    WHERE schema_name <> 'information_schema'
      AND schema_name NOT LIKE 'pg_%'
    ORDER BY schema_name
  `);

  return rows.map((row) => row.schema_name);
}

/**
 * 対象スキーマのテーブル一覧とカラム情報を取得する
 * information_schema.columns を使うことで PostgreSQL バージョンに依存しない
 */
export async function fetchTables(): Promise<Table[]> {
  const schemas = await resolveTargetSchemas();

  // PRIMARY KEY 情報と結合して isPrimary フラグを付与する
  const { rows } = await pool.query<{
    table_schema: string;
    table_name:  string;
    column_name: string;
    data_type:   string;
    is_nullable: string;
    is_primary:  string;
  }>(`
    SELECT
      c.table_schema,
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
      AND kcu.table_schema   = tc.table_schema
      AND kcu.table_name     = tc.table_name
      AND kcu.column_name    = c.column_name
    WHERE c.table_schema = ANY($1::text[])
    ORDER BY c.table_schema, c.table_name, c.ordinal_position
  `, [schemas]);

  // テーブル名でグループ化して Table[] に変換する
  const tableMap = new Map<string, Table>();
  for (const row of rows) {
    const tableId = makeTableId(row.table_schema, row.table_name);
    if (!tableMap.has(tableId)) {
      tableMap.set(tableId, {
        id: tableId,
        schema: row.table_schema,
        name: row.table_name,
        displayName: formatQualifiedName(row.table_schema, row.table_name),
        columns: [],
      });
    }
    tableMap.get(tableId)!.columns.push({
      name:      row.column_name,
      type:      row.data_type,
      nullable:  row.is_nullable === "YES",
      isPrimary: row.is_primary === "YES",
    });
  }

  return Array.from(tableMap.values());
}

/**
 * 対象スキーマ間の外部キー一覧を取得する
 * pg_constraint を使い、複合外部キーでも列順を崩さずに対応関係を復元する
 */
export async function fetchForeignKeys(): Promise<ForeignKey[]> {
  const schemas = await resolveTargetSchemas();

  const { rows } = await pool.query<{
    from_schema: string;
    from_table:  string;
    from_column: string;
    to_schema: string;
    to_table:    string;
    to_column:   string;
  }>(`
    SELECT
      src_ns.nspname  AS from_schema,
      src_tbl.relname AS from_table,
      src_att.attname AS from_column,
      tgt_ns.nspname  AS to_schema,
      tgt_tbl.relname AS to_table,
      tgt_att.attname AS to_column
    FROM pg_constraint con
    JOIN pg_class src_tbl
      ON src_tbl.oid = con.conrelid
    JOIN pg_namespace src_ns
      ON src_ns.oid = src_tbl.relnamespace
    JOIN pg_class tgt_tbl
      ON tgt_tbl.oid = con.confrelid
    JOIN pg_namespace tgt_ns
      ON tgt_ns.oid = tgt_tbl.relnamespace
    JOIN unnest(con.conkey) WITH ORDINALITY AS src_key(attnum, position)
      ON true
    JOIN unnest(con.confkey) WITH ORDINALITY AS tgt_key(attnum, position)
      ON tgt_key.position = src_key.position
    JOIN pg_attribute src_att
      ON src_att.attrelid = src_tbl.oid
      AND src_att.attnum  = src_key.attnum
    JOIN pg_attribute tgt_att
      ON tgt_att.attrelid = tgt_tbl.oid
      AND tgt_att.attnum  = tgt_key.attnum
    WHERE con.contype = 'f'
      AND src_ns.nspname = ANY($1::text[])
      AND tgt_ns.nspname = ANY($1::text[])
    ORDER BY from_schema, from_table, src_key.position
  `, [schemas]);

  return rows.map((r) => ({
    fromSchema: r.from_schema,
    fromTable:  makeTableId(r.from_schema, r.from_table),
    fromDisplayName: formatQualifiedName(r.from_schema, r.from_table),
    fromColumn: r.from_column,
    toSchema: r.to_schema,
    toTable:    makeTableId(r.to_schema, r.to_table),
    toDisplayName: formatQualifiedName(r.to_schema, r.to_table),
    toColumn:   r.to_column,
  }));
}
