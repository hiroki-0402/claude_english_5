const fs = require('fs');
const s = fs.readFileSync('src.html', 'utf8');
const m = s.match(/const BANK = \[\];([\s\S]*?)\n\/\* ----------/);
if (!m) { console.error('BANK block not found'); process.exit(1); }
const code = 'const BANK=[];' + m[1] + ';module.exports=BANK;';
fs.writeFileSync('bank.cjs', code);
const BANK = require('./bank.cjs');
const norm = (x) => String(x||'').toLowerCase().replace(/[^a-z0-9\[\] ]/g,' ').replace(/\s+/g,' ').trim();
function bid(english){let h=0;const t=norm(english);for(let i=0;i<t.length;i++){h=(h*31+t.charCodeAt(i))|0;}return 'b'+Math.abs(h).toString(36);}
const out = [];
BANK.forEach(cat => cat.items.forEach(it => {
  out.push({ id: bid(it[0]), catId: cat.id, fn: cat.fn, english: it[0], japanese: it[3],
             register: it[4], frame: it[5], exEn: it[6], exJa: it[7], note: it[8], difficulty: it[9] });
}));
fs.writeFileSync('phrases.json', JSON.stringify(out, null, 1));
const byCat = {};
BANK.forEach(c => byCat[c.id] = { fn: c.fn, label: c.label, n: c.items.length });
console.log('categories:', BANK.length, 'phrases:', out.length);
console.log(JSON.stringify(byCat, null, 1));
const ids = new Set(out.map(p=>p.id));
console.log('unique ids:', ids.size);
const engs = new Set(out.map(p=>norm(p.english)));
console.log('unique english:', engs.size);
