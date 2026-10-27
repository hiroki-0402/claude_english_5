#!/usr/bin/env python3
"""詳細解説データの完全性検証（仕様書 4節 / 7節 / 10節）"""
import json, re, importlib.util, os, sys, collections
W = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('b', os.path.join(W, 'build.py'))
b = importlib.util.module_from_spec(spec); spec.loader.exec_module(b)

phrases = b.load_phrases()
recs, src_of, errs = b.load_exp()
assert not errs, errs
fail = []
def check(cond, msg):
    print(('  OK   ' if cond else '  FAIL ') + msg)
    if not cond: fail.append(msg)

print('=== 1) フレーズIDとの対応 ===')
by_norm = {b.norm(p['english']): p for p in phrases}
check(len(phrases) == 300, f'登録済みフレーズ数 = {len(phrases)}')
check(len(recs) == 300, f'解説レコード数 = {len(recs)}')
check(all(k in by_norm for k in recs), '全レコードが既存フレーズに対応')
check(all(b.norm(p['english']) in recs for p in phrases), '全フレーズに解説がある（未作成0件）')
ids = {b.builtin_phrase_id(k): k for k in recs}
check(len(ids) == 300, f'フレーズIDが一意（{len(ids)}件）')
check(all(b.builtin_phrase_id(p['english']) in ids for p in phrases), 'builtinPhraseId がレコードと1対1で一致')

print('=== 2) 必須セクションの欠落 ===')
miss = []
for k, r in recs.items():
    for sec in b.REQUIRED:
        v = r.get(sec)
        bad = (not isinstance(v, str) or not v.strip()) if sec == 't' else (not isinstance(v, list) or not v)
        if bad: miss.append((src_of[k][1], sec))
check(not miss, f'必須6セクション（t,s,v,e,p,k）の欠落 = {len(miss)}件')
nn = sum(1 for r in recs.values() if r.get('n'))
check(nn == 300, f'任意セクション n（比較表）を持つレコード = {nn}件')

print('=== 3) 異なるフレーズの解説の混入 ===')
# 自然な訳の重複
t_dup = [v for v, c in collections.Counter(r['t'] for r in recs.values()).items() if c > 1]
check(not t_dup, f'自然な日本語訳の重複 = {len(t_dup)}件')
# フレーズの和訳と解説の訳が乖離していないか（完全不一致の検出）
odd = []
for k, r in recs.items():
    p = by_norm[k]
    ja = re.sub(r'[。、・\s]', '', p['japanese'])
    t  = re.sub(r'[。、・\s]', '', r['t'])
    # 2文字以上の共通部分列がまったく無ければ要確認
    if not any(ja[i:i+3] in t for i in range(max(0, len(ja)-2))):
        odd.append((p['id'], p['japanese'], r['t']))
print(f'  INFO 元の和訳と解説の訳が大きく異なるもの: {len(odd)}件（言い換えのため正常でもありうる）')
for x in odd[:8]: print(f'       {x[0]}  元:{x[1]}  / 解説:{x[2]}')
# 解説中の英文が他フレーズの英文そのままでないか
cross = []
eng_set = {b.norm(p['english']): p['id'] for p in phrases}
for k, r in recs.items():
    mine = eng_set[k]
    for row in (r.get('e') or []):
        n = b.norm(row[0])
        if n in eng_set and eng_set[n] != mine:
            cross.append((src_of[k][1], row[0]))
check(not cross, f'実践例に他フレーズの英文がそのまま入っている = {len(cross)}件')

print('=== 4) データ形式 ===')
bad_pair = bad_pat = bad_key = 0
for k, r in recs.items():
    for sec in ['s','v','n','e']:
        for row in (r.get(sec) or []):
            if not (isinstance(row, list) and len(row) == 2 and all(isinstance(x, str) and x.strip() for x in row)): bad_pair += 1
    for row in (r.get('p') or []):
        ok = (isinstance(row, list) and len(row) == 2 and isinstance(row[0], str)
              and isinstance(row[1], list) and all(isinstance(x, str) and x.strip() for x in row[1]))
        if not ok: bad_pat += 1
    for key in r:
        if key not in ('t','tn','s','sn','v','n','nn','e','p','k','ver'): bad_key += 1
check(bad_pair == 0, f'[文字列, 文字列] 形式でない行 = {bad_pair}件')
check(bad_pat == 0, f'[テンプレート, [応用例…]] 形式でない行 = {bad_pat}件')
check(bad_key == 0, f'未知のキー = {bad_key}件')
noslot = sum(1 for r in recs.values() for row in r['p'] if '[' not in row[0])
check(noslot == 0, f'応用テンプレートに置換部分 [ ] が無いもの = {noslot}件')
k1 = sum(1 for r in recs.values() if len(r['k']) < 2)
check(k1 == 0, f'学習の要点が2件未満のレコード = {k1}件')

print('=== 5) 分量 ===')
sizes = sorted(len(json.dumps(r, ensure_ascii=False)) for r in recs.values())
print(f'  INFO 1件あたり文字数: 最小 {sizes[0]} / 中央 {sizes[150]} / 最大 {sizes[-1]} / 平均 {sum(sizes)//len(sizes)}')
cnt = collections.Counter()
for k, r in recs.items():
    cnt['s'] += len(r['s']); cnt['v'] += len(r['v']); cnt['n'] += len(r.get('n') or [])
    cnt['e'] += len(r['e']); cnt['p'] += len(r['p']); cnt['k'] += len(r['k'])
print('  INFO 要素数合計:', dict(cnt))

print()
print('FAIL' if fail else 'ALL CHECKS PASSED', f'({len(fail)} failures)')
sys.exit(1 if fail else 0)
