# SPOTJOBS 新着ジョブ監視システム

板橋駅付近に新しいジョブが掲載されたら Gmail でお知らせします。

---

## 仕組み

1. Playwright でブラウザを起動し SPOT.JOBS にログイン
2. マップAPIからジョブID一覧（`workId`）を取得
3. `data/jobs.json` に保存された前回の一覧と比較
4. 新着ジョブがあれば Gmail で通知
5. 最新の一覧を `data/jobs.json` に保存

初回実行時は通知せず、一覧を保存するだけです。  
2回目以降から新着を検知・通知します。

---

## 事前準備

### 必要なもの

- **SPOT.JOBS アカウント**（メールアドレス・パスワード）
- **Gmail アカウント** + **アプリパスワード**（後述）
- **GitHub アカウント**（推奨）または **Render アカウント**

### Gmail アプリパスワードの取得方法

通常の Gmail パスワードではなく「アプリパスワード」が必要です。

1. [Google アカウント](https://myaccount.google.com/) にアクセス
2. **セキュリティ** タブを開く
3. **2段階認証** を有効にする（済みの場合はスキップ）
4. **アプリパスワード** を選択
5. アプリ名（例: `spotjobs-monitor`）を入力して **作成**
6. 表示される 16 文字のパスワードをコピー（スペースを除いてもOK）

---

## 推奨デプロイ方法：GitHub Actions（完全無料）

Render の無料プランはファイルシステムが実行ごとにリセットされるため、  
`data/jobs.json` が消えて比較できません。  
**GitHub Actions を使う方法が完全無料で最も安定します。**

### ① GitHub へ Push

```bash
cd spotjobs-monitor
git init
git add .
git commit -m "first commit"

# GitHub でリポジトリを作成後（Public 推奨）
git remote add origin https://github.com/あなたのユーザー名/spotjobs-monitor.git
git branch -M main
git push -u origin main
```

> **注意**: `.env` ファイルは `.gitignore` に含まれているのでコミットされません。  
> `data/jobs.json` はコミットされます（空のファイルが初期値）。

### ② GitHub Secrets に環境変数を設定

リポジトリの **Settings > Secrets and variables > Actions > New repository secret** で以下を登録：

| Secret 名    | 値 |
|-------------|---|
| `SPOT_EMAIL` | SPOT.JOBS のメールアドレス |
| `SPOT_PASS`  | SPOT.JOBS のパスワード |
| `MAIL_USER`  | 送信元 Gmail アドレス |
| `MAIL_PASS`  | Gmail のアプリパスワード（16文字） |
| `MAIL_TO`    | 通知先メールアドレス |

### ③ Actions を有効化

1. リポジトリの **Actions** タブを開く
2. ワークフローが表示されていれば有効です
3. **Run workflow** ボタンで手動実行してテストできます

### ④ 動作確認

手動実行して以下を確認してください：

- Actions ログにエラーがないこと
- `data/jobs.json` が更新されてコミットされること（初回実行）
- 2回目の手動実行でメールが届くこと（新着がなければ届かない）

以降は 10 分ごとに自動実行されます。

---

## Render でのデプロイ方法

> ⚠️ **重要な制限事項**  
> Render の無料プランでは Cron Job 実行ごとにファイルシステムがリセットされます。  
> そのため `data/jobs.json` が毎回消え、常に「初回実行」扱いになります。  
> **新着ジョブの検知・通知は機能しません。**  
>
> Render で動かしたい場合は **Persistent Disk**（月 $0.25/GB〜）が必要です。  
> 完全無料で動かすには **GitHub Actions を推奨します。**

Render を使う場合の手順（Persistent Disk ありの前提）：

### ① GitHub へ Push（上記と同様）

### ② Render へデプロイ

1. [Render](https://render.com/) にサインアップ
2. **New > Cron Job** を選択
3. GitHub リポジトリを連携
4. 以下を設定：

| 項目 | 値 |
|------|---|
| Name | `spotjobs-monitor` |
| Runtime | `Node` |
| Build Command | `npm install && npx playwright install chromium --with-deps` |
| Start Command | `node index.js` |
| Schedule | `*/10 * * * *` |

### ③ 環境変数を設定

Render の **Environment** タブで以下を設定：

| 変数名 | 値 |
|--------|---|
| `SPOT_EMAIL` | SPOT.JOBS のメールアドレス |
| `SPOT_PASS` | SPOT.JOBS のパスワード |
| `MAIL_USER` | 送信元 Gmail アドレス |
| `MAIL_PASS` | Gmail のアプリパスワード |
| `MAIL_TO` | 通知先メールアドレス |

### ④ Persistent Disk を追加

1. サービスの **Disks** タブを開く
2. **Add Disk** をクリック
3. Mount Path: `/opt/render/project/src/data`
4. Size: 1 GB（最小）

### ⑤ 動作確認

Cron Job を手動トリガーして Logs を確認してください。

---

## ローカルでテスト実行

```bash
# 1. パッケージをインストール
npm install

# 2. Playwright ブラウザをインストール
npx playwright install chromium

# 3. 環境変数ファイルを作成
cp .env.example .env
# .env を編集して各値を設定

# 4. 実行（dotenv が必要な場合）
node --env-file=.env index.js
```

---

## ファイル構成

```
spotjobs-monitor/
├── .github/
│   └── workflows/
│       └── monitor.yml   # GitHub Actions ワークフロー（推奨）
├── data/
│   └── jobs.json          # 前回取得したジョブID一覧（自動更新）
├── .env.example           # 環境変数のテンプレート
├── .gitignore
├── config.js              # 設定・環境変数の管理
├── index.js               # メインスクリプト
├── mail.js                # Gmail 通知
├── package.json
├── README.md
└── render.yaml            # Render デプロイ設定
```

---

## よくあるトラブル

**ログインに失敗する**  
→ SPOT_EMAIL / SPOT_PASS が正しいか確認してください。  
→ SPOT.JOBS 側でログインに成功することをブラウザで確認してください。

**メールが届かない**  
→ MAIL_PASS が通常パスワードになっていないか確認してください（アプリパスワードが必要）。  
→ Gmail の「安全性の低いアプリのアクセス」ではなく、必ずアプリパスワードを使用してください。

**GitHub Actions が動かない**  
→ Secrets の名前にタイポがないか確認してください（大文字・小文字が一致しているか）。  
→ Actions タブでワークフローが有効になっているか確認してください。

**毎回メールが届く（Render 使用時）**  
→ Render 無料プランはファイルシステムが消えるため、常に初回扱いになります。  
→ GitHub Actions に移行してください（このリポジトリは対応済みです）。
