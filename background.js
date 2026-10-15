// Service worker : seul contexte d'où chrome.downloads est accessible. Le
// content script ne peut pas ranger un fichier lui-même.

const DOSSIER = 'certificats';
const DOMAINE = 'animex-ch.blv.admin.ch';

// Le lien du modal ne porte pas d'URL : c'est Angular qui produit le fichier au
// clic. Il n'y a donc rien à télécharger nous-mêmes, seulement à reconnaître le
// fichier qui arrive. Le content script ouvre une courte fenêtre avant de
// cliquer, et le premier téléchargement venu d'Animex pendant cette fenêtre est
// rangé dans le dossier des certificats.
const FENETRE_MS = 15000;
let attenteJusqua = 0;

chrome.runtime.onMessage.addListener((message, _expediteur, repondre) => {
    if (!message) return;

    if (message.type === 'attendre-certificat') {
        attenteJusqua = Date.now() + FENETRE_MS;
        repondre({ ok: true });
        return true;
    }

    // Téléchargement d'une URL connue : plus sûr, employé si un jour le lien
    // en porte une.
    if (message.type === 'telecharger-certificat' && message.url) {
        chrome.downloads.download({ url: message.url }, (downloadId) => {
            if (chrome.runtime.lastError || downloadId === undefined) {
                const detail = chrome.runtime.lastError?.message || 'identifiant absent';
                console.error('[Animex Toolkit] Téléchargement refusé :', detail);
                repondre({ ok: false, error: detail });
                return;
            }
            attenteJusqua = Date.now() + FENETRE_MS;
            repondre({ ok: true, downloadId });
        });
        return true;
    }
});

/**
 * Range le fichier sans toucher à son nom, que le serveur seul détermine.
 *
 * L'événement voit tous les téléchargements du navigateur : hors de la fenêtre
 * ouverte par le clic, ou venu d'un autre site, on ne se prononce pas — déplacer
 * les fichiers que l'utilisateur télécharge lui-même serait inacceptable.
 */
chrome.downloads.onDeterminingFilename.addListener((item, suggerer) => {
    if (Date.now() > attenteJusqua) return false;

    const provenance = `${item.url || ''} ${item.referrer || ''}`;
    // Un fichier produit par la page est servi en blob: ou data:, sans trace du
    // domaine dans l'URL ; le référent, lui, le porte encore.
    const vientDAnimex = provenance.includes(DOMAINE)
        || (item.url || '').startsWith('blob:')
        || (item.url || '').startsWith('data:');
    if (!vientDAnimex) return false;

    attenteJusqua = 0; // un clic, un fichier
    suggerer({ filename: `${DOSSIER}/${item.filename}`, conflictAction: 'uniquify' });
    return true;
});

// ── Rappel commission par ntfy ───────────────────────────────────────────
// La commission a 30 jours pour répondre à partir du clic sur SEND EMAIL.
//
// ntfy.sh ne garde un message programmé que 3 jours : on ne peut pas lui
// confier l'échéance dès le clic. Les rappels sont donc gardés ici, et une
// vérification régulière les confie à ntfy dans les 3 jours qui précèdent.
// Le message part alors à l'heure même si Chrome est fermé ce jour-là. Si
// Chrome est resté fermé pendant toute cette fenêtre, il part à la
// vérification suivante, en retard plutôt que jamais.
//
// Aucun appel au portail Animex ici : seul ntfy est contacté.

const DELAI_COMMISSION_JOURS = 30;
const HEURE_RAPPEL = 9;
const AVANCE_NTFY_MS = 3 * 86400000 - 3600000; // marge sous la limite de 3 jours
const ALARME = 'rappels-commission';

function echeanceDepuis(envoyeLe) {
    const d = new Date(envoyeLe);
    d.setDate(d.getDate() + DELAI_COMMISSION_JOURS);
    d.setHours(HEURE_RAPPEL, 0, 0, 0);
    return d.getTime();
}

async function reglagesNtfy() {
    const r = await chrome.storage.sync.get({ ntfyTopic: '', ntfyServeur: '' });
    return { topic: r.ntfyTopic.trim(), serveur: (r.ntfyServeur.trim() || 'https://ntfy.sh').replace(/\/+$/, '') };
}

