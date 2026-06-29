// 環境変数をまとめて管理するファイル
// .env ファイルまたは Render / GitHub Actions の環境変数から読み込む

export const config = {
  // SPOT.JOBS アカウント情報
  SPOT_EMAIL: process.env.SPOT_EMAIL || '',
  SPOT_PASS:  process.env.SPOT_PASS  || '',

  // Gmail 通知設定
  MAIL_USER: process.env.MAIL_USER || '',
  MAIL_PASS: process.env.MAIL_PASS || '',
  MAIL_TO:   process.env.MAIL_TO   || '',

  // 監視エリア（板橋駅付近）
  MAP_LAT:  '35.756430',
  MAP_LNG:  '139.709162',
  MAP_SPAN: '0.012430,0.011466',

  // API設定
  API_BASE:      'https://spotjobs-api.spotapi.jp',
  API_PAGE_SIZE: '100',  // 一度に取得する最大件数

  // 保存先ファイル
  JOBS_FILE: './data/jobs.json',
};

// 必須環境変数のチェック
export function validateConfig() {
  const required = ['SPOT_EMAIL', 'SPOT_PASS', 'MAIL_USER', 'MAIL_PASS', 'MAIL_TO'];
  const missing = required.filter(key => !config[key]);
  if (missing.length > 0) {
    throw new Error(`環境変数が設定されていません: ${missing.join(', ')}`);
  }
}
