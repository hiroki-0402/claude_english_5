#!/usr/bin/env python3
"""Meeting Floor ビルド
  src.html（master） + exp/*.json（詳細解説） -> 配布ファイル

  exp/*.json の形：{ "<英文そのまま>": {t,tn?,s,sn?,v,n?,nn?,e,p,k,ver?}, ... }
  キーは norm() を通して XDB_DATA のキーになる。
"""
import json, re, sys, glob, os, io

W   = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(W, 'src.html')
OUT_DIR  = '/mnt/user-data/outputs'
OUT_APP  = os.path.join(OUT_DIR, 'meeting-floor-app', 'index.html')
OUT_ONE  = os.path.join(OUT_DIR, 'english-meeting-trainer.html')

REQUIRED = ['t', 's', 'v', 'e', 'p', 'k']
PAIR_KEYS = ['s', 'v', 'n', 'e']

def norm(s):
    s = str(s or '').lower()
    s = re.sub(r'[^a-z0-9\[\] ]', ' ', s)
    s = re.sub(r'\s+', ' ', s)
    return s.strip()

def i32(x):
    x &= 0xFFFFFFFF
    return x - 0x100000000 if x >= 0x80000000 else x

def b36(n):
    if n == 0: return '0'
    d = '0123456789abcdefghijklmnopqrstuvwxyz'
    out = ''
    while n:
        out = d[n % 36] + out
        n //= 36
    return out

def builtin_phrase_id(english):
    h = 0
    for ch in norm(english):
        h = i32(h * 31 + ord(ch))
    return 'b' + b36(abs(h))

def load_phrases():
    with open(os.path.join(W, 'phrases.json'), encoding='utf-8') as f:
        return json.load(f)

def load_exp():
    """exp/*.json を読み、normキー -> (rec, 元ファイル, 元キー) にする"""
    recs, src_of, errors = {}, {}, []
    for path in sorted(glob.glob(os.path.join(W, 'exp', '*.json'))):
        try:
            with open(path, encoding='utf-8') as f:
                d = json.load(f)
        except Exception as e:
            errors.append(f'{os.path.basename(path)}: JSONとして読めない: {e}')
            continue
        if not isinstance(d, dict):
            errors.append(f'{os.path.basename(path)}: トップレベルがオブジェクトでない')
            continue
        for k, rec in d.items():
            nk = norm(k)
            if not nk:
                errors.append(f'{os.path.basename(path)}: 空のキー')
                continue
            if nk in recs:
                errors.append(f'キーの重複: "{k}" ({src_of[nk][0]} と {os.path.basename(path)})')
                continue
            recs[nk] = rec
            src_of[nk] = (os.path.basename(path), k)
    return recs, src_of, errors

def validate(recs, src_of, phrases):
    """構造・対応・欠落・混入・重複を調べる"""
    errors, warns = [], []
    by_norm = {norm(p['english']): p for p in phrases}

    # 1) 対応していないキー（対象外フレーズの解説）
    for nk, rec in recs.items():
        if nk not in by_norm:
            errors.append(f'対応するフレーズが無いキー: "{src_of[nk][1]}" ({src_of[nk][0]})')

    # 2) 構造と必須セクション
    for nk, rec in recs.items():
        where = f'{src_of[nk][0]} / "{src_of[nk][1]}"'
        if not isinstance(rec, dict):
            errors.append(f'{where}: レコードがオブジェクトでない'); continue
        for k in REQUIRED:
            v = rec.get(k)
            if k == 't':
                if not isinstance(v, str) or not v.strip():
                    errors.append(f'{where}: t（自然な日本語訳）が無い')
            else:
                if not isinstance(v, list) or not v:
                    errors.append(f'{where}: {k} が無い、または空')
        for k in PAIR_KEYS:
            v = rec.get(k)
            if v is None: continue
            if not isinstance(v, list):
                errors.append(f'{where}: {k} が配列でない'); continue
            for j, row in enumerate(v):
                if not isinstance(row, list) or len(row) != 2 or \
                   not isinstance(row[0], str) or not isinstance(row[1], str) or \
                   not row[0].strip() or not row[1].strip():
                    errors.append(f'{where}: {k}[{j}] が [文字列, 文字列] でない')
        p = rec.get('p')
        if isinstance(p, list):
            for j, row in enumerate(p):
                ok = (isinstance(row, list) and len(row) == 2 and isinstance(row[0], str)
                      and row[0].strip() and isinstance(row[1], list)
                      and all(isinstance(x, str) and x.strip() for x in row[1]))
                if not ok:
                    errors.append(f'{where}: p[{j}] が [テンプレート, [応用例…]] でない')
                elif '[' not in row[0]:
                    warns.append(f'{where}: p[{j}] に置換部分 [ ] が無い')
        k_ = rec.get('k')
        if isinstance(k_, list):
            if not all(isinstance(x, str) and x.strip() for x in k_):
                errors.append(f'{where}: k に空の要素がある')
            elif len(k_) < 2:
                warns.append(f'{where}: k（学習の要点）が1件しかない')
        for key in rec:
            if key not in ('t','tn','s','sn','v','n','nn','e','p','k','ver'):
                errors.append(f'{where}: 未知のキー "{key}"')

    # 3) 混入（別のフレーズの英文が自分の訳として入っていないか）＋手抜きの重複
    seen_t = {}
    for nk, rec in recs.items():
        if not isinstance(rec, dict): continue
        t = str(rec.get('t','')).strip()
        if t:
            if t in seen_t:
                errors.append(f'自然な日本語訳が他と同一: "{src_of[nk][1]}" と "{src_of[seen_t[t]][1]}"')
            else:
                seen_t[t] = nk
        # 例文がフレーズ本文の丸写しでないか
        ex = rec.get('e') or []
        if isinstance(ex, list):
            for row in ex:
                if isinstance(row, list) and len(row)==2 and norm(row[0]) == nk:
                    warns.append(f'{src_of[nk][0]} / "{src_of[nk][1]}": 実践例が元の英文そのまま')

    # 4) 未作成
    pending = [p for p in phrases if norm(p['english']) not in recs]
    return errors, warns, pending

