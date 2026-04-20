/**
 * @file identifiers.ts
 * @responsibility PostgreSQL のスキーマ/テーブル識別子を安全に扱う
 */

/** テーブルを一意に識別するためのIDを作る */
export function makeTableId(schema: string, table: string): string {
  return `${encodeURIComponent(schema)}.${encodeURIComponent(table)}`;
}

/** 画面表示用のスキーマ修飾テーブル名を返す */
export function formatQualifiedName(schema: string, table: string): string {
  return `${schema}.${table}`;
}

/** SQL 識別子として安全に引用できる形へ変換する */
export function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, "\"\"")}"`;
}

