// Telegram でメッセージ通知を送信するモジュール

import { config } from './config.js';

export async function sendTelegram(newJobs) {
  const jobLines = newJobs.map((j, i) =>
    [
      `【${i + 1}】${j.spotName}`,
      `  作業: ${j.workType}`,
      `  報酬: ${j.reward.toLocaleString()}円`,
      `  距離: ${j.distance}m`,
      `  URL: ${j.url}`,
    ].join('\n')
  ).join('\n\n');

  const text = [
    `🔔 SPOTJOBS 新着ジョブ（${newJobs.length}件）`,
    '',
    jobLines,
    '',
    `取得日時: ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`,
  ].join('\n');

  const res = await fetch(
    `https://api.telegram.org/bot${config.TELEGRAM_TOKEN}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.TELEGRAM_CHAT_ID,
        text,
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Telegram送信失敗: ${res.status} ${err}`);
  }

  console.log(`[telegram] 通知を送信しました (${newJobs.length}件)`);
}
