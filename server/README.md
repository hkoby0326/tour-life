# Tour Life online match server

依存なしの Node サーバー（Node 18 以上）。`node server/server.js` で起動。ポートは引数か `PORT`。

- `/ws` が WebSocket。ゲーム側は設定タブの「対戦サーバー URL」に `wss://ホスト名/ws`（ローカルなら `ws://localhost:8787/ws`）を入れる
- ルートにゲーム本体も配信するので、`http://localhost:8787/` を開けば同じ端末で2タブ対戦の確認ができる
- 部屋は5文字コード、1時間で消える。試合中に片方が切れると部屋は閉じる

## 無料ホスティングの例（Render）
1. GitHub の `tour-life` を Render に接続し、Web Service を作る（Runtime: Node）
2. Build Command は空、Start Command は `node server/server.js`
3. 公開 URL が `https://xxx.onrender.com` なら、ゲームの設定に `wss://xxx.onrender.com/ws`
4. 無料枠は15分無操作で停止し、次の接続に30〜60秒かかる
