// Gmail でメール通知を送信するモジュール

import nodemailer from 'nodemailer';
import { config } from './config.js';

/**
 * 新着ジョブの通知メールを送信する
 * @param {Array} newJobs - 新着ジョブの配列 { workId, address, workType, reward, url }
 */
export async function sendMail(newJobs) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: config.MAIL_USER,
      pass: config.MAIL_PASS,
    },
  });

  // ジョブ一覧を整形
  const jobLines = newJobs.map((j, i) =>
    [
      `【${i + 1}】${j.spotName}`,
      `  作業: ${j.workType}`,
      `  報酬: ${j.reward.toLocaleString()}円`,
      `  距離: ${j.distance}m`,
      `  URL : ${j.url}`,
    ].join('\n')
  ).join('\n\n');

  const body = [
    '新しいジョブが見つかりました。',
    '',
    `件数: ${newJobs.length}件`,
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━',
    jobLines,
    '━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    `取得日時: ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`,
  ].join('\n');

  await transporter.sendMail({
    from:    config.MAIL_USER,
    to:      config.MAIL_TO,
    subject: `SPOTJOBS 新着ジョブ（${newJobs.length}件）`,
    text:    body,
  });

  console.log(`[mail] 通知メールを送信しました (${newJobs.length}件) -> ${config.MAIL_TO}`);
}
