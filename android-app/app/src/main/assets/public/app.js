'use strict';
const $ = (i) => document.getElementById(i);
const voir = (i) => document.querySelectorAll('.e').forEach((e) => e.classList.toggle('on', e.id === i));
const LS = { get: (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, set: (k, v) => localStorage.setItem(k, JSON.stringify(v)) };
const b64 = (u8) => btoa(String.fromCharCode(...u8)); const deb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64u = (u8) => b64(u8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const enc = new TextEncoder();
let seed = null; let essais = 0; let bloque = 0; let dernier = null;
const ID = /^GSP-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/;
const normId = (s) => { const x = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^GSP/, ''); return x.length === 12 ? `GSP-${x.slice(0, 4)}-${x.slice(4, 8)}-${x.slice(8)}` : String(s || '').trim().toUpperCase(); };
async function cleAes(secret, sel) {
  const base = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: sel, iterations: 310000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
function seedDePem(txt) {
  const der = deb64(txt.replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''));
  if (der.length !== 48 || der[0] !== 0x30) throw new Error();
  return der.slice(16, 48);
}
async function demarrer() { if (!LS.get('cle')) voir('e-inst'); else if (!seed) { voir('e-ouv'); $('o-s').focus(); } else { voir('e-main'); liste(); sync(true); } }
// ---- Synchronisation (1.1.0) : fichier chiffré dans le dépôt privé GitHub, même format que le PC
const DEPOT = 'ounisnounou/gestock-pro-source'; const BRANCHE = 'licences-registre'; const FICHIER_REG = 'registre.enc';
async function cleReg() {
  const h = await crypto.subtle.digest('SHA-256', new Uint8Array([...enc.encode('gestock-registre|'), ...seed]));
  return crypto.subtle.importKey('raw', h, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
async function chiffrerReg(obj) { const iv = crypto.getRandomValues(new Uint8Array(12)); const c = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await cleReg(), enc.encode(JSON.stringify(obj)))); return JSON.stringify({ v: 1, iv: b64(iv), data: b64(c) }); }
async function dechiffrerReg(txt) { const o = JSON.parse(txt); return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deb64(o.iv) }, await cleReg(), deb64(o.data)))); }
async function lireJeton() { const j = LS.get('jeton'); if (!j || !seed) return ''; try { return (await dechiffrerReg(j)).jeton || ''; } catch { return ''; } }
function fusionner(a, b) {
  const m = new Map();
  for (const x of [...a, ...b]) { const k = `${x.date}|${x.machine}`; const y = m.get(k); m.set(k, y ? { ...y, ...x, supprime: !!(y.supprime || x.supprime) } : x); }
  return [...m.values()].sort((x, y) => (x.date < y.date ? 1 : -1));
}
const utf8b64 = (t) => b64(enc.encode(t)); const deutf8b64 = (s) => new TextDecoder().decode(deb64(s.replace(/\s+/g, '')));
async function gh(jeton, methode, url, corps) {
  const r = await fetch(`https://api.github.com${url}`, { method: methode, cache: 'no-store', headers: { Authorization: `Bearer ${jeton}`, Accept: 'application/vnd.github+json', ...(corps ? { 'Content-Type': 'application/json' } : {}) }, body: corps ? JSON.stringify(corps) : undefined });
  let j = null; try { j = await r.json(); } catch { /* */ } return { status: r.status, j };
}
async function synchroniser() {
  const jeton = await lireJeton(); if (!jeton) return { aucun: true };
  try {
    const r = await gh(jeton, 'GET', `/repos/${DEPOT}/contents/${FICHIER_REG}?ref=${BRANCHE}`);
    if (r.status === 401 || r.status === 403) return { erreur: 'Jeton GitHub refusé.' };
    let distant = []; let sha;
    if (r.status === 200) { sha = r.j.sha; distant = await dechiffrerReg(deutf8b64(r.j.content)); }
    else if (r.status === 404) {
      const br = await gh(jeton, 'GET', `/repos/${DEPOT}/git/ref/heads/${BRANCHE}`);
      if (br.status === 404) {
        const d = await gh(jeton, 'GET', `/repos/${DEPOT}`); const h = await gh(jeton, 'GET', `/repos/${DEPOT}/git/ref/heads/${(d.j && d.j.default_branch) || 'main'}`);
        if (h.status !== 200) return { erreur: `Dépôt introuvable (${h.status}).` };
        const c = await gh(jeton, 'POST', `/repos/${DEPOT}/git/refs`, { ref: `refs/heads/${BRANCHE}`, sha: h.j.object.sha });
        if (c.status >= 300) return { erreur: `Branche non créée (${c.status}).` };
      }
    } else return { erreur: `GitHub : ${r.status}` };
    const tout = fusionner(LS.get('registre') || [], distant); LS.set('registre', tout);
    const p = await gh(jeton, 'PUT', `/repos/${DEPOT}/contents/${FICHIER_REG}`, { message: 'Registre des licences', content: utf8b64(await chiffrerReg(tout)), branch: BRANCHE, ...(sha ? { sha } : {}) });
    if (p.status >= 300) return { erreur: `Envoi refusé (${p.status}).` };
    return { ok: true, n: tout.filter((x) => !x.supprime).length };
  } catch (e) { return { erreur: 'Pas de connexion Internet.' }; }
}
async function sync(silence) {
  $('s-etat').textContent = 'Synchronisation…';
  const r = await synchroniser();
  if (r.aucun) $('s-etat').textContent = 'Pas de synchronisation (GitHub)';
  else if (r.erreur) { $('s-etat').textContent = '⚠ ' + r.erreur; if (!silence) alert(r.erreur); }
  else { $('s-etat').textContent = `✓ Synchronisé (${r.n}) ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`; liste(); }
  return r;
}
const qr = (t) => { const q = qrcode(0, 'L'); q.addData(t); q.make(); return q.createSvgTag({ cellSize: 3, margin: 2 }); };
$('b-inst').onclick = async () => {
  $('i-err').textContent = '';
  const s = $('i-s1').value; if (s.length < 6) { $('i-err').textContent = 'Code secret : 6 caractères ou plus.'; return; }
  if (s !== $('i-s2').value) { $('i-err').textContent = 'Les deux codes ne sont pas pareils.'; return; }
  const f = $('i-f').files[0]; if (!f) { $('i-err').textContent = 'Choisissez le fichier gestock-cle.pem.'; return; }
  let sd; try { sd = seedDePem(await f.text()); } catch { $('i-err').textContent = 'Ce fichier n’est pas une clé Gestock (.pem).'; return; }
  const sel = crypto.getRandomValues(new Uint8Array(16)); const iv = crypto.getRandomValues(new Uint8Array(12));
  const c = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await cleAes(s, sel), sd));
  LS.set('cle', { sel: b64(sel), iv: b64(iv), data: b64(c) }); seed = sd; demarrer();
};
const ouvrir = async () => {
  if (Date.now() < bloque) { $('o-err').textContent = `Attendez ${Math.ceil((bloque - Date.now()) / 1000)} s.`; return; }
  const k = LS.get('cle');
  try { seed = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deb64(k.iv) }, await cleAes($('o-s').value, deb64(k.sel)), deb64(k.data))); $('o-s').value = ''; essais = 0; demarrer(); } catch {
    essais += 1; if (essais >= 5) { bloque = Date.now() + 60000; essais = 0; } $('o-err').textContent = 'Code secret incorrect.';
  }
};
$('b-ouv').onclick = ouvrir; $('o-s').onkeydown = (e) => { if (e.key === 'Enter') ouvrir(); };
$('b-lock').onclick = () => { seed = null; demarrer(); };
document.addEventListener('visibilitychange', () => { if (document.hidden) { seed = null; } else demarrer(); });
$('t1').onclick = () => { $('t1').classList.add('on'); $('t2').classList.remove('on'); $('p1').style.display = ''; $('p2').style.display = 'none'; };
$('t2').onclick = () => { $('t2').classList.add('on'); $('t1').classList.remove('on'); $('p2').style.display = ''; $('p1').style.display = 'none'; liste(); };
const wa = (x) => { let t = String(x.telephone || '').replace(/[^\d]/g, ''); if (t.startsWith('0')) t = `213${t.slice(1)}`;
  window.open(`https://wa.me/${t}?text=${encodeURIComponent(`Gestock Pro — code d’activation pour ${x.magasin} (${x.machine}) :\n\n${x.code}\n\nRéglages › Licence › coller le code › Activer.`)}`, '_blank'); };
