/**
 * Telegram Botコマンドハンドラー
 * コマンドを受け取ってdata/user-config.jsonを更新する
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { config } from './config.js';

const CONFIG_FILE = './data/user-config.json';
const OFFSET_FILE = './data/bot-offset.json';

function loadUserConfig() {
  if (!existsSync(CONFIG_FILE)) {
    return { lat: config.MAP_LAT, lng: config.MAP_LNG, maxDistanceM: config.MAX_DISTANCE_M };
  }
  return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
}

function saveUserConfig(cfg) {
  writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
}

function loadOffset() {
  if (!existsSync(OFFSET_FILE)) return 0;
  try { return JSON.parse(readFileSync(OFFSET_FILE, 'utf-8')).offset || 0; } catch { return 0; }
}

function saveOffset(offset) {
  writeFileSync(OFFSET_FILE, JSON.stringify({ offset }), 'utf-8');
}

async function sendMessage(text) {
  await fetch(
    `https://api.telegram.org/bot${config.TELEGRAM_TOKEN}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: config.TELEGRAM_CHAT_ID, text }),
    }
  );
}

async function getUpdates(offset) {
  const res = await fetch(
    `https://api.telegram.org/bot${config.TELEGRAM_TOKEN}/getUpdates?offset=${offset}&timeout=0`
  );
  const data = await res.json();
  return data.ok ? data.result : [];
}

async function handleCommand(text) {
  const userCfg = loadUserConfig();
  const parts = text.trim().split(/\s+/);
  const cmd = parts[0].toLowerCase();

  if (cmd === '/status') {
    const excludes = userCfg.excludeSpots?.length
      ? userCfg.excludeSpots.join('\n  - ')
      : 'なし';
    await sendMessage(
      `現在の設定:\n` +
      `緯度: ${userCfg.lat}\n` +
      `経度: ${userCfg.lng}\n` +
      `範囲: ${userCfg.maxDistanceM}m\n` +
      `除外リスト:\n  - ${excludes}`
    );

  } else if (cmd === '/exclude') {
    const name = parts.slice(1).join(' ');
    if (!name) {
      await sendMessage('使い方: /exclude 店舗名\n例: /exclude ファミリーマート西巣鴨店');
      return false;
    }
    if (!userCfg.excludeSpots) userCfg.excludeSpots = [];
    if (userCfg.excludeSpots.includes(name)) {
      await sendMessage(`「${name}」はすでに除外リストに入っています。`);
      return false;
    }
    userCfg.excludeSpots.push(name);
    saveUserConfig(userCfg);
    await sendMessage(`「${name}」を除外リストに追加しました。`);
    return true;

  } else if (cmd === '/unexclude') {
    const name = parts.slice(1).join(' ');
    if (!name) {
      await sendMessage('使い方: /unexclude 店舗名\n例: /unexclude ファミリーマート西巣鴨店');
      return false;
    }
    if (!userCfg.excludeSpots || !userCfg.excludeSpots.includes(name)) {
      await sendMessage(`「${name}」は除外リストにありません。`);
      return false;
    }
    userCfg.excludeSpots = userCfg.excludeSpots.filter(s => s !== name);
    saveUserConfig(userCfg);
    await sendMessage(`「${name}」を除外リストから削除しました。`);
    return true;

  } else if (cmd === '/excludelist') {
    const list = userCfg.excludeSpots?.length
      ? userCfg.excludeSpots.map((s, i) => `${i + 1}. ${s}`).join('\n')
      : '除外リストは空です。';
    await sendMessage(`除外リスト:\n${list}`);

  } else if (cmd === '/setlocation') {
    if (parts.length < 3) {
      await sendMessage('使い方: /setlocation 緯度 経度\n例: /setlocation 35.742734 139.722086');
      return false;
    }
    const lat = parseFloat(parts[1]);
    const lng = parseFloat(parts[2]);
    if (isNaN(lat) || isNaN(lng)) {
      await sendMessage('緯度・経度は数値で入力してください。');
      return false;
    }
    userCfg.lat = String(lat);
    userCfg.lng = String(lng);
    saveUserConfig(userCfg);
    await sendMessage(`エリアを変更しました:\n緯度: ${lat}\n経度: ${lng}`);
    return true;

  } else if (cmd === '/setrange') {
    if (parts.length < 2) {
      await sendMessage('使い方: /setrange メートル数\n例: /setrange 1000');
      return false;
    }
    const m = parseInt(parts[1]);
    if (isNaN(m) || m <= 0) {
      await sendMessage('範囲は正の整数で入力してください。');
      return false;
    }
    userCfg.maxDistanceM = m;
    saveUserConfig(userCfg);
    await sendMessage(`範囲を${m}mに変更しました。`);
    return true;

  } else if (cmd === '/help') {
    await sendMessage(
      'SPOTJOBSモニター コマンド一覧:\n\n' +
      '/status — 現在の設定を確認\n' +
      '/setlocation 緯度 経度 — エリアを変更\n' +
      '/setrange メートル数 — 監視範囲を変更\n' +
      '/exclude 店舗名 — 店舗を除外\n' +
      '/unexclude 店舗名 — 除外を解除\n' +
      '/excludelist — 除外リスト確認\n' +
      '/help — このヘルプを表示'
    );
  }

  return false;
}

async function main() {
  if (!config.TELEGRAM_TOKEN || !config.TELEGRAM_CHAT_ID) {
    console.log('[bot] TELEGRAM設定がありません。スキップします。');
    return;
  }

  let offset = loadOffset();
  const updates = await getUpdates(offset);

  if (updates.length === 0) {
    console.log('[bot] 新しいコマンドはありません。');
    return;
  }

  let changed = false;
  for (const update of updates) {
    offset = update.update_id + 1;
    const text = update.message?.text;
    if (text && text.startsWith('/')) {
      console.log(`[bot] コマンド受信: ${text}`);
      const updated = await handleCommand(text);
      if (updated) changed = true;
    }
  }

  saveOffset(offset);

  if (changed) {
    console.log('[bot] 設定を更新しました。');
  }
}

main().catch(err => {
  console.error('[bot error]', err.message);
  process.exit(1);
});
