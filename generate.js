/**
 * Meeting Floor — AI生成プロキシ
 * 配置場所: functions/api/generate.js （Cloudflare Pages Functions）
 *
 * 役割はひとつだけ: ブラウザからAPIキーを隠す。
 * ブラウザ → このエンドポイント → Anthropic API という経路にすることで、
 * キーはサーバー側の環境変数だけに存在し、配信されるコードには一切含まれない。
 *
 * 環境変数（Cloudflare Pages のダッシュボード → Settings → Environment variables）
 *   ANTHROPIC_API_KEY : Anthropic のAPIキー
 *
 * 使い方:
 *   index.html 内の AI_CONFIG.proxyEndpoint を '/api/generate' に変更する。
 */

// 既定は最安の Haiku。定型表現の生成にはこれで十分。
// 表現の自然さを上げたい場合は 'claude-sonnet-5' に変える（1回あたりのコストは約2倍）。
//   claude-haiku-4-5-20251001 : $1 / $5  per MTok（入力 / 出力）
//   claude-sonnet-5           : $2 / $10 per MTok
//   claude-opus-5             : $5 / $25 per MTok
const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 4000;

export async function onRequestPost({ request, env }) {
  const cors = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  if (!env.ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY が未設定です' }), { status: 500, headers: cors });
  }

  let prompt;
  try {
    const body = await request.json();
    prompt = body && body.prompt;
  } catch (e) {
    return new Response(JSON.stringify({ error: 'JSONを解析できません' }), { status: 400, headers: cors });
  }

  if (typeof prompt !== 'string' || !prompt.trim()) {
    return new Response(JSON.stringify({ error: 'prompt が空です' }), { status: 400, headers: cors });
  }
  if (prompt.length > 20000) {
    return new Response(JSON.stringify({ error: 'prompt が長すぎます' }), { status: 413, headers: cors });
  }

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!r.ok) {
      const detail = await r.text();
      return new Response(JSON.stringify({ error: 'upstream ' + r.status, detail: detail.slice(0, 300) }),
        { status: 502, headers: cors });
    }

    const data = await r.json();
    const text = (data.content || []).map(c => (c.type === 'text' ? c.text : '')).filter(Boolean).join('\n');
    return new Response(JSON.stringify({ text }), { headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e && e.message || e) }), { status: 502, headers: cors });
  }
}

export function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

/* ------------------------------------------------------------------
   OpenAI を使う場合は、上の fetch を次に置き換える
   （環境変数は OPENAI_API_KEY、レスポンスの取り出し方だけが違う）:

     const r = await fetch('https://api.openai.com/v1/chat/completions', {
       method: 'POST',
       headers: {
         'Content-Type': 'application/json',
         'Authorization': 'Bearer ' + env.OPENAI_API_KEY,
       },
       body: JSON.stringify({
         model: 'gpt-5.6-luna',
         messages: [{ role: 'user', content: prompt }],
       }),
     });
     const data = await r.json();
     const text = (data.choices && data.choices[0] && data.choices[0].message.content) || '';

------------------------------------------------------------------ */

/* ------------------------------------------------------------------
   Vercel を使う場合は、このファイルを api/generate.js に置き換えて
   下記のようにする（環境変数名は同じ ANTHROPIC_API_KEY）:

   export default async function handler(req, res) {
     if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
     const { prompt } = req.body || {};
     if (!prompt) return res.status(400).json({ error: 'prompt が空です' });
     const r = await fetch('https://api.anthropic.com/v1/messages', {
       method: 'POST',
       headers: {
         'Content-Type': 'application/json',
         'x-api-key': process.env.ANTHROPIC_API_KEY,
         'anthropic-version': '2023-06-01',
       },
       body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 4000,
                              messages: [{ role: 'user', content: prompt }] }),
     });
     if (!r.ok) return res.status(502).json({ error: 'upstream ' + r.status });
     const data = await r.json();
     const text = (data.content || []).map(c => c.type === 'text' ? c.text : '').join('\n');
     res.status(200).json({ text });
   }
------------------------------------------------------------------ */
