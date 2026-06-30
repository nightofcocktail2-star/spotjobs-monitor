/**
 * SPOTJOBS 新着ジョブ監視スクリプト（ブラウザ不要版）
 *
 * 動作フロー:
 * 1. Firebase リフレッシュトークン → IDトークンを取得
 * 2. IDトークンで SPOTJOBS API を直接呼び出し → ジョブ一覧取得
 * 3. 前回保存した data/jobs.json と比較
 * 4. 新着ジョブがあればメール通知
 * 5. 最新のジョブ一覧を data/jobs.json に保存
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { sendMail } from './mail.js';
import { config, validateConfig } from './config.js';

// =============================================
// Firebase: IDトークンの取得
// =============================================

/**
 * リフレッシュトークンを使って新しい Firebase IDトークンを取得する
 * IDトークンは1時間で期限切れになるが、リフレッシュトークンで何度でも更新できる
 */
async function getFirebaseIdToken() {
  const url = `https://securetoken.googleapis.com/v1/token?key=${config.FIREBASE_API_KEY}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type:    'refresh_token',
      refresh_token: config.FIREBASE_REFRESH_TOKEN,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Firebase認証失敗: ${res.status} ${err}`);
  }

  const data = await res.json();
  console.log('[auth] Firebaseトークン取得成功');
  return data.id_token;
}

// =============================================
// SPOTJOBS API: ジョブ一覧の取得
// =============================================

/**
 * SPOTJOBS API からジョブ一覧を取得する（ブラウザ不要）
 * @param {string} idToken - Firebase IDトークン
 * @returns {Promise<string[]>} workId の配列
 */
async function fetchJobs(idToken) {
  const url = new URL(config.SPOTJOBS_API);
  url.searchParams.set('lat',       config.MAP_LAT);
  url.searchParams.set('lng',       config.MAP_LNG);
  url.searchParams.set('pageNum',   '1');
  url.searchParams.set('pageSize',  config.PAGE_SIZE);
  url.searchParams.set('workTypes', 'BATTERY_INSERT,BATTERY_EJECT,SPOT_REQUEST_COLLECT,BATTERY_RETURN');
  url.searchParams.set('sortType',  'REWARD');

  const res = await fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${idToken}`,
      'Content-Type':  'application/json',
    },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`SPOTJOBS API エラー: ${res.status} ${err.slice(0, 200)}`);
  }

  const jobs = await res.json();

  if (!Array.isArray(jobs)) {
    throw new Error(`APIレスポンスが不正: ${JSON.stringify(jobs).slice(0, 200)}`);
  }

  console.log(`[api] ${jobs.length}件のジョブを取得しました`);
  return jobs.map(j => String(j.workId));
}

// =============================================
// ジョブデータの保存・読み込み
// =============================================

function loadSavedJobIds() {
  if (!existsSync(config.JOBS_FILE)) return null;
  try {
    const data = JSON.parse(readFileSync(config.JOBS_FILE, 'utf-8'));
    return Array.isArray(data.workIds) ? data.workIds : null;
  } catch {
    return null;
  }
}

function saveJobIds(workIds) {
  const dir = dirname(config.JOBS_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(
    config.JOBS_FILE,
    JSON.stringify({ workIds, updatedAt: new Date().toISOString(), count: workIds.length }, null, 2),
    'utf-8'
  );
  console.log(`[storage] ${workIds.length}件を保存しました`);
}

// =============================================
// ジョブURL生成
// =============================================

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
  console.log(`  ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`);
  console.log('====================================');

  try {
    validateConfig();
  } catch (e) {
    console.error('[config] エラー:', e.message);
    process.exit(1);
  }

  // 前回の保存データを読み込む
  const savedIds  = loadSavedJobIds();
  const isFirstRun = savedIds === null;
  if (isFirstRun) {
    console.log('[storage] 初回実行 → 今回は通知せず保存のみ');
  } else {
    console.log(`[storage] 前回保存: ${savedIds.length}件`);
  }

  try {
    // Firebase IDトークンを取得
    const idToken = await getFirebaseIdToken();

    // SPOTJOBS APIからジョブ一覧を取得
    const currentIds = await fetchJobs(idToken);

    // 保存
    saveJobIds(currentIds);

    // 初回は通知しない
    if (isFirstRun) {
      console.log('[done] 初回完了。次回から新着を検知します。');
      return;
    }

    // 新着ジョブを抽出
    const newIds = currentIds.filter(id => !savedIds.includes(id));

    if (newIds.length === 0) {
      console.log('[done] 新着ジョブはありません。');
      return;
    }

    console.log(`[notify] 新着 ${newIds.length}件 を検出`);
    await sendMail(newIds.map(buildJobUrl));
    console.log('[done] 通知完了。');

  } catch (err) {
    // エラーは終了せずログ出力
    console.error('[error]', err.message);
  }
}

main().catch(err => {
  console.error('[fatal]', err.message);
  process.exit(1);
});