const copier = async (t, b) => { try { await navigator.clipboard.writeText(t); } catch { const a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); document.execCommand('copy'); a.remove(); } if (b) { const o = b.textContent; b.textContent = '✓'; setTimeout(() => { b.textContent = o; }, 1200); } };
$('b-creer').onclick = () => {
  $('c-err').textContent = ''; if (!seed) return demarrer();
  const m = normId($('c-m').value); const n = $('c-n').value.trim().slice(0, 60);
  if (!ID.test(m)) { $('c-err').textContent = 'Numéro invalide (GSP-XXXX-XXXX-XXXX).'; return; }
  if (!n) { $('c-err').textContent = 'Écrivez le nom du magasin.'; return; }
  const charge = b64u(enc.encode(JSON.stringify({ m, n, t: 'perm', d: new Date().toISOString().slice(0, 10) })));
  const sig = nacl.sign.detached(enc.encode(`GL1.${charge}`), nacl.sign.keyPair.fromSeed(seed).secretKey);
  const code = `GL1.${charge}.${b64u(sig)}`;
  dernier = { date: new Date().toISOString(), machine: m, magasin: n, telephone: $('c-t').value.trim(), note: $('c-x').value.trim(), code };
  const l = LS.get('registre') || []; l.unshift(dernier); LS.set('registre', l);
  $('c-m').value = m; $('c-code').value = code; $('c-pour').textContent = `${n} · ${m}`; $('c-ok').classList.add('on');
  $('c-qr').innerHTML = qr(code); sync(true);
};
$('b-cp').onclick = (e) => copier($('c-code').value, e.target);
$('b-wa').onclick = () => dernier && wa(dernier);
const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function liste() {
  const q = $('l-q').value.trim().toLowerCase(); const all = LS.get('registre') || [];
  const l = all.filter((x) => !x.supprime).filter((x) => !q || [x.magasin, x.telephone, x.machine, x.note].join(' ').toLowerCase().includes(q));
  $('l').innerHTML = l.length ? l.map((x, i) => `<div class="it"><b>${esc(x.magasin)}</b> · ${esc(x.date.slice(0, 10))}<br><span class="m">${esc(x.machine)}</span>${x.telephone ? ` · ${esc(x.telephone)}` : ''}${x.note ? `<br><i>${esc(x.note)}</i>` : ''}
    <div class="row"><button class="b" data-c="${i}">Copier</button>${x.telephone ? `<button class="b" data-w="${i}">WhatsApp</button>` : ''}</div></div>`).join('') : '<p style="color:#889;text-align:center">Aucun appareil.</p>';
  $('l').querySelectorAll('button').forEach((b) => { b.onclick = () => { const x = l[Number(b.dataset.c ?? b.dataset.w)]; if (b.dataset.c !== undefined) copier(x.code, b); else wa(x); }; });
}
$('l-q').oninput = liste;
demarrer();

