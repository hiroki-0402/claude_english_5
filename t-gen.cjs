const { chromium } = require('playwright');
const path = require('path');
const FILE = 'file://' + path.resolve(__dirname, 'test.html');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL: ' + m); } };
const H = (s) => console.log('\n--- ' + s + ' ---');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(FILE);
  await page.waitForTimeout(800);

  H('1 新規フレーズの解説生成（API応答をすり替えて検証）');
  const r1 = await page.evaluate(async () => {
    // AIの応答を差し替える（本物のAPIは呼ばない）
    window.__calls = [];
    AI_CONFIG.proxyEndpoint = '/fake-endpoint-for-test';   // キー判定を通すためだけ（callModel は下で差し替える）
    window.__origCallModel = callModel;
    window.callModel = async (prompt) => {
      window.__calls.push({ prompt: prompt, max: AI_CONFIG.maxTokens, timeout: AI_CONFIG.timeoutMs });
      const ens = [...prompt.matchAll(/english: (.+)/g)].map(m => m[1].trim());
      return JSON.stringify(ens.map(e => ({
        english: e,
        naturalTranslation: '訳: ' + e,
        naturalTranslationNote: '補足',
        sentenceStructure: [['chunk', '構造の説明']],
        sentenceStructureNote: '',
        vocabularyExplanations: [['word', 'コアイメージ']],
        nuanceComparisons: [['alt', '違い']],
        nuanceNote: '',
        businessExamples: [['An example sentence.', '例文の訳']],
        reusablePatterns: [['Let us [X].', ['Let us start.', 'Let us wait.']]],
        keyTakeaways: ['要点1', '要点2'],
      })));
    };
    // 7件のAI生成フレーズを登録（BATCH=3 なので3回に分かれる）
    const set = { id: 'setai', scene: 'テスト', createdAt: todayISO(), phraseIds: [], kind: 'ai' };
    State.sets.push(set); State.activeSetId = set.id;
    for (let i = 0; i < 7; i++) {
      const id = 'ai' + i;
      State.phrases[id] = { id: id, setId: set.id, english: 'Test phrase number ' + i + ' here.',
        kana: '—', ipa: '', japanese: 'テスト文' + i, function: 'テスト', register: '標準',
        frame: 'Test [x].', exEn: 'a', exJa: 'b', note: '—', difficulty: '中級', progress: blankProgress() };
      set.phraseIds.push(id);
    }
    const pendBefore = explainPending().length;
    await ExplainGen.runFor(setPhrases(set));
    return {
      pendBefore: pendBefore,
      pendAfter: explainPending().length,
      calls: window.__calls.length,
      maxTokens: window.__calls[0] && window.__calls[0].max,
      timeout: window.__calls[0] && window.__calls[0].timeout,
      restoredMax: AI_CONFIG.maxTokens,
      restoredTimeout: AI_CONFIG.timeoutMs,
      done: ExplainGen.done, failed: ExplainGen.failed,
      has: setPhrases(set).filter(p => hasExplain(p)).length,
      sample: JSON.stringify(State.phrases.ai0.explain).slice(0, 80),
      ver: State.phrases.ai0.explain.ver,
    };
  });
  ok(r1.pendBefore === 7, '生成前の未作成 = ' + r1.pendBefore);
  ok(r1.pendAfter === 0, '生成後の未作成 = ' + r1.pendAfter);
  ok(r1.calls === 3, 'API呼び出し回数（3件ずつ7件 → 3回）= ' + r1.calls);
  ok(r1.maxTokens === 8000, '解説生成時の max_tokens = ' + r1.maxTokens);
  ok(r1.timeout === 90000, '解説生成時のタイムアウト = ' + r1.timeout);
  ok(r1.restoredMax === 4000 && r1.restoredTimeout === 20000, 'AI_CONFIG が元に戻っていない');
  ok(r1.done === 7 && r1.failed === 0, '成功/失敗 = ' + r1.done + '/' + r1.failed);
  ok(r1.has === 7, '解説が付いたフレーズ = ' + r1.has);
  ok(r1.ver === 1, 'explanationVersion = ' + r1.ver);

  H('2 生成した解説が画面に出るか');
  await page.evaluate(() => Explain.open(State.phrases.ai0));
  await page.waitForTimeout(350);
  ok(await page.locator('#xp.open').count() === 1, '解説画面が開かない');
  ok(await page.locator('#xpBody .xp-sec').count() === 7, 'セクション数');
  ok((await page.locator('#xpBody .xp-trans').textContent()).includes('Test phrase number 0'), '訳の中身が違う');
  ok(await page.locator('#xpBody .xp-none').count() === 0, '未登録表示が出ている');
  await page.click('#xpBack'); await page.waitForTimeout(250);

  H('3 保存されるか（再読み込み後も残るか）');
  await page.evaluate(() => flushPersist());
  await page.waitForTimeout(300);
  await page.reload(); await page.waitForTimeout(900);
  const r3 = await page.evaluate(() => ({
    pend: explainPending().length,
    has: Object.keys(State.phrases).filter(k => k.startsWith('ai')).filter(k => hasExplain(State.phrases[k])).length,
    t: State.phrases.ai3 && State.phrases.ai3.explain && State.phrases.ai3.explain.t,
  }));
  ok(r3.has === 7, '再読み込み後に残っている解説 = ' + r3.has);
  ok(r3.pend === 0, '再読み込み後の未作成 = ' + r3.pend);
  ok((r3.t || '').includes('Test phrase number 3'), '再読み込み後の中身: ' + r3.t);

  H('4 失敗時は未作成として残り、再生成できるか');
  const r4 = await page.evaluate(async () => {
    AI_CONFIG.proxyEndpoint = '/fake-endpoint-for-test';   // 再読み込みで消えるので入れ直す
    const id = 'aifail';
    State.phrases[id] = { id: id, setId: 'setai', english: 'This one will fail to generate.',
      kana: '—', ipa: '', japanese: '失敗するもの', function: 'テスト', register: '標準',
      frame: 'This [x].', exEn: 'a', exJa: 'b', note: '—', difficulty: '中級', progress: blankProgress() };
    window.callModel = async () => { throw new Error('rate limit'); };
    await ExplainGen.runFor([State.phrases[id]]);
    const afterFail = { pend: explainPending().length, err: State.phrases[id].explainErr, has: hasExplain(State.phrases[id]) };
    // 再生成：今度は成功させる
    window.callModel = async (prompt) => {
      const ens = [...prompt.matchAll(/english: (.+)/g)].map(m => m[1].trim());
      return JSON.stringify(ens.map(e => ({
        english: e, naturalTranslation: 'retried: ' + e,
        sentenceStructure: [['a','b']], vocabularyExplanations: [['a','b']],
        nuanceComparisons: [['a','b']], businessExamples: [['A.','あ']],
        reusablePatterns: [['Do [x].', ['Do it.']]], keyTakeaways: ['1','2'],
      })));
    };
    await ExplainGen.runAll();
    return { afterFail: afterFail, pend: explainPending().length,
             err: State.phrases[id].explainErr, t: State.phrases[id].explain && State.phrases[id].explain.t };
  });
  ok(r4.afterFail.pend === 1, '失敗後の未作成 = ' + r4.afterFail.pend);
  ok(!!r4.afterFail.err, '失敗理由が記録されていない');
  ok(r4.afterFail.has === false, '失敗したのに解説がある判定');
  ok(r4.pend === 0, '再生成後の未作成 = ' + r4.pend);
  ok(!r4.err, '再生成後も失敗理由が残っている: ' + r4.err);
  ok((r4.t || '').startsWith('retried:'), '再生成の中身: ' + r4.t);

  H('5 必須項目が欠けた応答は採用しない');
  const r5 = await page.evaluate(async () => {
    const id = 'aibad';
    State.phrases[id] = { id: id, setId: 'setai', english: 'An incomplete response case.',
      kana: '—', ipa: '', japanese: '不完全', function: 'テスト', register: '標準',
      frame: 'An [x].', exEn: 'a', exJa: 'b', note: '—', difficulty: '中級', progress: blankProgress() };
    window.callModel = async (prompt) => {
      const ens = [...prompt.matchAll(/english: (.+)/g)].map(m => m[1].trim());
      return JSON.stringify(ens.map(e => ({ english: e, naturalTranslation: 'x' })));  // 必須欠落
    };
    const base = explainPending().length;
    await ExplainGen.runFor([State.phrases[id]]);
    return { has: hasExplain(State.phrases[id]), err: State.phrases[id].explainErr,
             added: explainPending().length - base + 1 };
  });
  ok(r5.has === false, '必須欠落の応答を採用してしまった');
  ok(!!r5.err, '欠落の記録が無い');
  ok(r5.added === 1, '欠落後も未作成として残っていない');

  H('6 取り違え（別フレーズの解説）は捨てる');
  const r6 = await page.evaluate(async () => {
    window.callModel = async () => JSON.stringify([{
      english: 'A completely different sentence that was not requested.',
      naturalTranslation: 'x', sentenceStructure: [['a','b']], vocabularyExplanations: [['a','b']],
      nuanceComparisons: [['a','b']], businessExamples: [['A.','あ']],
      reusablePatterns: [['Do [x].', ['Do it.']]], keyTakeaways: ['1','2'],
    }]);
    await ExplainGen.runFor([State.phrases.aibad]);
    return { has: hasExplain(State.phrases.aibad),
             foreign: !!XDB_DATA[norm('A completely different sentence that was not requested.')] };
  });
  ok(r6.has === false, '取り違えた解説を採用してしまった');
  ok(r6.foreign === false, '対象外の解説が内蔵DBに混入した');

  H('7 内蔵フレーズはAPIを呼ばずに表示される（キーがあっても）');
  const r7 = await page.evaluate(async () => {
    let called = 0;
    window.callModel = async () => { called++; return '[]'; };
    const list = builtinPhraseList().slice(0, 20);
    list.forEach(p => { Explain.open(p); Explain.close(); });
    return { called: called, ok: list.every(p => !!explainOf(p)) };
  });
  ok(r7.called === 0, '内蔵フレーズの閲覧でAPIが呼ばれた = ' + r7.called + '回');
  ok(r7.ok, '内蔵フレーズの解説が取れない');

  ok(errors.length === 0, 'JSエラー: ' + errors.join(' | '));
  await browser.close();
  console.log('\n==== PASS ' + pass + ' / FAIL ' + fail + ' ====');
  process.exit(fail ? 1 : 0);
})();
