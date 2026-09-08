// Service worker : seul contexte d'où chrome.downloads est accessible. Le
// content script ne peut que signaler la pièce jointe à enregistrer, il n'a pas
// accès à l'API de téléchargement.

const DOSSIER = 'certificats';

// Téléchargements lancés par nous, en attente de leur nom définitif. Le nom du
// fichier n'est connu qu'au moment où Chrome le détermine, à partir de l'en-tête
// renvoyé par le serveur : forcer un nom à l'appel écraserait celui d'origine,
// que l'utilisateur veut conserver.
const enAttenteDeNom = new Set();

chrome.runtime.onMessage.addListener((message, _expediteur, repondre) => {
    if (!message || message.type !== 'telecharger-certificat' || !message.url) return;

    chrome.downloads.download({ url: message.url }, (downloadId) => {
        if (chrome.runtime.lastError || downloadId === undefined) {
            const detail = chrome.runtime.lastError?.message || 'identifiant absent';
            console.error('[Animex Toolkit] Téléchargement refusé :', detail);
            repondre({ ok: false, error: detail });
            return;
        }
        enAttenteDeNom.add(downloadId);
        repondre({ ok: true, downloadId });
    });

    return true; // réponse asynchrone
});

// Range le fichier sans toucher à son nom. L'événement concerne tous les
// téléchargements du navigateur : on ne se prononce que sur les nôtres, sans
// quoi l'extension déplacerait les fichiers que l'utilisateur télécharge
// lui-même.
chrome.downloads.onDeterminingFilename.addListener((item, suggerer) => {
    if (!enAttenteDeNom.has(item.id)) return false;
    enAttenteDeNom.delete(item.id);
    suggerer({ filename: `${DOSSIER}/${item.filename}`, conflictAction: 'uniquify' });
    return true;
});
