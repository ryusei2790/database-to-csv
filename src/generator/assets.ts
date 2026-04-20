/**
 * @file assets.ts
 * @responsibility 生成HTMLが参照するフロントエンド資産を output/ にコピーする
 */

import * as fs from "fs";
import * as path from "path";

interface RuntimeAsset {
  source: string;
  outputFile: string;
}

const RUNTIME_ASSETS: RuntimeAsset[] = [
  {
    source: require.resolve("vis-network/standalone/umd/vis-network.min.js"),
    outputFile: "vis-network.min.js",
  },
  {
    source: require.resolve("tabulator-tables/dist/js/tabulator.min.js"),
    outputFile: "tabulator.min.js",
  },
  {
    source: require.resolve("tabulator-tables/dist/css/tabulator.min.css"),
    outputFile: "tabulator.min.css",
  },
];

export function copyRuntimeAssets(outputDir: string): void {
  const assetsDir = path.join(outputDir, "assets");
  fs.mkdirSync(assetsDir, { recursive: true });

  for (const asset of RUNTIME_ASSETS) {
    fs.copyFileSync(asset.source, path.join(assetsDir, asset.outputFile));
  }
}