// Paramètres dans l'URL et corps en texte brut : requête « simple », sans
// pré-vol CORS, donc sans permission d'hôte supplémentaire pour ntfy.
async function envoyerNtfy({ topic, serveur }, message, { titre, aLHeure } = {}) {
    if (!topic) throw new Error('canal ntfy non réglé');
    const params = new URLSearchParams({ title: titre || 'Animex Toolkit', tags: 'bell' });
    if (aLHeure && aLHeure > Date.now() + 60000) params.set('at', String(Math.floor(aLHeure / 1000)));
    const rep = await fetch(`${serveur}/${encodeURIComponent(topic)}?${params}`, { method: 'POST', body: message });
    if (!rep.ok) throw new Error(`ntfy a répondu ${rep.status} : ${(await rep.text()).slice(0, 200)}`);
}

async function verifierRappels() {
    const { rappelsCommission = {} } = await chrome.storage.local.get('rappelsCommission');
    const reglages = await reglagesNtfy();
    if (!reglages.topic) return;

    let modifie = false;
    for (const r of Object.values(rappelsCommission)) {
        if (r.envoye || r.echeance - Date.now() > AVANCE_NTFY_MS) continue;
        const date = new Date(r.echeance).toLocaleDateString('fr-CH');
        try {
            await envoyerNtfy(reglages,
                `${r.ref} : les ${DELAI_COMMISSION_JOURS} jours de la commission arrivent à échéance (${date}). Mail envoyé le ${new Date(r.envoyeLe).toLocaleDateString('fr-CH')}.`,
                { titre: 'Délai commission atteint', aLHeure: r.echeance });
            r.envoye = Date.now();
            modifie = true;
        } catch (e) {
            // Pas de nouvel essai immédiat : la prochaine vérification réessaiera.
            console.error('[Animex Toolkit] Rappel ntfy', r.ref, e.message);
        }
    }

    // Ménage : un rappel confié à ntfy depuis plus de 60 jours ne sert plus.
    for (const [cle, r] of Object.entries(rappelsCommission)) {
        if (r.envoye && Date.now() - r.envoye > 60 * 86400000) { delete rappelsCommission[cle]; modifie = true; }
    }
    if (modifie) await chrome.storage.local.set({ rappelsCommission });
}

function armerAlarme() {
    chrome.alarms.get(ALARME, (a) => { if (!a) chrome.alarms.create(ALARME, { periodInMinutes: 360, delayInMinutes: 1 }); });
}

chrome.runtime.onInstalled.addListener(() => { armerAlarme(); verifierRappels(); });
chrome.runtime.onStartup.addListener(() => { armerAlarme(); verifierRappels(); });
chrome.alarms.onAlarm.addListener((a) => { if (a.name === ALARME) verifierRappels(); });

chrome.runtime.onMessage.addListener((message, _expediteur, repondre) => {
    if (message?.type === 'programmer-rappel-commission') {
        (async () => {
            const { rappelsCommission = {} } = await chrome.storage.local.get('rappelsCommission');
            const ref = String(message.ref || 'Dossier').slice(0, 200);
            // Un nouvel envoi du même dossier repart de zéro : c'est la dernière
            // demande qui fait courir le délai.
            rappelsCommission[ref] = { ref, envoyeLe: message.envoyeLe, echeance: echeanceDepuis(message.envoyeLe), envoye: null };
            await chrome.storage.local.set({ rappelsCommission });
            armerAlarme();
            repondre({ ok: true });
        })();
        return true;
    }

    if (message?.type === 'tester-ntfy') {
        const serveur = (message.serveur || 'https://ntfy.sh').replace(/\/+$/, '');
        envoyerNtfy({ topic: message.topic, serveur }, 'Test : les rappels de la commission arriveront ici.', { titre: 'Animex Toolkit' })
            .then(() => repondre({ ok: true }))
            .catch((e) => repondre({ ok: false, error: e.message }));
        return true;
    }
});
