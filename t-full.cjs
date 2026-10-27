const { chromium } = require('playwright');
const path = require('path');
const FILE = 'file://' + path.resolve(__dirname, 'test.html');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL: ' + m); } };
const H = (s) => console.log('\n--- ' + s + ' ---');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [], net = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('request', r => { const u = r.url(); if (!u.startsWith('file:')) net.push(u); });

  await page.goto(FILE);
  await page.waitForTimeout(900);

  H('A データテスト（仕様書 10節）');
  ok(errors.length === 0, 'JSエラー: ' + errors.join(' | '));
  const d = await page.evaluate(() => {
    const keys = Object.keys(XDB_DATA);
    const byId = xdbById();
    const req = XDB_REQUIRED;
    let missing = 0, badPair = 0, badPat = 0, noN = 0;
    keys.forEach(k => {
      const r = XDB_DATA[k];
      if (explainMissing(r).length) missing++;
      if (!r.n || !r.n.length) noN++;
      ['s','v','n','e'].forEach(s => (r[s] || []).forEach(row => {
        if (!Array.isArray(row) || row.length !== 2 || typeof row[0] !== 'string' || typeof row[1] !== 'string') badPair++;
      }));
      (r.p || []).forEach(row => {
        if (!Array.isArray(row) || typeof row[0] !== 'string' || !Array.isArray(row[1])) badPat++;
      });
    });
    const idsOk = keys.every(k => byId[builtinPhraseId(k)] === XDB_DATA[k]);
    const bank = []; BANK.forEach(c => c.items.forEach(it => bank.push(it[0])));
    const covered = bank.filter(e => !!XDB_DATA[norm(e)]).length;
    const ts = keys.map(k => XDB_DATA[k].t);
    const dupT = ts.length - new Set(ts).size;
    return { n: keys.length, missing, badPair, badPat, noN, idsOk, bank: bank.length, covered, dupT,
             ver: XDB_VERSION, reqLen: req.length };
  });
  ok(d.n === 300, '内蔵解説件数 = ' + d.n);
  ok(d.bank === 300, '内蔵フレーズ件数 = ' + d.bank);
  ok(d.covered === 300, '解説が登録済みのフレーズ = ' + d.covered + ' / 未作成 = ' + (d.bank - d.covered));
  ok(d.missing === 0, '必須セクション欠落 = ' + d.missing);
  ok(d.badPair === 0, '形式不正の行 = ' + d.badPair);
  ok(d.badPat === 0, '形式不正のテンプレート = ' + d.badPat);
  ok(d.noN === 0, '比較表なしのレコード = ' + d.noN);
  ok(d.idsOk, 'フレーズIDと解説が1対1で対応していない');
  ok(d.dupT === 0, '自然な日本語訳の重複 = ' + d.dupT);

  H('B 全300件を実際に描画できるか');
  const render = await page.evaluate(() => {
    const out = { done: 0, err: [], secMin: 99, secMax: 0 };
    const list = builtinPhraseList();
    for (const p of list) {
      try {
        renderXpBody(p);
        const secs = document.querySelectorAll('#xpBody .xp-sec').length;
        if (secs < out.secMin) out.secMin = secs;
        if (secs > out.secMax) out.secMax = secs;
        if (secs !== 7) out.err.push(p.english + ' -> ' + secs + 'sections');
        if (document.querySelector('#xpBody .xp-none')) out.err.push(p.english + ' -> none');
        out.done++;
      } catch (e) { out.err.push(p.english + ' -> ' + e.message); }
    }
    return out;
  });
  ok(render.done === 300, '描画できた件数 = ' + render.done);
  ok(render.err.length === 0, '描画エラー ' + render.err.length + '件: ' + render.err.slice(0,3).join(' | '));
  ok(render.secMin === 7 && render.secMax === 7, 'セクション数 min=' + render.secMin + ' max=' + render.secMax);

  H('C 既存機能の互換性（仕様書 9節）');
  await page.selectOption('#groupSelect', 'implication');
  await page.click('#btnOpenGroup');
  await page.waitForTimeout(500);
  ok(await page.locator('#cardGrid .card').count() === 19, 'グループ展開のカード数');
  const card0 = page.locator('#cardGrid .card').nth(0);
  const labels = await card0.locator('.acts .iconbtn .lbl').allTextContents();
  ['読み上げ','覚えた','復習','お気に入り','録音','使い方を見る','詳細解説'].forEach(l =>
    ok(labels.includes(l), 'ボタン欠落: ' + l));
  // CH切り替え
  await card0.locator('.chan button').nth(1).click(); await page.waitForTimeout(200);
  ok(await card0.locator('.f-kana').count() === 1, 'CH2 発音が出ない');
  await card0.locator('.chan button').nth(2).click(); await page.waitForTimeout(200);
  ok(await card0.locator('.f-ja').count() === 1, 'CH3 日本語が出ない');
  await card0.locator('.chan button').nth(0).click(); await page.waitForTimeout(200);
  // 使い方を見る
  await card0.locator('.acts .iconbtn').nth(5).click(); await page.waitForTimeout(200);
  ok(await card0.locator('.detail:not(.hide)').count() === 1, '使い方を見るが開かない');
  // 覚えた・復習・お気に入り
  await card0.locator('.acts .iconbtn.good').click(); await page.waitForTimeout(150);
  await page.locator('#cardGrid .card').nth(1).locator('.acts .iconbtn.mid').click(); await page.waitForTimeout(150);
  await page.locator('#cardGrid .card').nth(2).locator('.acts .iconbtn').nth(3).click(); await page.waitForTimeout(250);
  const st = await page.evaluate(() => ({
    m: allPhrases().filter(p => p.progress.mastered).length,
    r: allPhrases().filter(p => p.progress.needsReview).length,
    f: allPhrases().filter(p => p.progress.favorite).length,
  }));
  ok(st.m === 1 && st.r === 1 && st.f === 1, '覚えた/復習/お気に入り = ' + JSON.stringify(st));

  H('D 閲覧時にAPIを呼ばない・学習状態を変えない（仕様書 2節・10節）');
  const before = await page.evaluate(() => JSON.stringify(State.phrases));
  const netBefore = net.length;
  for (let i = 0; i < 5; i++) {
    await page.locator('#cardGrid .card').nth(i).locator('.acts .iconbtn.deep').click();
    await page.waitForTimeout(250);
    ok(await page.locator('#xp.open').count() === 1, (i+1) + '枚目で解説が開かない');
    await page.click('#xpBack');
    await page.waitForTimeout(200);
  }
  ok(net.length === netBefore, '閲覧中に通信が発生: ' + net.slice(netBefore).join(','));
  const after = await page.evaluate(() => JSON.stringify(State.phrases));
  ok(before === after, '閲覧で学習状態が変わった');

  H('E 画面の表示（仕様書 10節 UIテスト）');
  await page.locator('#cardGrid .card').nth(0).locator('.acts .iconbtn.deep').click();
  await page.waitForTimeout(350);
  ok(await page.locator('#xpTitle').textContent() === '詳細解説', 'タイトル');
  ok(await page.locator('#xpBack').isVisible(), '戻るボタンが見えない');
  const heads = await page.locator('#xpBody .xp-sec > h3').allTextContents();
  const want = ['自然な日本語訳','英文構造','重要語彙','ニュアンス','ビジネスでの実践例','応用テンプレート','学習の要点'];
  want.forEach((w, i) => ok((heads[i]||'').includes(w), `見出し${i+1}: ${heads[i]} に ${w} が無い`));
  ok(await page.locator('#xpBody .xp-table thead th').count() === 2, '比較表のヘッダ');
  ok(await page.locator('#xpBody .xp-ex .ex-en').count() >= 1, '実践例の英文');
  ok(await page.locator('#xpBody .xp-ex .ex-ja').count() >= 1, '実践例の和訳');
  ok(await page.locator('#xpBody .xp-pat .frame b').count() >= 1, '置換部分の強調');
  ok(await page.locator('#xpBody .xp-key li').count() >= 2, '学習の要点');
  ok(await page.locator('#xpJump button').count() === 7, 'ジャンプボタン');
  const m = await page.evaluate(() => {
    const b = document.getElementById('xpBody');
    const over = [...document.querySelectorAll('#xpBody *')].filter(n => n.scrollWidth > n.clientWidth + 2 && getComputedStyle(n).overflowX === 'visible').length;
    b.scrollTop = 99999;
    return { sh: b.scrollHeight, ch: b.clientHeight, top: b.scrollTop, over,
             docW: document.documentElement.scrollWidth, win: window.innerWidth,
             tap: Math.min(...[...document.querySelectorAll('#xp button')].map(n => n.getBoundingClientRect().height)) };
  });
  ok(m.sh > m.ch && m.top > 0, '縦スクロールできない');
  ok(m.docW <= m.win + 1, '横にあふれている docW=' + m.docW);
  ok(m.over === 0, '内側ではみ出している要素 = ' + m.over);
  ok(m.tap >= 34, '最小タップ高 = ' + m.tap.toFixed(0) + 'px');

  H('F 設定画面の件数表示と再開可能なバッチ');
  await page.click('#xpBack'); await page.waitForTimeout(250);
  await page.evaluate(() => selectScreen('settings'));
  await page.waitForTimeout(350);
  const kv = await page.locator('#xpStat dt').allTextContents();
  const vv = await page.locator('#xpStat dd').allTextContents();
  ok(kv.includes('内蔵解説') && kv.includes('未作成'), '件数表示の項目: ' + kv.join(','));
  ok(vv[0] === '300件', '内蔵解説の件数: ' + vv[0]);
  ok(vv[kv.indexOf('未作成')] === '0件', '未作成の件数: ' + vv[kv.indexOf('未作成')]);
  ok(await page.locator('#btnXpBatch').isHidden(), '未作成0件なのにバッチボタンが出ている');
  const pend = await page.evaluate(() => explainPending().length);
  ok(pend === 0, '未作成フレーズ = ' + pend);

  H('G AI生成フレーズの扱い（未作成 → 生成ボタン）');
  const fake = await page.evaluate(() => {
    const id = 'testai1';
    State.phrases[id] = { id: id, setId: 'sx', english: 'Let us circle back on the widget plan.',
      kana: '—', ipa: '', japanese: 'ウィジェット計画は後で戻りましょう。', function: 'テスト',
      register: '標準', frame: 'Let us circle back on [topic].', exEn: 'x', exJa: 'y', note: '—',
      difficulty: '中級', progress: blankProgress() };
    return { pend: explainPending().length, has: hasExplain(State.phrases[id]) };
  });
  ok(fake.pend === 1, 'AI生成フレーズが未作成として数えられない: ' + fake.pend);
  ok(fake.has === false, 'AI生成フレーズに解説がある判定');
  await page.evaluate(() => { renderXpStat(); Explain.open(State.phrases['testai1']); });
  await page.waitForTimeout(350);
  ok(await page.locator('#xpBody .xp-none').count() === 1, '未登録表示が出ない');
  ok(await page.locator('#xpBody .xp-none .btn').count() >= 1, '生成ボタンが無い');
  ok(await page.locator('#xpBody .warn').count() === 1, 'キー未登録の注意が出ない');
  await page.click('#xpBack'); await page.waitForTimeout(250);
  await page.evaluate(() => selectScreen('settings')); await page.waitForTimeout(300);
  ok(await page.locator('#btnXpBatch').isVisible(), '未作成ありなのにバッチボタンが出ない');
  const note = await page.locator('#xpBatchNote').textContent();
  ok(note.includes('1件'), '未作成件数の案内: ' + note);
  await page.evaluate(() => { delete State.phrases['testai1']; renderXpStat(); });

  H('H 残りの既存機能');
  await page.evaluate(() => selectScreen('quiz')); await page.waitForTimeout(300);
  ok(await page.locator('#quizSetup:not(.hide)').count() === 1, '瞬発テストの範囲選択');
  await page.evaluate(() => selectScreen('mastered')); await page.waitForTimeout(300);
  ok(await page.locator('#player').count() === 1, '連続再生プレーヤー');
  await page.evaluate(() => selectScreen('favorites')); await page.waitForTimeout(250);
  await page.evaluate(() => selectScreen('review')); await page.waitForTimeout(250);
  await page.evaluate(() => selectScreen('history')); await page.waitForTimeout(250);
  await page.evaluate(() => selectScreen('help')); await page.waitForTimeout(250);
  await page.evaluate(() => selectScreen('newscene')); await page.waitForTimeout(250);
  ok(await page.locator('#groupSelect option').count() === 16, 'グループのプルダウン = 16');
  ok(errors.length === 0, '最終的なJSエラー: ' + errors.join(' | '));

  H('I 再読み込み後も学習進捗が残るか');
  await page.reload(); await page.waitForTimeout(900);
  const st2 = await page.evaluate(() => ({
    m: allPhrases().filter(p => p.progress.mastered).length,
    r: allPhrases().filter(p => p.progress.needsReview).length,
    f: allPhrases().filter(p => p.progress.favorite).length,
    n: Object.keys(XDB_DATA).length,
  }));
  ok(st2.m === 1 && st2.r === 1 && st2.f === 1, '再読み込み後の進捗 = ' + JSON.stringify(st2));
  ok(st2.n === 300, '再読み込み後の解説件数 = ' + st2.n);

  await browser.close();
  console.log('\n==== PASS ' + pass + ' / FAIL ' + fail + ' ====');
  process.exit(fail ? 1 : 0);
})();