def emit_js(recs, phrases):
    by_norm = {norm(p['english']): p for p in phrases}
    lines = []
    for p in phrases:                      # 内蔵フレーズの並び順で出す
        nk = norm(p['english'])
        if nk not in recs: continue
        rec = recs[nk]
        clean = {k: rec[k] for k in ('t','tn','s','sn','v','n','nn','e','p','k','ver') if k in rec}
        lines.append(json.dumps(nk, ensure_ascii=False) + ':' +
                     json.dumps(clean, ensure_ascii=False, separators=(',',':')) + ',')
    body = '\n'.join(lines)
    return 'const XDB_DATA = {\n' + body + '\n};'

def main():
    report_only = '--report' in sys.argv
    src = open(SRC, encoding='utf-8').read()
    phrases = load_phrases()
    recs, src_of, load_errors = load_exp()
    errors, warns, pending = validate(recs, src_of, phrases)
    errors = load_errors + errors

    print(f'内蔵フレーズ          : {len(phrases)}件')
    print(f'解説レコード          : {len(recs)}件')
    print(f'解説あり              : {len(phrases) - len(pending)}件')
    print(f'未作成                : {len(pending)}件')
    print(f'ニュアンス比較あり    : {sum(1 for r in recs.values() if isinstance(r,dict) and r.get("n"))}件')
    if warns:
        print(f'\n--- 警告 {len(warns)}件 ---')
        for w in warns[:40]: print('  ! ' + w)
        if len(warns) > 40: print(f'  …ほか {len(warns)-40}件')
    if errors:
        print(f'\n--- エラー {len(errors)}件 ---')
        for e in errors[:60]: print('  x ' + e)
        if len(errors) > 60: print(f'  …ほか {len(errors)-60}件')
        print('\nエラーがあるためビルドしません。')
        return 1
    if pending and '--allow-pending' not in sys.argv and not report_only:
        print('\n未作成があります。--allow-pending を付けると途中版をビルドします。')
        return 2
    if report_only:
        if pending:
            print('\n--- 未作成の内訳 ---')
            per = {}
            for p in pending: per.setdefault(p['catId'], []).append(p)
            for cid, items in per.items():
                print(f'  {cid}: {len(items)}件  ' + ' '.join(x['id'] for x in items[:6]) +
                      (' …' if len(items) > 6 else ''))
        return 0

    # --- 注入 ---
    block = emit_js(recs, phrases)
    pat = re.compile(r'(/\* XDB:BEGIN[^\n]*\n)(.*?)(\n/\* XDB:END \*/)', re.S)
    assert pat.search(src), 'XDBマーカーが見つからない'
    out = pat.sub(lambda m: m.group(1) + block + m.group(3), src, count=1)

    os.makedirs(os.path.dirname(OUT_APP), exist_ok=True)
    open(OUT_APP, 'w', encoding='utf-8').write(out)
    single = re.sub(r'<!--PWA-->.*?<!--/PWA-->\n?', '', out, flags=re.S)
    open(OUT_ONE, 'w', encoding='utf-8').write(single)
    print(f'\nindex.html                   : {len(out):,}文字 / {os.path.getsize(OUT_APP):,}バイト')
    print(f'english-meeting-trainer.html : {len(single):,}文字 / {os.path.getsize(OUT_ONE):,}バイト')
    return 0

if __name__ == '__main__':
    sys.exit(main())
