# Cloudflare / Netlify を使わずに iPhone アプリにする

## 先に結論

iPhoneのホーム画面アプリ（PWA）にするには、**HTTPSのURLがどうしても1つ必要**です。
これはiOSの仕様で、こちらのコードの都合ではありません。
「ホーム画面に追加」はURLを登録する機能なので、登録すべきURLが無いと成立しません。

抜け道は2つだけです。

- **A. 別の無料ホスティングを使う** — GitHub Pages なら iPhone だけで完結します（推奨）
- **B. ホスティングを一切使わない** — その場合、ホーム画面アプリは諦めるか、Mac が必要になります

---

## A. GitHub Pages（iPhoneだけで完結・推奨）

PCもアプリのインストールも不要。Safariだけで終わります。所要10分程度。

### 手順

1. **ファイルをiPhoneに保存する**
   `meeting-floor-app` の中身をダウンロードし、「ファイル」アプリに置く

2. **GitHubに登録する**（無料）
   Safariで `github.com` → Sign up

3. **リポジトリを作る**
   右上の「+」→ New repository
   - Repository name: `meeting-floor`
   - **Public** を選ぶ（Freeプランでは Public でないと Pages が使えません）
   - Create repository

4. **ファイルをアップロードする**
   「uploading an existing file」→「ファイルを選択」→ 保存したファイルを選ぶ
   - `index.html` / `manifest.webmanifest` / `sw.js` を上げる
   - `icons` フォルダの中身は、いったん全部上げてから
     ファイル名を `icons/icon-192.png` のように書き換えると同じ構造になります
   - Commit changes

5. **Pages を有効にする**
   Settings → Pages → Source を「Deploy from a branch」、Branch を `main` / `/(root)` → Save
   1〜2分で `https://<ユーザー名>.github.io/meeting-floor/` が発行されます

6. **発行されたURLを確認する**

   **保存したのと同じ画面（Settings → Pages）の一番上**に表示されます。
   保存直後はまだ出ないので、1〜2分待ってページを再読み込みしてください。

   | 表示 | 状態 |
   |---|---|
   | 何も出ない / “currently being built” | まだ公開処理中。待って再読み込み |
   | “Your site is ready to be published at …” | 公開直前。もう少し待つ |
   | **“Your site is live at https://…”** | 完了。右の「Visit site」で開ける |

   他にも次の場所から辿れます。

   - リポジトリのトップページ右側の **Deployments**（または Environments → `github-pages`）→ View deployment
   - **Actions** タブ → 「pages build and deployment」の実行結果

   URLは規則的なので、待たずに組み立てても構いません。

   ```
   https://<ユーザー名>.github.io/<リポジトリ名>/
   ```

   ユーザー名が `yokota`、リポジトリ名が `meeting-floor` なら
   `https://yokota.github.io/meeting-floor/` です。末尾のスラッシュを付けてください。

7. **ホーム画面に追加する**
   発行されたURLを **Safariで開く** → 共有ボタン →「ホーム画面に追加」

### URLが出ない・開いても404になるとき

| 症状 | 原因 | 対処 |
|---|---|---|
| Settings → Pages に何も出ない | Source が保存されていない | Branch を `main` / `/(root)` にして Save し直す |
| “upgrade” と表示される | リポジトリが Private | Public に変更する（Freeプランの制約） |
| URLは出るが 404 | `index.html` がリポジトリ直下にない | ファイルを直下へ移動する（下記参照） |
| 反映が古い | 公開処理の遅延 | 数分待つ。初回は10分以上かかることもある |

**最も多い失敗がこれです。** ZIPをフォルダごとアップロードすると、リポジトリの中が
`meeting-floor-app/index.html` という構造になり、直下に `index.html` がない状態になります。
この場合のURLは `https://<ユーザー名>.github.io/meeting-floor/meeting-floor-app/` です。

アップロード時は **フォルダごとではなく中身のファイルを** 上げてください。
リポジトリのトップに `index.html` が見えていれば正しい状態です。

### 注意

- リポジトリが Public なので、**ファイルの中身は誰でも見られます。**
  このアプリに秘密情報は含まれていないので実害はありませんが、
  APIキーは絶対に置かないでください（そもそもこの構成では不要です）。
- GitHub Pages は静的配信のみですが、**AI生成は使えます。**
  アプリのホーム画面にある「AI — フレーズ生成」でAPIキーを登録すると、
  ブラウザから直接Anthropic APIを呼びます（サーバー不要）。
  キーはこの端末の中だけに保存され、リポジトリにも学習データの書き出しにも含まれません。
  詳細は README の「AI生成を有効にする」を参照。
- サブディレクトリ配信（`/meeting-floor/`）でも、オフライン起動・アイコン・
  学習データの保存まで正常に動くことを検証済みです。

### GitHub 以外の同種の選択肢

GitLab Pages、Codeberg Pages、Firebase Hosting、Surge、Vercel なども無料枠があります。
どれも「アカウントを作ってファイルを置く」という点は同じです。

---

## B. ホスティングを使わない場合

### B-1. ファイルをそのまま開く（お手軽・ただし制限あり）

`index.html` を「ファイル」アプリに置いてタップすると、内容は表示されます。
ただし次の制限があります。

- **ホーム画面に追加できない**（URLが無いため）
- **学習データが保存されない可能性が高い**（プレビュー表示のため保存が保証されない）
- 録音は使えない（HTTPSが必要）

書き出し／読み込み機能があるので、毎回JSONで持ち運べば使えなくはありませんが、
毎日の学習用としては現実的ではありません。

### B-2. ショートカットでホーム画面にアイコンを置く

「ショートカット」アプリで、ファイルを開くショートカットを作り、
それをホーム画面に追加すればアイコンからは起動できます。
ただし中身は B-1 と同じで、**学習データの保存は保証されません。**

### B-3. iPhone上でローカルサーバーを動かす

`iSH` などのアプリでローカルサーバーを立て、`http://localhost:8080` を開けば
技術的にはPWAとして成立します（localhost は安全なコンテキスト扱いのため）。
ただしiOSはバックグラウンドのアプリを止めるので、サーバーが落ちるたびに
挙動が不安定になります。**常用は勧めません。**

### B-4. Mac + Xcode でネイティブアプリにする

Macがあるなら、WKWebViewにこのHTMLを同梱した実機ビルドが作れます。
ホスティングは不要で、ストア申請も不要です。

- 無料のApple IDでも実機インストールは可能ですが、**7日ごとに再署名が必要**
- 年間 99 USD の Apple Developer Program に入れば1年間有効

Macが手元にあり、外部サービスを一切使いたくない場合はこれが唯一の正攻法です。

---

## 選び方

| 条件 | 選択肢 |
|---|---|
| iPhoneだけで完結させたい | **A. GitHub Pages** |
| ファイルを公開したくない | B-4（Mac必須）／ または Cloudflare Pages のアクセス制限 |
| とりあえず中身を見たいだけ | B-1 |
| 毎日ちゃんと使いたい | **A 一択。** 学習データが確実に残るのはこれだけです |

学習履歴と復習スケジュールが消えない前提が崩れると、このアプリは意味を失います。
その1点だけで判断するなら、A を選んでください。
