-- init.sql
-- PostgreSQL テスト用サンプルスキーマ＆データ
-- ECサイト風のテーブル構成（users → orders → order_items / users → profiles / products）

-- ─────────────────────────────────────────
-- テーブル定義
-- ─────────────────────────────────────────

CREATE TABLE users (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  email      VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE profiles (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bio        TEXT,
  avatar_url VARCHAR(500),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE products (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(200) NOT NULL,
  price       NUMERIC(10, 2) NOT NULL,
  stock       INTEGER DEFAULT 0,
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE orders (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  total      NUMERIC(10, 2) NOT NULL,
  status     VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE order_items (
  id         SERIAL PRIMARY KEY,
  order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity   INTEGER NOT NULL,
  price      NUMERIC(10, 2) NOT NULL
);

-- ─────────────────────────────────────────
-- サンプルデータ
-- ─────────────────────────────────────────

INSERT INTO users (name, email) VALUES
  ('Alice Tanaka',   'alice@example.com'),
  ('Bob Suzuki',     'bob@example.com'),
  ('Carol Yamamoto', 'carol@example.com');

INSERT INTO profiles (user_id, bio, avatar_url) VALUES
  (1, 'フロントエンドエンジニア', 'https://example.com/avatars/alice.png'),
  (2, 'データサイエンティスト',   'https://example.com/avatars/bob.png'),
  (3, 'UXデザイナー',             'https://example.com/avatars/carol.png');

INSERT INTO products (name, price, stock) VALUES
  ('ワイヤレスイヤホン', 12800, 50),
  ('メカニカルキーボード', 24800, 30),
  ('USBハブ 7ポート', 3980, 100),
  ('ウェブカメラ HD', 8500, 20);

INSERT INTO orders (user_id, total, status) VALUES
  (1, 16780, 'completed'),
  (1, 24800, 'shipped'),
  (2, 12800, 'completed'),
  (3, 37300, 'pending');

INSERT INTO order_items (order_id, product_id, quantity, price) VALUES
  (1, 1, 1, 12800),
  (1, 3, 1, 3980),
  (2, 2, 1, 24800),
  (3, 1, 1, 12800),
  (4, 1, 1, 12800),
  (4, 2, 1, 24800);
