/**
 * SPOTJOBS 新着ジョブ監視スクリプト
 *
 * 動作フロー:
 * 1. SPOT.JOBS にログイン（Playwright）
 * 2. マップAPIからジョブ一覧を取得（workId の配列）
 * 3. 前回保存した data/jobs.json と比較
 * 4. 新着ジョブがあればメール通知
 * 5. 最新のジョブ一覧を data/jobs.json に保存
 */

import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { sendMail } from './mail.js';
import { config, validateConfig } from './config.js';

// ES Modules では __dirname が使えないため代替
const __dirname = dirname(fileURLToPath(import.meta.url));

// =============================================
// ジョブデータの保存・読み込み
// =============================================

/** 保存済みジョブIDを読み込む。ファイルがなければ null を返す（初回判定に使用）。 */
function loadSavedJobIds() {
  if (!existsSync(config.JOBS_FILE)) return null;
  try {
    const raw = readFileSync(config.JOBS_FILE, 'utf-8');
    const data = JSON.parse(raw);
    return Array.isArray(data.workIds) ? data.workIds : null;
  } catch (e) {
    console.error('[storage] jobs.json の読み込みエラー:', e.message);
    return null;
  }
}

/** ジョブIDの一覧を data/jobs.json に保存する */
function saveJobIds(workIds) {
  // data/ ディレクトリがなければ作成
  const dir = dirname(config.JOBS_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const payload = {
    workIds,
    updatedAt: new Date().toISOString(),
    count: workIds.length,
  };
  writeFileSync(config.JOBS_FILE, JSON.stringify(payload, null, 2), 'utf-8');
  console.log(`[storage] ${workIds.length}件を ${config.JOBS_FILE} に保存しました`);
}

// =============================================
// Playwright: ログイン処理
// =============================================

/**
 * SPOT.JOBS にログインする
 * @param {import('playwright').Page} page
 */
async function login(page) {
  console.log('[browser] ログインページを開きます...');

  // オンボーディングページへ遷移
  await page.goto('https://app.spot.jobs/on-boarding', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // 「ログイン」ボタンをクリック
  await page.getByText('ログイン', { exact: true }).first().click();
  await page.waitForTimeout(2000);

  // メールアドレス入力欄が現れるまで待機
  await page.waitForSelector('input[type="email"], input[type="text"]', { timeout: 15000 });

  // メールアドレスとパスワードを入力
  const emailInput = page.locator('input[type="email"]').first();
  const passInput  = page.locator('input[type="password"]').first();

  await emailInput.fill(config.SPOT_EMAIL);
  await passInput.fill(config.SPOT_PASS);

  // ログインボタンを押す
  await page.locator('button[type="submit"]').first().click();

  // ログイン完了を待つ（ホームかマップページへリダイレクトされる）
  await page.waitForURL(/\/(map|home|\?|$)/, { timeout: 30000 }).catch(() => {
    console.warn('[browser] ログイン後のURL変化を検出できませんでした。続行します。');
  });

  console.log('[browser] ログイン完了:', page.url());
}

// =============================================
// Playwright: ジョブ一覧取得
// =============================================

/**
 * マップページを開き、SPOTJOBSのAPIからジョブ一覧を取得する
 * @param {import('playwright').Page} page
 * @returns {Promise<string[]>} workId の配列
 */
async function fetchJobs(page) {
  const mapUrl = `https://app.spot.jobs/map?center=${config.MAP_LAT},${config.MAP_LNG}&span=${config.MAP_SPAN}`;

  console.log('[browser] マップページを開きます...');

  // APIレスポンスを受け取る Promise をページ遷移前に設定する
  // （遷移後に設定するとAPIコールを逃す可能性があるため）
  const apiResponsePromise = page.waitForResponse(
    (resp) =>
      resp.url().includes('spotjobs-api.spotapi.jp/api/v1/work') &&
      !resp.url().includes('/api/v1/work/') &&  // 個別ジョブ詳細は除外
      resp.status() === 200,
    { timeout: 40000 }
  );

  // マップページへ遷移
  await page.goto(mapUrl, { waitUntil: 'domcontentloaded' });

  // APIレスポンスを待機
  const apiResponse = await apiResponsePromise;
  const jobs = await apiResponse.json();

  if (!Array.isArray(jobs)) {
    throw new Error(`APIレスポンスが配列ではありません: ${JSON.stringify(jobs).slice(0, 200)}`);
  }

  console.log(`[api] ${jobs.length}件のジョブを取得しました`);
  return jobs.map((job) => String(job.workId));
}

// =============================================
// ジョブURLの生成
// =============================================

/**
 * workId からジョブの閲覧URLを生成する
 * @param {string} workId
 * @returns {string}
 */
function buildJobUrl(workId) {
  return (
    `https://app.spot.jobs/map` +
    `?center=${config.MAP_LAT},${config.MAP_LNG}` +
    `&span=${config.MAP_SPAN}` +
    `&currentWorkId=${workId}`
  );
}

// =============================================
// メイン処理
// =============================================

async function main() {
  console.log('====================================');
  console.log(' SPOTJOBS 監視スクリプト 開始');
  console.log(`  実行日時: ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`);
  console.log('====================================');

  // 環境変数チェック
  try {
    validateConfig();
  } catch (e) {
    console.error('[config] エラー:', e.message);
    console.error('[config] .env ファイルまたは環境変数を確認してください');
    process.exit(1);
  }

  // 前回のジョブ一覧を読み込む
  const savedIds = loadSavedJobIds();
  const isFirstRun = savedIds === null;

  if (isFirstRun) {
    console.log('[storage] 初回実行です。今回は通知せずジョブ一覧を保存します。');
  } else {
    console.log(`[storage] 前回保存: ${savedIds.length}件`);
  }

  // Playwright ブラウザを起動
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',           // Linux コンテナ（Render）で必要
      '--disable-dev-shm-usage', // メモリ不足対策
      '--disable-gpu',           // GPU不要
      '--disable-extensions',
    ],
  });

  try {
    const context = await browser.newContext({
      // スマートフォン表示を避ける（PC版UIの方が安定）
      viewport: { width: 1280, height: 800 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
        'AppleWebKit/537.36 (KHTML, like Gecko) ' +
        'Chrome/124.0.0.0 Safari/537.36',
    });

    const page = await context.newPage();

    // ログイン
    await login(page);

    // ジョブ一覧を取得
    const currentIds = await fetchJobs(page);

    // ジョブ一覧を保存（次回比較用）
    saveJobIds(currentIds);

    // 初回実行は通知しない
    if (isFirstRun) {
      console.log('[done] 初回実行完了。次回から新着ジョブを検知します。');
      return;
    }

    // 新着ジョブを検出（前回一覧にないIDを抽出）
    const newIds = currentIds.filter((id) => !savedIds.includes(id));

    if (newIds.length === 0) {
      console.log('[done] 新着ジョブはありません。');
      return;
    }

    console.log(`[notify] 新着ジョブ ${newIds.length}件 を検出しました`);

    // 新着ジョブのURLを生成
    const newJobUrls = newIds.map(buildJobUrl);

    // メール通知を送信
    await sendMail(newJobUrls);

    console.log('[done] 処理完了。');
  } catch (err) {
    // エラーは終了せずログ出力（Cron Job が止まらないように）
    console.error('[error] 予期しないエラーが発生しました:', err.message);
    console.error(err.stack);
  } finally {
    await browser.close();
  }
}

// エントリポイント
main().catch((err) => {
  console.error('[fatal] 致命的なエラー:', err.message);
  process.exit(1);
});
