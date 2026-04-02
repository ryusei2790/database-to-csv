/**
 * @file erDiagram.ts
 * @responsibility vis-network で描画するための
 * ノード（テーブル）とエッジ（外部キー矢印）のJSON文字列を生成する
 */

import type { Table, ForeignKey } from "../db/schema";

/** vis-network のノード形式 */
interface VisNode {
  id:    string;
  label: string;
  /** テーブル名（データパネルの切り替えに使用） */
  title: string;
}

/** vis-network のエッジ形式 */
interface VisEdge {
  from:   string;
  to:     string;
  /** ツールチップに「from_col → to_col」を表示 */
  title:  string;
  arrows: string;
}

/**
 * テーブル一覧と外部キー一覧から vis-network 用の
 * nodes / edges JSON 文字列を生成して返す
 *
 * ノードのラベルは「テーブル名\nカラム一覧」の形式にして
 * ER図上でカラム構成がひと目でわかるようにする
 */
export function buildVisNetworkData(
  tables:      Table[],
  foreignKeys: ForeignKey[]
): { nodesJson: string; edgesJson: string } {
  // ─── ノード生成 ─────────────────────────────
  const nodes: VisNode[] = tables.map((t) => {
    // カラム名と型を1行ずつ並べてラベルに含める
    const columnLines = t.columns
      .map((c) => `${c.isPrimary ? "🔑 " : "   "}${c.name}: ${c.type}`)
      .join("\n");

    return {
      id:    t.name,
      label: `${t.name}\n──────────\n${columnLines}`,
      title: t.name,
    };
  });

  // ─── エッジ生成 ─────────────────────────────
  const edges: VisEdge[] = foreignKeys.map((fk) => ({
    from:   fk.fromTable,
    to:     fk.toTable,
    title:  `${fk.fromColumn} → ${fk.toColumn}`,
    arrows: "to",
  }));

  return {
    nodesJson: JSON.stringify(nodes),
    edgesJson: JSON.stringify(edges),
  };
}
