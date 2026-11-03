// Gestock Pro — travail de fond Android (toutes les 15 minutes, et à la demande de l'application ouverte)
// Demande au poste serveur ce qui est nouveau et affiche les notifications, sans doublon.
function lireKV(k, d) { try { const r = CapacitorKV.get(k); return r && r.value !== undefined && r.value !== null ? r.value : d; } catch (e) { return d; } }
function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; } return Math.abs(h) % 2000000000; }

addEventListener('config', (resolve, reject, args) => {
  try {
    const d = args || {};
    for (const k of ['serveur', 'token', 'langue', 'actif']) if (d[k] !== undefined) CapacitorKV.set(k, String(d[k]));
    resolve();
  } catch (e) { reject(e); }
});

addEventListener('verifier', async (resolve, reject) => {
  try {
    const serveur = lireKV('serveur', ''); const token = lireKV('token', '');
    if (!serveur || !token || lireKV('actif', '1') !== '1') { resolve(); return; }
    const depuis = lireKV('depuis', '');
    const url = serveur + '/api/telephone/notifications?langue=' + encodeURIComponent(lireKV('langue', 'fr')) + (depuis ? '&depuis=' + encodeURIComponent(depuis) : '');
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token, 'X-Poste': 'Téléphone' } });
    if (!r.ok) { resolve(); return; }
    const d = await r.json();
    let vus = [];
    try { vus = JSON.parse(lireKV('vus', '[]')); } catch (e) { vus = []; }
    const nouvelles = (d.notifications || []).filter((n) => vus.indexOf(n.id) < 0);
    if (nouvelles.length) {
      CapacitorNotifications.schedule(nouvelles.slice(0, 5).map((n) => ({
        id: hash(n.id), title: n.titre, body: n.texte, channelId: 'gestock', extra: { page: n.page || 'accueil' }, autoCancel: true,
      })));
      vus = vus.concat(nouvelles.map((n) => n.id)).slice(-300);
      CapacitorKV.set('vus', JSON.stringify(vus));
    }
    if (d.maintenant) CapacitorKV.set('depuis', d.maintenant);
    resolve();
  } catch (e) { resolve(); }
});
