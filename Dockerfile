# Dockerfile
# Node.js 20 Alpine ベースの軽量CLIツール用イメージ
# TypeScript をコンパイルして dist/ を実行する

FROM node:20-alpine

WORKDIR /app

# 依存関係を先にコピーしてキャッシュを活用する
COPY package*.json ./
RUN npm install

# ソースコードをコピーしてビルド
COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

# output ディレクトリを作成（ボリュームマウント先）
RUN mkdir -p /app/output

# CLIを実行する
CMD ["node", "dist/index.js"]