$('b-sync').onclick = () => sync(false);
$('b-gh').onclick = () => { $('g-err').textContent = ''; $('g-j').value = ''; voir('e-gh'); };
$('b-g-r').onclick = () => voir('e-main');
$('b-g-x').onclick = () => { localStorage.removeItem('jeton'); voir('e-main'); $('s-etat').textContent = 'Pas de synchronisation (GitHub)'; };
$('b-g-ok').onclick = async () => {
  const v = $('g-j').value.trim(); if (!v) { $('g-err').textContent = 'Collez le jeton.'; return; }
  LS.set('jeton', await chiffrerReg({ jeton: v }));
  const r = await synchroniser(); if (r.erreur) { $('g-err').textContent = r.erreur; return; }
  voir('e-main'); $('s-etat').textContent = `✓ Synchronisé (${r.n})`; liste();
};
// Scanner le QR du numéro de l'appareil (ML Kit, scanner Google)
$('b-scan').onclick = async () => {
  const S = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.BarcodeScanner;
  if (!S) { alert('Scanner indisponible.'); return; }
  try {
    const m = await S.isGoogleBarcodeScannerModuleAvailable().catch(() => ({ available: true }));
    if (!m.available) { await S.installGoogleBarcodeScannerModule(); alert('Installation du scanner Google en cours… réessayez dans quelques secondes.'); return; }
    const r = await S.scan({ formats: ['QR_CODE'] });
    const v = r && r.barcodes && r.barcodes[0] && (r.barcodes[0].rawValue || r.barcodes[0].displayValue);
    const id = normId(v);
    if (!ID.test(id)) { alert('Ce QR ne contient pas un numéro Gestock (GSP-…).'); return; }
    $('c-m').value = id; $('c-n').focus();
  } catch (e) { if (!/cancel/i.test(String(e && e.message))) alert(`Scanner : ${e && e.message}`); }
};
