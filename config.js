// 環境変数と定数の管理

export const config = {
  // Firebase認証（リフレッシュトークンでIDトークンを取得）
  FIREBASE_API_KEY:       'AIzaSyBHcAHwfuZbPT5a2sY15yVVBkH5ZyNU67k',  // 公開情報
  FIREBASE_REFRESH_TOKEN: process.env.FIREBASE_REFRESH_TOKEN || '',

  // Gmail 通知設定
  MAIL_USER: process.env.MAIL_USER || '',
  MAIL_PASS: process.env.MAIL_PASS || '',
  MAIL_TO:   process.env.MAIL_TO   || '',

  // 監視エリア（北区滝野川7丁目-30-9 付近）
  MAP_LAT:  '35.742734',
  MAP_LNG:  '139.722086',
  MAP_SPAN: '0.012430,0.011466',

  // SPOTJOBS API
  SPOTJOBS_API: 'https://spotjobs-api.spotapi.jp/api/v1/work',
  PAGE_SIZE:    '100',

  // 保存先
  JOBS_FILE: './data/jobs.json',
};

export function validateConfig() {
  const required = ['FIREBASE_REFRESH_TOKEN', 'MAIL_USER', 'MAIL_PASS', 'MAIL_TO'];
  const missing = required.filter(k => !config[k]);
  if (missing.length > 0) {
    throw new Error(`環境変数が設定されていません: ${missing.join(', ')}`);
  }
}
