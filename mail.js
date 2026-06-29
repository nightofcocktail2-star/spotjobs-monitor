// Gmail でメール通知を送信するモジュール
// nodemailer を使用。MAIL_PASS には Gmail の「アプリパスワード」を設定する。

import nodemailer from 'nodemailer';
import { config } from './config.js';

/**
 * 新着ジョブの通知メールを送信する
 * @param {string[]} newJobUrls - 新着ジョブのURL一覧
 */
export async function sendMail(newJobUrls) {
  // Gmail SMTP の設定
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: config.MAIL_USER,
      pass: config.MAIL_PASS,  // Gmailのアプリパスワード（16文字）
    },
  });

  // メール本文を組み立てる
  const urlList = newJobUrls.map((url, i) => `${i + 1}. ${url}`).join('\n');
  const body = [
    '新しいジョブが見つかりました。',
    '',
    'ジョブ一覧',
    '',
    urlList,
    '',
    `取得日時: ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`,
  ].join('\n');

  const mailOptions = {
    from: config.MAIL_USER,
    to:   config.MAIL_TO,
    subject: 'SPOTJOBS 新着ジョブ',
    text: body,
  };

  await transporter.sendMail(mailOptions);
  console.log(`[mail] 通知メールを送信しました (${newJobUrls.length}件) -> ${config.MAIL_TO}`);
}
