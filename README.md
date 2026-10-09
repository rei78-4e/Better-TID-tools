## Better-TID-tools とは

学校向けサイトでの操作を自動化・簡略化するブラウザ拡張機能です。Chrome / Edge などの Chromium 系ブラウザと Firefox に対応しています。

<a href="https://chromewebstore.google.com/detail/jalaobkiafefppnbpfmpanloohopepfc">
<img src="https://github.com/user-attachments/assets/d4a03bdd-daa8-4dbc-9479-6334d995782a" alt="Chromium向けに「Better TID tools 」を入手する">
</a>

### 主な機能

1. **AAA出席サポート**（`aaaportal.tid.ac.jp`）
   - **Enterキー**で出席送信、**Escキー**で閉じる操作に対応
   - ボタン横にキー操作ヒントを表示
   - 出席パスワード入力欄を表示状態に変更
   - 時間割から現在授業を判定し、出席ポップアップを自動表示

2. **ポータル自動リダイレクト**（`portal.tid.ac.jp`）
   - `/login` に来たとき `/api/saml/login` へ自動遷移
   - SPA の URL 変更（pushState / replaceState など）にも追従

3. **Panopto字幕取得機能**（`tid.ap.panopto.com`）
   - 字幕テキストをコピー
   - **TXT / VTT（時間付き）** 形式でダウンロード可能

4. **IT/DXテスト自動回答補助**（`itl.jikeigroup.net`, `itlexam.jikeigroup.net`）
   - 画面上にバナーとスイッチを表示
   - スイッチON時、内蔵データをもとに自動で回答選択

> [!NOTE]
> より良い manaba ツールやモダンな UI など、さらに機能を追加する予定です。

[chrome web store](https://chromewebstore.google.com/detail/better-tid-tools/jalaobkiafefppnbpfmpanloohopepfc?pli=1)

## インストール方法

### Chrome / Chromium 系

1. [リリース](https://github.com/rei78-4e/Better-TID-tools/releases)から `Better-TID-tools.zip` を解凍します。
2. Chrome拡張機能の設定を開きます: `chrome://extensions/` またはChrome UI。
3. 右上のボタンで**開発者モード**をオンにします。
4. 解凍したフォルダを`load unpacked`ボタンでインポートして使用します。

開発者モードをオンにする

<img width="369" height="139" alt="Screenshot 2025-12-11 at 14 06 55" src="https://github.com/user-attachments/assets/6210f91e-752b-4f1e-ae3d-dda99cdd77c4" /><br>

フォルダをインポートする

<img width="498" height="228" alt="Screenshot 2025-12-11 at 14 07 01 1" src="https://github.com/user-attachments/assets/3c284e1a-a75a-4a28-b69d-eff55faccb2e" /><br>

インストールを確認する

<img width="423" height="265" alt="Screenshot 2025-12-11 at 14 06 14" src="https://github.com/user-attachments/assets/1ac6d763-3ad0-4dd6-b5bc-e2178d3d3a79" /><br>

### Firefox

Firefox 128 以降が必要です。

1. [リリース](https://github.com/rei78-4e/Better-TID-tools/releases)から `Better-TID-tools-firefox.xpi` をダウンロードします。
2. Firefox で `about:addons` を開き、歯車アイコン → **ファイルからアドオンをインストール…** を選んで、ダウンロードした `.xpi` を選択します（`.xpi` を Firefox のウィンドウへドラッグ＆ドロップしても構いません）。
3. 権限の確認が表示されるので、**追加**を選びます。

`.xpi` は Mozilla の署名済みなので、Firefox を再起動しても消えません。新しいバージョンがリリースされると Firefox が自動で更新します。

> [!NOTE]
> 機能が動作しない場合は、`about:addons` から本拡張機能の「権限」を開き、対象サイトへのアクセスが許可されているか確認してください（Firefox ではユーザーが後から取り消せます）。

<details>
<summary>署名なしの zip を一時的に読み込む場合（開発用）</summary>

1. `Better-TID-tools-firefox.zip` を解凍します。
2. `about:debugging#/runtime/this-firefox` を開き、**一時的なアドオンを読み込む**から解凍したフォルダの `manifest.json` を選択します。

この方法で読み込んだアドオンは Firefox の再起動で消えます。
</details>

### 開発時のパッケージ作成

```sh
python scripts/build_packages.py          # HEAD から Chrome 版・Firefox 版の zip を作成
python scripts/build_packages.py v1.6     # 指定タグから作成
```

Firefox 版の `manifest.json` は、ビルド時に `manifest.json` へ `browser_specific_settings` を追加して生成されます。

### Firefox 版の署名（AMO unlisted）

リリース workflow は、Firefox 版を AMO（addons.mozilla.org）に unlisted として提出し、署名済みの `.xpi` を受け取って GitHub Release に添付します。AMO のストアには掲載されません。

1. AMO の [API キー管理ページ](https://addons.mozilla.org/developers/addon/api/key/)で JWT issuer と JWT secret を発行します。
2. GitHub リポジトリの **Settings → Secrets and variables → Actions → Repository secrets** に以下を登録します。
   - `AMO_JWT_ISSUER`: JWT issuer
   - `AMO_JWT_SECRET`: JWT secret
3. 通常どおりリリースを作成すると、Release に `Better-TID-tools-firefox.xpi` と `updates.json` が添付されます。

Firefox は `manifest.json` の `update_url`（`releases/latest/download/updates.json`）を定期的に確認し、新しいバージョンがあれば自動で更新します。

secrets が未登録の場合、署名はスキップされ zip のみが公開されます。同じバージョンは AMO に再提出できないため、署名が通ったあとに workflow を再実行すると署名ステップは失敗します。

### プレリリース（ベータ版）

Actions の **dispatch release** を実行するときに **prerelease** にチェックを入れると、GitHub Release が pre-release として作成されます。

- pre-release は「Latest」にならないため、`releases/latest/download/updates.json` は直前の正式版を指したままです。正式版の利用者にベータ版が自動配信されることはありません。
- バージョン番号は数字のみです（Chrome・Firefox とも `1.7-beta` のような表記は不可）。AMO では同じバージョンを 2 回署名できないため、ベータ版には正式版より小さい番号を使います（例: ベータ `1.6.90`, `1.6.91` → 正式版 `1.7`）。
