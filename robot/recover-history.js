#!/usr/bin/env node
/* ============================================================
   GOLVALUE — recuperar el historial borrado (se usa UNA vez)
   ------------------------------------------------------------
   Hasta oct-2026 el robot recortaba el historial (60 picks /
   40 combinadas / 40 surebets) y borraba lo que no se liquidaba
   en 4-5 días. Todo eso sigue en el historial de git de
   daily.json: este script lo recorre y lo devuelve a daily.json.
     · lo ya liquidado (W/L) vuelve a RECORD / COMBO_RECORD / ARB_RECORD
     · lo que se borró sin liquidar vuelve a PENDING / COMBO_PENDING /
       ARB_PENDING, y la siguiente ejecución del robot lo liquida
       (ESPN) o lo anula con motivo.
   Uso (desde la raíz del repo):  node robot/recover-history.js
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'daily.json');
const git = (cmd) => execSync('git ' + cmd, { cwd: ROOT, maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] }).toString();

const recKey   = (r) => r.id ? `${r.id}|${r.pick || r.pickLabel}` : `${r.date}|${r.match}|${r.pick || r.pickLabel}`;
const comboKey = (c) => `${c.date||''}|${(c.legs||[]).map(l => `${l.match}|${l.pick}`).sort().join(' + ')}`;
const arbKey   = (a) => `${a.date||''}|${a.match||''}`;
const ladKey   = (h) => `${h.id}|${h.result}`;
// entradas de prueba de tenis que se colaron al principio (no son de fútbol)
const TENNIS   = /^[A-Z]\. \S.* – [A-Z]\. |Kostyuk|Andreeva|Shnaider|Chwalinska|Kalinskaya/;
const isJunk   = (r) => !r.id && TENNIS.test(r.match || '');
const isJunkCombo = (c) => (c.legs || []).some(l => !l.sport && TENNIS.test(l.match || ''));

const cur = JSON.parse(fs.readFileSync(OUT, 'utf8'));
const commits = git('log --format=%H -- daily.json').trim().split('\n');

const seen = { R: new Map(), CR: new Map(), AR: new Map(), LH: new Map(), P: new Map(), CP: new Map(), AP: new Map() };
let read = 0;
for (const c of commits) {               // del más nuevo al más antiguo
    let d;
    try { d = JSON.parse(git(`show ${c}:daily.json`)); } catch (e) { continue; }
    read++;
    (d.RECORD || []).forEach(r => { if (r && !r.legs && r.result && !seen.R.has(recKey(r))) seen.R.set(recKey(r), r); });
    (d.COMBO_RECORD || []).forEach(r => { if (r && r.result && !seen.CR.has(comboKey(r))) seen.CR.set(comboKey(r), r); });
    (d.ARB_RECORD || []).forEach(r => { if (r && !seen.AR.has(arbKey(r))) seen.AR.set(arbKey(r), r); });
    (d.LADDER_HISTORY || []).forEach(r => { if (r && !seen.LH.has(ladKey(r))) seen.LH.set(ladKey(r), r); });
    // de lo pendiente nos quedamos con la versión más nueva (puede traer más datos, p. ej. ts)
    (d.PENDING || []).forEach(r => { const k = r.id || recKey(r); if (!seen.P.has(k)) seen.P.set(k, r); });
    (d.COMBO_PENDING || []).forEach(r => { if (!seen.CP.has(comboKey(r))) seen.CP.set(comboKey(r), r); });
    (d.ARB_PENDING || []).forEach(r => { if (!seen.AP.has(arbKey(r))) seen.AP.set(arbKey(r), r); });
}

const add = (list, all, keyFn, skip) => {
    const have = new Set(list.map(keyFn)); let n = 0;
    for (const [k, r] of all) if (!have.has(k) && !(skip && skip(r))) { list.push(r); have.add(k); n++; }
    return n;
};
const out = { ...cur };
['RECORD','PENDING','COMBO_RECORD','COMBO_PENDING','ARB_RECORD','ARB_PENDING','LADDER_HISTORY'].forEach(k => { out[k] = Array.isArray(cur[k]) ? [...cur[k]] : []; });

const junk = [...seen.R.values()].filter(isJunk);
const nR  = add(out.RECORD, seen.R, recKey, isJunk);
const junkC = [...seen.CR.values(), ...seen.CP.values()].filter(c => isJunkCombo(c) && !(cur.COMBO_RECORD || []).includes(c) && !(cur.COMBO_PENDING || []).includes(c));
const nCR = add(out.COMBO_RECORD, seen.CR, comboKey, isJunkCombo);
const nAR = add(out.ARB_RECORD, seen.AR, arbKey);
const nLH = add(out.LADDER_HISTORY, seen.LH, ladKey);

// borrados sin liquidar → otra vez a pendientes
const settledIds = new Set(out.RECORD.map(r => r.id).filter(Boolean));
const settledSig = new Set(out.RECORD.map(r => `${r.date}|${r.match}|${r.pick}`));
const pendKey = (r) => r.id || recKey(r);
const lostP = [...seen.P.values()].filter(p => !settledIds.has(p.id) && !settledSig.has(`${p.date}|${p.match}|${p.pickLabel || p.pick}`) && !out.PENDING.some(x => pendKey(x) === pendKey(p)));
out.PENDING.push(...lostP);
const lostC = [...seen.CP.entries()].filter(([k, c]) => !isJunkCombo(c) && !out.COMBO_RECORD.some(c => comboKey(c) === k) && !out.COMBO_PENDING.some(c => comboKey(c) === k)).map(([, c]) => c);
out.COMBO_PENDING.push(...lostC);
const lostA = [...seen.AP.entries()].filter(([k]) => !out.ARB_RECORD.some(a => arbKey(a) === k) && !out.ARB_PENDING.some(a => arbKey(a) === k)).map(([, a]) => a);
out.ARB_PENDING.push(...lostA);

fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(`· leídas ${read} versiones de daily.json`);
console.log(`· recuperado al historial: ${nR} picks · ${nCR} combinadas · ${nAR} surebets · ${nLH} retos escalera`);
console.log(`· vuelven a pendientes (se borraron sin resultado): ${lostP.length} picks · ${lostC.length} combinadas · ${lostA.length} surebets`);
lostP.forEach(p => console.log(`    ${p.date} ${p.match} — ${p.pickLabel || p.pick}`));
if (junk.length) console.log(`· descartadas ${junk.length} entradas de prueba de TENIS que no son de esta web: ${junk.map(r => r.match).join(' · ')}`);
if (junkC.length) console.log(`· descartadas ${junkC.length} combinadas de prueba de TENIS: ${junkC.map(c => `${c.date} ${c.name}`).join(' · ')}`);
console.log(`→ ahora: ${out.RECORD.length} picks en historial · ${out.PENDING.length} pendientes · ${out.COMBO_RECORD.length}/${out.COMBO_PENDING.length} combinadas · ${out.ARB_RECORD.length}/${out.ARB_PENDING.length} surebets`);
