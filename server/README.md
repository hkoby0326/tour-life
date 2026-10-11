# Tour Life server（アカウント・クラウドセーブ・オンライン対戦）

依存なしの Node（22 以上、内蔵 SQLite を使う）。`node server/server.js` で起動。ポートは引数か `PORT`。

- `DATA_DIR`: SQLite ファイルの置き場（既定 `server/data`）。**永続ディスクに置くこと**。消えるとアカウントとセーブが全部消える
- `ADMIN_TOKEN`: 管理 API（停止・パスワード再設定）用。未設定なら管理 API は無効
- HTTP: `/`（ゲーム本体を配信）、`/api/*`（JSON）、`/health`。WebSocket: `/ws`
- ゲーム側は対戦タブの「サーバー URL」に `https://ホスト名`（ローカルなら `http://localhost:8787`）

## ローカルで試す
```
node server/server.js
# http://localhost:8787 を2つのブラウザ（別プロファイル）で開き、別々の ID で登録 → 部屋を作る／参加
```

## ホスティング
- **Fly.io**: `fly launch`（Dockerfile なしで Node を自動検出）、`fly volumes create data --size 1`、`fly.toml` の `[mounts]` で `/data` にマウントし、`DATA_DIR=/data` と `ADMIN_TOKEN` を `fly secrets set`。常時稼働は最小構成で月数ドル
- **VPS（さくら、Lightsail など）**: Node 22 を入れ、`systemd` で起動、Caddy を前に置くと TLS が自動（`caddy reverse_proxy localhost:8787`）
- **Render**: `render.yaml` 同梱。無料枠はディスクが消えるので試用のみ。有料プラン＋Disk（`/data`）で `DATA_DIR=/data`

GitHub Pages と併用する場合は `wss` が必要（Pages は https）。このサーバーが本体も配信するので、Pages を使わない構成も可。

## 管理
```
curl -X POST https://HOST/api/admin/reset -H "x-admin-token: $ADMIN_TOKEN" -H "content-type: application/json" -d '{"id":"kid1"}'
curl -X POST https://HOST/api/admin/ban   -H "x-admin-token: $ADMIN_TOKEN" -H "content-type: application/json" -d '{"id":"someone","banned":true}'
```
