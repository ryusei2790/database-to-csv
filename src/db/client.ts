/**
 * @file client.ts
 * @responsibility PostgreSQL接続プールを生成して提供する
 * 環境変数からDB接続情報を読み取り、pg.Pool インスタンスを返す
 */

import { Pool } from "pg";
import * as dotenv from "dotenv";

// .env ファイルを読み込む（Docker 実行時は environment で上書きされる）
dotenv.config();

/**
 * DB接続設定を環境変数から構築する
 * 必須変数が未設定の場合はエラーを投げてプロセスを止める
 */
function buildConfig() {
  const required = ["DB_HOST", "DB_PORT", "DB_USER", "DB_PASSWORD", "DB_NAME"];
  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`環境変数 ${key} が設定されていません。.env.example を参考に設定してください。`);
    }
  }

  return {
    host:     process.env.DB_HOST!,
    port:     parseInt(process.env.DB_PORT!, 10),
    user:     process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    database: process.env.DB_NAME!,
  };
}

/**
 * アプリ全体で使い回す接続プール
 * 複数クエリを並行実行する際もプールが接続を管理してくれる
 */
export const pool = new Pool(buildConfig());
