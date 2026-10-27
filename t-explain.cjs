const { chromium } = require('playwright');
const path = require('path');
const FILE = 'file://' + path.resolve(__dirname, 'test.html');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  FAIL: ' + m); } };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [], apiCalls = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('request', r => { const u = r.url(); if (!u.startsWith('file:')) apiCalls.push(u); });

  await page.goto(FILE);
  await page.waitForTimeout(700);

  console.log('--- 1) 起動とデータ ---');
  ok(errors.length === 0, 'JSエラー: ' + errors.join(' | '));
  const n = await page.evaluate(() => Object.keys(XDB_DATA).length);
  ok(n === 300, '内蔵解説件数 = ' + n);
  const idxOk = await page.evaluate(() => {
    const byId = xdbById();
    return Object.keys(XDB_DATA).every(k => byId[builtinPhraseId(k)] === XDB_DATA[k]);
  });
  ok(idxOk, 'ID索引が1対1で対応していない');

  console.log('--- 2) グループを開いてカードを出す ---');
  await page.selectOption('#groupSelect', 'conclusion');
  await page.click('#btnOpenGroup');
  await page.waitForTimeout(400);
  const cards = await page.locator('#cardGrid .card').count();
  ok(cards === 19, 'カード数 = ' + cards);

  console.log('--- 3) 既存ボタンが全部残っている ---');
  const labels = await page.locator('#cardGrid .card').nth(0).locator('.acts .iconbtn .lbl').allTextContents();
  ['読み上げ','覚えた','復習','お気に入り','録音','使い方を見る','詳細解説'].forEach(l => {
    ok(labels.includes(l), 'ボタンが無い: ' + l);
  });
  ok(labels.length === 7, 'ボタン数 = ' + labels.length);

  console.log('--- 4) 詳細解説を開く ---');
  const before = await page.evaluate(() => JSON.stringify(Object.values(State.phrases).map(p => p.progress)));
  const apiBefore = apiCalls.length;
  await page.locator('#cardGrid .card').nth(0).locator('.acts .iconbtn.deep').click();
  await page.waitForTimeout(500);
  ok(await page.locator('#xp.open').count() === 1, '解説画面が開かない');
  ok(await page.locator('#xpTitle').textContent() === '詳細解説', 'タイトルが違う');
  const en = await page.locator('#xpBody .xp-en').textContent();
  ok(en === 'Let me start with the bottom line.', '英文が違う: ' + en);
  const secs = await page.locator('#xpBody .xp-sec').count();
  ok(secs === 7, 'セクション数 = ' + secs);
  const heads = await page.locator('#xpBody .xp-sec > h3').allTextContents();
  ok(heads[0].includes('自然な日本語訳'), '①の見出し: ' + heads[0]);
  ok(heads[6].includes('学習の要点'), '⑦の見出し: ' + heads[6]);
  ok(await page.locator('#xpBody .xp-table').count() === 1, '比較表が無い');
  ok(await page.locator('#xpBody .xp-pat').count() >= 1, '応用テンプレートが無い');
  ok(await page.locator('#xpBody .xp-pat .frame b').count() >= 1, '置換部分が強調されていない');
  ok(await page.locator('#xpJump button').count() === 7, 'ジャンプボタン数 = ' + await page.locator('#xpJump button').count());

  console.log('--- 5) 閲覧でAPIを呼ばない・学習状態を変えない ---');
  ok(apiCalls.length === apiBefore, '通信が発生: ' + apiCalls.slice(apiBefore).join(','));
  const after = await page.evaluate(() => JSON.stringify(Object.values(State.phrases).map(p => p.progress)));
  ok(before === after, '学習状態が変わった');

  console.log('--- 6) スクロールと横あふれ ---');
  const m = await page.evaluate(() => {
    const b = document.getElementById('xpBody');
    b.scrollTop = 10000;
    return { sh: b.scrollHeight, ch: b.clientHeight, top: b.scrollTop,
             docW: document.documentElement.scrollWidth, win: window.innerWidth };
  });
  ok(m.sh > m.ch, '縦スクロールできない (sh=' + m.sh + ' ch=' + m.ch + ')');
  ok(m.top > 0, 'スクロールが動かない');
  ok(m.docW <= m.win + 1, '横にあふれている docW=' + m.docW + ' win=' + m.win);

  console.log('--- 7) ジャンプと戻る ---');
  await page.locator('#xpJump button').nth(4).click();
  await page.waitForTimeout(500);
  const jumped = await page.evaluate(() => document.getElementById('xpBody').scrollTop);
  ok(jumped > 0, 'ジャンプで移動しない');
  await page.click('#xpBack');
  await page.waitForTimeout(400);
  ok(await page.locator('#xp.open').count() === 0, '戻るで閉じない');
  ok(await page.locator('#cardGrid .card').count() === 19, '戻ったらカードが消えた');

  console.log('--- 8) Escape で閉じる ---');
  await page.locator('#cardGrid .card').nth(2).locator('.acts .iconbtn.deep').click();
  await page.waitForTimeout(350);
  ok(await page.locator('#xp.open').count() === 1, '2回目が開かない');
  const en2 = await page.locator('#xpBody .xp-en').textContent();
  ok(en2.startsWith('Based on the data'), '3枚目の英文が違う: ' + en2);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(350);
  ok(await page.locator('#xp.open').count() === 0, 'Escapeで閉じない');

  console.log('--- 9) 設定画面の件数表示 ---');
  await page.evaluate(() => selectScreen('settings'));
  await page.waitForTimeout(300);
  const kv = await page.locator('#xpStat dt').allTextContents();
  ok(kv.includes('内蔵解説') && kv.includes('未作成'), '件数表示が無い: ' + kv.join(','));
  const vals = await page.locator('#xpStat dd').allTextContents();
  ok(vals[0] === '300件', '内蔵解説の件数: ' + vals[0]);

  console.log('--- 10) 既存機能の非破壊 ---');
  await page.evaluate(() => selectScreen('cards'));
  await page.waitForTimeout(300);
  await page.locator('#cardGrid .card').nth(0).locator('.acts .iconbtn.good').click();
  await page.waitForTimeout(200);
  ok(await page.evaluate(() => Object.values(State.phrases).filter(p => p.progress.mastered).length) === 1, '覚えたが記録されない');
  await page.locator('#cardGrid .card').nth(1).locator('.acts .iconbtn').nth(5).click();
  await page.waitForTimeout(200);
  ok(await page.locator('#cardGrid .card').nth(1).locator('.detail:not(.hide)').count() === 1, '使い方を見るが開かない');
  await page.evaluate(() => selectScreen('quiz'));
  await page.waitForTimeout(250);
  ok(await page.locator('#quizSetup:not(.hide)').count() === 1, '瞬発テストの範囲選択が出ない');
  await page.evaluate(() => selectScreen('mastered'));
  await page.waitForTimeout(250);
  ok(await page.locator('#player').count() === 1, '連続再生プレーヤーが無い');

  ok(errors.length === 0, '最終的なJSエラー: ' + errors.join(' | '));
  await browser.close();
  console.log('\n==== PASS ' + pass + ' / FAIL ' + fail + ' ====');
  process.exit(fail ? 1 : 0);
})();
