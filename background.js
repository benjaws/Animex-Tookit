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
