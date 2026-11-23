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
async function demarrer() { if (!LS.get('cle')) voir('e-inst'); else if (!seed) { voir('e-ouv'); $('o-s').focus(); } else { voir('e-main'); liste(); } }
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
};
$('b-cp').onclick = (e) => copier($('c-code').value, e.target);
$('b-wa').onclick = () => dernier && wa(dernier);
const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function liste() {
  const q = $('l-q').value.trim().toLowerCase(); const all = LS.get('registre') || [];
  const l = all.filter((x) => !q || [x.magasin, x.telephone, x.machine, x.note].join(' ').toLowerCase().includes(q));
  $('l').innerHTML = l.length ? l.map((x, i) => `<div class="it"><b>${esc(x.magasin)}</b> · ${esc(x.date.slice(0, 10))}<br><span class="m">${esc(x.machine)}</span>${x.telephone ? ` · ${esc(x.telephone)}` : ''}${x.note ? `<br><i>${esc(x.note)}</i>` : ''}
    <div class="row"><button class="b" data-c="${i}">Copier</button>${x.telephone ? `<button class="b" data-w="${i}">WhatsApp</button>` : ''}</div></div>`).join('') : '<p style="color:#889;text-align:center">Aucun appareil.</p>';
  $('l').querySelectorAll('button').forEach((b) => { b.onclick = () => { const x = l[Number(b.dataset.c ?? b.dataset.w)]; if (b.dataset.c !== undefined) copier(x.code, b); else wa(x); }; });
}
$('l-q').oninput = liste;
demarrer();
