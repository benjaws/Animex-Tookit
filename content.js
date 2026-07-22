// --- CONFIGURATION ---
const BASE_URL = window.location.origin; 
const API_RAPPORT_PREFIX = '/api/v1/report-ac/'; 
const API_FORM_A_PREFIX = '/api/v1/animal-experiment-applications/';
const API_AUTH_PREFIX = '/api/v1/authorizations/'; 
const API_REMARKS_BASE = '/api/v1/remarks'; 
const API_USER = '/api/v1/persons/current-user';
const API_COMMISSION = '/api/v1/commission';
const API_TASK_SEARCH = '/api/v1/task/search';

const SELECTEUR_TITRE = 'h1.type';
const SELECTEUR_TOOLBAR_TASKS = '.ToolbarContainer .btn-toolbar.pull-right';
const DEFAULT_TEMPLATE_FALLBACK = `Bonjour,\n\nVoici une demande pour la commission :\n\nCommissaire 1 :\nCommissaire 2 :\n\nSincères salutations,\n\n{FULLNAME}`;

// Libellés lisibles pour les statuts les plus courants ; les statuts non listés
// s'affichent tels quels (fallback), donc rien n'est jamais masqué.
const LIBELLES_STATUT_TACHE = {
    'RECEIVED': 'Reçues',
    'SUBMITTED': 'Soumises',
    'RESUBMITTED_WITH_ANSWER': 'Resoumises',
    'AWAITING_CM_STATEMENT': 'Attente avis CM',
};
const COULEURS_STATUT_TACHE = {
    'RECEIVED': '#1976D2',
    'SUBMITTED': '#F57C00',
    'RESUBMITTED_WITH_ANSWER': '#6A1B9A',
    'AWAITING_CM_STATEMENT': '#C62828',
};

console.log("Animex Toolkit : V29 (Status Counters) Chargée.");

let urlPrecedente = '';
let currentUserFullName = "[Utilisateur]"; 
let currentCommissionEmails = [];
let extensionActivee = false;

let configColonnes = {
    hideTargetDate: true,
    hideType: true
};
let autoCopyEnabled = true;
let _lastAutoCopyAttemptUrl = '';
let _lastDateAutoCopyAttemptUrl = '';
let _lastDateCopiedValue = '';

// ============================================================
// 🛡️ WAIT LOOP V2 : LE DOM CHECKER
// ============================================================
const checkAppReady = setInterval(() => {
    // Sécurité URL immédiate (EIAM / FEDS / LOGIN)
    const url = window.location.href.toLowerCase();
    if (url.includes('eiam') || url.includes('feds') || url.includes('login') || url.includes('saml')) {
        // On ne log même pas pour rester discret
        return; 
    }

    if (!document.body) return;

    // On cherche l'appli Angular
    const appLoaded = document.querySelector('app-root') || document.querySelector('nav') || document.querySelector('.main-content');

    if (appLoaded) {
        console.log("✅ Animex Toolkit : Application détectée. Démarrage.");
        clearInterval(checkAppReady);
        setTimeout(demarrerExtension, 1000);
    } 
}, 500);


// ============================================================
// DÉMARRAGE
// ============================================================

async function demarrerExtension() {
    // Ultime vérification
    const url = window.location.href.toLowerCase();
    if (url.includes('eiam') || url.includes('feds')) return;

    extensionActivee = true;
    chargerPreferences();

    try {
        const rep = await fetch(`${BASE_URL}${API_USER}`);
        const contentType = rep.headers.get("content-type");
        
        if (rep.ok && contentType && contentType.includes("application/json")) {
            const json = await rep.json();
            if (json.person && json.person.fullName) {
                currentUserFullName = json.person.fullName;
                console.log("👤 Connecté :", currentUserFullName);
            }
        }
    } catch (err) {
        // Silence en cas d'erreur de co
    }

    lancerBouclePrincipale();
}

function lancerBouclePrincipale() {
    setInterval(() => {
        if (!extensionActivee) return;

        const urlActuelle = window.location.href;

        // Si l'utilisateur est redirigé vers eiam en cours de route, on coupe tout
        if (urlActuelle.includes('eiam') || urlActuelle.includes('feds')) {
            extensionActivee = false;
            return;
        }

        if (urlActuelle !== urlPrecedente) {
            urlPrecedente = urlActuelle;
            if (urlActuelle.includes('/formAC/search/')) setTimeout(lancerLePimpRapport, 1000); 
            if (urlActuelle.includes('/application/experiments/search/')) setTimeout(lancerLePimpFormA, 1000);
        }

        if (urlActuelle.includes('/task/list')) {
            nettoyerTableauTaches();
            ajouterOption100();
            afficherCompteursStatuts();
        }

        marquerMiceGM_V13(); 
        marquerSexeNonMixte();
        verifierPopupCommission();
        copierJoursDemandes();
        copierDateVersInput();

    }, 800); 
}

// Copie la valeur de `requestedDays` vers `approvedDays` lorsque la page correspond
function copierJoursDemandes() {
    try {
        if (!autoCopyEnabled) return;
        const href = (window.location.href || '').toLowerCase();
        const hash = (window.location.hash || '').toLowerCase();

        // find elements first — if present, prefer attempting copy regardless of URL
        const requested = document.querySelector('[formcontrolname="requestedDays"]');
        const approved = document.querySelector('[formcontrolname="approvedDays"]');
        if (!requested || !approved) {
            // Détecter les pages gérées par la SPA (hash) ou routes normales
            const isCourseRoute = href.includes('/persons/courses/') || href.includes('/api/v1/persons/courses/') || hash.includes('/persons/courses');
            const isCourseTypeAll = href.includes('coursetype=all') || hash.includes('coursetype=all') || href.includes('courseType=ALL'.toLowerCase());
            if (!isCourseRoute || !isCourseTypeAll) return; // silencieux si hors-sujet
        }

        // avoid repeating attempts on the same URL
        const currentUrl = window.location.href;
        if (_lastAutoCopyAttemptUrl === currentUrl) return;

        const getValue = (el) => {
            if (!el) return '';
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return el.value || '';
            const inp = el.querySelector('input,textarea');
            if (inp) return inp.value || '';
            return el.getAttribute('value') || el.textContent || '';
        };

        const setValue = (el, val) => {
            if (!el) return;
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                el.value = val;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                return;
            }
            const inp = el.querySelector('input,textarea');
            if (inp) {
                inp.value = val;
                inp.dispatchEvent(new Event('input', { bubbles: true }));
                inp.dispatchEvent(new Event('change', { bubbles: true }));
                return;
            }
            try { el.setAttribute('value', val); } catch (e) { console.warn('copierJoursDemandes: setAttribute failed', e); }
        };

        const valReq = (getValue(requested) || '').toString().trim();
        const valApp = (getValue(approved) || '').toString().trim();

        if (valReq === '' ) return; // nothing to copy
        if (valApp !== '') return; // don't overwrite

        // attempt copy once per URL
        setValue(approved, valReq);
        console.log('Animex Toolkit: copied requestedDays -> approvedDays:', valReq);
        try { approved.setAttribute('data-animex-copied', 'true'); } catch (e) {}
        _lastAutoCopyAttemptUrl = currentUrl;
    } catch (err) {
        console.error('Animex Toolkit: copierJoursDemandes error', err);
    }
}

// ============================================================
// LOGIQUE MÉTIER (INCHANGÉE)
// ============================================================

function chargerPreferences() {
    if (chrome.storage && chrome.storage.sync) {
        chrome.storage.sync.get({
            hideTargetDate: true,
            hideType: true,
            enableAutoCopy: true
        }, (items) => {
            configColonnes.hideTargetDate = items.hideTargetDate;
            configColonnes.hideType = items.hideType;
            autoCopyEnabled = items.enableAutoCopy !== false;
        });
    }
}

function verifierPopupCommission() {
    const textarea = document.getElementById('cantonRemarks');
    if (!textarea) return;

    if (!textarea.disabled && !textarea.getAttribute('data-autofilled') && textarea.value.trim() === '') {
        chrome.storage.sync.get({
            commissionTemplate: DEFAULT_TEMPLATE_FALLBACK
        }, (items) => {
            let template = items.commissionTemplate;
            template = template.replace('{FULLNAME}', currentUserFullName);
            textarea.value = template;
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            textarea.setAttribute('data-autofilled', 'true');
            chargerEmailsCommission();
        });
    }

    const btnInvite = document.querySelector('button[aria-label="Send Invite To All"]');
    if (btnInvite && !document.getElementById('animex-email-btn')) {
        const btnEmail = document.createElement('button');
        btnEmail.id = 'animex-email-btn';
        btnEmail.innerHTML = "📧 SEND EMAIL";
        btnEmail.style.cssText = "background-color: #0078D4; color: white; margin-right: 10px; margin-top: 5px; border: none; border-radius: 4px; padding: 6px 12px; font-weight: bold; cursor: pointer; display: inline-block;";
        btnEmail.onclick = (e) => { e.preventDefault(); ouvrirOutlook(textarea.value); };
        btnInvite.parentNode.insertBefore(btnEmail, btnInvite);
    }
}

async function chargerEmailsCommission() {
    try {
        const urlParts = window.location.href.split('/');
        const applicationId = urlParts[urlParts.length - 1];
        const url = `${BASE_URL}${API_COMMISSION}?applicationId=${applicationId}`;
        const rep = await fetch(url);
        const contentType = rep.headers.get("content-type");
        if (rep.ok && contentType && contentType.includes("application/json")) {
            const json = await rep.json();
            currentCommissionEmails = [];
            const membres = json.commissionMembers || json.members || [];
            membres.forEach(m => {
                if (m.person && m.person.email) currentCommissionEmails.push(m.person.email);
            });
        }
    } catch (err) { console.error("Err Email:", err); }
}

function ouvrirOutlook(corpsDuMessage) {
    if (currentCommissionEmails.length === 0) {
        alert("⚠️ Chargement des emails en cours...");
        chargerEmailsCommission(); 
        return;
    }
    const destinataires = currentCommissionEmails.join(';');
    const sujet = "Commission - Demande d'avis";
    const bodyEncoded = encodeURIComponent(corpsDuMessage);
    window.location.href = `mailto:${destinataires}?subject=${encodeURIComponent(sujet)}&body=${bodyEncoded}`;
}

function marquerMiceGM_V13() {
    const elements = document.querySelectorAll('h4, h3, h5, td, span, p, div, li, b, strong, label');
    elements.forEach(el => {
        if (el.getAttribute('data-gm-tagged')) return;
        const texte = el.textContent ? el.textContent.toLowerCase() : "";
        if (texte.includes('mice gm')) {
            const estTitre = ['H1','H2','H3','H4','H5'].includes(el.tagName);
            const estFeuille = el.children.length === 0;
            if (estTitre || estFeuille) {
                el.setAttribute('data-gm-tagged', 'true');
                const badge = document.createElement('span');
                badge.innerHTML = " ⚠️ Genetically modified";
                badge.style.cssText = "color: #c62828; font-weight: bold; font-size: 0.8em; margin-left: 10px; background-color: #ffebee; padding: 2px 6px; border-radius: 4px; border: 1px solid #ffcdd2; display: inline-block; vertical-align: middle;";
                el.appendChild(badge);
            }
        }
    });
}

function marquerSexeNonMixte() {
    const labels = document.querySelectorAll('.screen-reader-text');
    labels.forEach(label => {
        if (label.textContent.trim() === 'Sex:') {
            const container = label.parentElement;
            if (container.getAttribute('data-sex-tagged')) return;
            const texteComplet = container.textContent.toLowerCase();
            const estMaleOuFemale = /\b(male|female)\b/i.test(texteComplet);
            const estMixed = texteComplet.includes('mixed');
            if (estMaleOuFemale && !estMixed) {
                container.setAttribute('data-sex-tagged', 'true');
                const badge = document.createElement('span');
                badge.innerHTML = " ⚠️ Not Mixed";
                badge.style.cssText = "color: #c62828; font-weight: bold; font-size: 0.85em; margin-left: 8px; background-color: #ffebee; padding: 2px 6px; border-radius: 4px; border: 1px solid #ffcdd2; display: inline-block; vertical-align: middle;";
                container.appendChild(badge);
            }
        }
    });
}

function nettoyerTableauTaches() {
    let colonnesACacher = [];
    if (configColonnes.hideTargetDate) colonnesACacher.push('TARGET DATE');
    if (configColonnes.hideType) colonnesACacher.push('TYPE');
    if (colonnesACacher.length === 0) return;

    const tables = document.querySelectorAll('table');
    tables.forEach(table => {
        const headers = table.querySelectorAll('th');
        if (headers.length === 0) return;
        let indicesA_Cacher = [];
        headers.forEach((th, index) => {
            const titre = th.textContent.toUpperCase().trim();
            const estInterdite = colonnesACacher.some(mot => titre.includes(mot));
            if (estInterdite) {
                if (th.style.display !== 'none') th.style.display = 'none';
                indicesA_Cacher.push(index); 
            }
        });
        if (indicesA_Cacher.length > 0) {
            const rows = table.querySelectorAll('tbody tr');
            rows.forEach(row => {
                const cells = row.querySelectorAll('td');
                indicesA_Cacher.forEach(idx => { 
                    if (cells[idx] && cells[idx].style.display !== 'none') cells[idx].style.display = 'none'; 
                });
            });
        }
    });
}

async function lancerLePimpFormA() {
    setTimeout(() => { marquerMiceGM_V13(); marquerSexeNonMixte(); }, 1000);
    if (document.getElementById('animex-remarks-btn')) return;
    const titre = document.querySelector(SELECTEUR_TITRE);
    if (!titre || !titre.innerText.includes('Form A')) { setTimeout(lancerLePimpFormA, 1000); return; }
    try {
        const urlParts = window.location.href.split('/');
        const applicationId = urlParts[urlParts.length - 1]; 
        const repFormA = await fetch(`${BASE_URL}${API_FORM_A_PREFIX}${applicationId}`);
        const contentType = repFormA.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) return;
        const jsonFormA = await repFormA.json();
        let dossierId = jsonFormA.experiment?.id;
        if (!dossierId && jsonFormA.dossier?.id) dossierId = jsonFormA.dossier.id;
        if (!dossierId) return;
        const urlRemarks = `${BASE_URL}${API_REMARKS_BASE}?page=0&size=100&form=FORM_A&applicationId=${applicationId}&dossierId=${dossierId}`;
        const repRemarks = await fetch(urlRemarks);
        if (!repRemarks.ok) return;
        const jsonRemarks = await repRemarks.json();
        let listeBrute = [];
        if (Array.isArray(jsonRemarks.content)) listeBrute = jsonRemarks.content;
        else if (jsonRemarks.remarks && Array.isArray(jsonRemarks.remarks.content)) listeBrute = jsonRemarks.remarks.content;
        else if (Array.isArray(jsonRemarks)) listeBrute = jsonRemarks;
        if (listeBrute.length > 0) {
            const listeFormatee = listeBrute.map(r => {
                const date = r.createdOn ? new Date(r.createdOn).toLocaleDateString() : 'Date inconnue';
                const auteur = r.modifiedBy || 'Système';
                const texteBrut = r.text || '';
                return `<strong>${date} (${auteur}) :</strong><br>${texteBrut}`;
            });
            afficherBoutonRemarks(listeFormatee);
        }
    } catch (err) { console.error("Animex Toolkit Error:", err); }
}

async function lancerLePimpRapport() {
    if (document.getElementById('animex-cantonal-badge')) return;
    const titre = document.querySelector(SELECTEUR_TITRE);
    if (!titre) { setTimeout(lancerLePimpRapport, 1000); return; }
    try {
        const urlParts = window.location.href.split('/');
        const reportId = urlParts[urlParts.length - 1]; 
        const repRapport = await fetch(`${BASE_URL}${API_RAPPORT_PREFIX}${reportId}`);
        const contentType = repRapport.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) return;
        const jsonRapport = await repRapport.json();
        const formAId = jsonRapport.applicationExperiments?.id;
        if (!formAId) return;
        const repFormA = await fetch(`${BASE_URL}${API_FORM_A_PREFIX}${formAId}`);
        const jsonFormA = await repFormA.json();
        if (jsonFormA.cantonalNumber) afficherBadgeVert(jsonFormA.cantonalNumber, formAId);
        let authId = formAId; 
        if (jsonFormA.latestAuthorization?.id) authId = jsonFormA.latestAuthorization.id;
        else if (jsonFormA.authorization?.id) authId = jsonFormA.authorization.id;
        const repAuth = await fetch(`${BASE_URL}${API_AUTH_PREFIX}${authId}/summary`);
        if (repAuth.ok) {
            const jsonAuth = await repAuth.json();
            const provisions = jsonAuth.specialProvisions;
            const requirements = jsonAuth.requirements;
            const hasP = provisions && provisions.replace(/<[^>]*>?/gm, '').trim().length > 0;
            const hasR = requirements && requirements.replace(/<[^>]*>?/gm, '').trim().length > 0;
            if (hasP || hasR) {
                let html = "";
                if (hasP) html += `<h3 style="color:#d32f2f; margin-top:0;">Special Provisions</h3><div style="margin-bottom: 20px;">${provisions}</div>`;
                if (hasR) { if (hasP) html += "<hr>"; html += `<h3 style="color:#d32f2f; margin-top:0;">Requirements</h3><div>${requirements}</div>`; }
                afficherBoutonCharges(html);
            }
        }
    } catch (err) { console.error("Animex Toolkit Error:", err); }
}

function afficherBoutonRemarks(listeTextes) {
    const titre = document.querySelector(SELECTEUR_TITRE);
    if (titre && !document.getElementById('animex-remarks-btn')) {
        const btn = document.createElement('button');
        btn.id = 'animex-remarks-btn';
        btn.innerHTML = `📝 REMARKS (${listeTextes.length})`;
        btn.style.cssText = "background-color: #F57C00; color: white; font-size: 0.6em; padding: 4px 8px; border: none; border-radius: 4px; vertical-align: middle; margin-left: 10px; font-weight: bold; cursor: pointer; box-shadow: 0 2px 2px rgba(0,0,0,0.2); transition: transform 0.1s;";
        btn.onmousedown = () => btn.style.transform = "scale(0.95)";
        btn.onmouseup = () => btn.style.transform = "scale(1)";
        btn.onclick = (e) => {
            e.preventDefault();
            const htmlContent = listeTextes.join('<hr style="margin: 15px 0; border: 0; border-top: 1px solid #eee;">');
            creerEtOuvrirPopup("📝 Remarks & History", htmlContent);
        };
        titre.appendChild(btn);
    }
}

function afficherBadgeVert(texte, idLicence) {
    const titre = document.querySelector(SELECTEUR_TITRE);
    if (titre && !document.getElementById('animex-cantonal-badge')) {
        const badge = document.createElement('span');
        badge.id = 'animex-cantonal-badge';
        badge.innerText = ` 🏷️ ${texte} 🔗`; 
        badge.style.cssText = "background-color: #2E7D32; color: white; font-size: 0.6em; padding: 4px 8px; border-radius: 4px; vertical-align: middle; margin-left: 15px; font-weight: normal; letter-spacing: 1px; cursor: pointer; transition: transform 0.1s;";
        badge.onclick = () => { window.open(`${window.location.origin}/#/application/experiments/search/${idLicence}`, '_blank'); };
        titre.appendChild(badge);
    }
}

function afficherBoutonCharges(htmlContent) {
    const titre = document.querySelector(SELECTEUR_TITRE);
    if (titre && !document.getElementById('animex-charges-btn')) {
        const btn = document.createElement('button');
        btn.id = 'animex-charges-btn';
        btn.innerHTML = "⚠️ CHARGES";
        btn.style.cssText = "background-color: #d32f2f; color: white; font-size: 0.6em; padding: 4px 8px; border: none; border-radius: 4px; vertical-align: middle; margin-left: 10px; font-weight: bold; cursor: pointer;";
        btn.onclick = (e) => { e.preventDefault(); creerEtOuvrirPopup("⚠️ Charges & Restrictions", htmlContent); };
        titre.appendChild(btn);
    }
}

function ajouterOption100() {
    const select = document.querySelector('select[aria-label="Select number of results per page to display"]');
    if (select && !select.querySelector('option[value="100"]')) {
        const option = document.createElement('option');
        option.value = "100"; option.innerText = "100"; option.classList.add("ng-star-inserted");
        select.appendChild(option);
    }
}

let _statusCountersEnCours = false; // évite les rafales de requêtes : la boucle principale tourne toutes les 800ms
let _statusCountersDerniereTentative = 0; // timestamp du dernier essai (réussi ou raté)
let _statusCountersEchecsConsecutifs = 0;
const STATUS_COUNTERS_COOLDOWN_MS = 5 * 60 * 1000; // 5 min minimum entre deux tentatives après un échec
const STATUS_COUNTERS_MAX_ECHECS = 3; // au-delà, on abandonne pour le reste de la session (jusqu'à F5)

// Récupère les tâches actives (DRAFT/PENDING/VALID, comme le filtre par défaut
// de la liste) et affiche des pastilles de comptage par statut dans la barre
// d'outils au-dessus du tableau. Une seule tentative par instance de page
// (comme afficherBadgeVert/afficherBoutonRemarks) : recalculé si Angular
// recharge la page (navigation SPA).
//
// IMPORTANT : ne doit jamais insister en cas d'échec (risque de blocage/ban
// côté serveur fédéral). En cas d'erreur : pas de nouvelle tentative avant
// 5 minutes, et abandon complet après 3 échecs consécutifs pour la session.
//
// Pagine avec la même taille de page que l'appli (size=10) : une taille trop
// grande (ex: 500) faisait répondre le serveur en 405.
async function afficherCompteursStatuts() {
    if (document.getElementById('animex-status-counters')) return;
    if (_statusCountersEnCours) return; // une requête est déjà en vol, on ne relance pas par-dessus
    if (_statusCountersEchecsConsecutifs >= STATUS_COUNTERS_MAX_ECHECS) return; // abandon définitif pour cette session

    const maintenant = Date.now();
    if (_statusCountersDerniereTentative && (maintenant - _statusCountersDerniereTentative) < STATUS_COUNTERS_COOLDOWN_MS) return; // cooldown après un échec

    const toolbar = document.querySelector(SELECTEUR_TOOLBAR_TASKS);
    if (!toolbar) return;

    _statusCountersEnCours = true;
    _statusCountersDerniereTentative = maintenant;
    let echec = false;
    try {
        const TAILLE_PAGE = 10;
        const MAX_PAGES = 10; // garde-fou (jusqu'à 100 tâches) pour ne jamais boucler indéfiniment
        let taches = [];

        for (let page = 0; page < MAX_PAGES; page++) {
            const url = `${BASE_URL}${API_TASK_SEARCH}?page=${page}&size=${TAILLE_PAGE}&direction=DESC&property=createdOn&activestatus=DRAFT&activestatus=PENDING&activestatus=VALID`;
            // POST requis (405 en GET) ; Content-Type + corps JSON requis (415 sinon) ;
            // Accept-Language doit être une valeur simple, le serveur rejette le format
            // composé envoyé par défaut par le navigateur (ex: "fr-CH,fr;q=0.9") en 400.
            const rep = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept-Language': 'fr-CH'
                },
                body: '{}'
            });
            const contentType = rep.headers.get("content-type");
            if (!rep.ok || !contentType || !contentType.includes("application/json")) {
                console.warn('Animex Toolkit: réponse inattendue de task/search', rep.status, url);
                if (page === 0) echec = true; // rien récupéré du tout : vrai échec, on recule
                break;
            }
            const json = await rep.json();
            const pageContent = Array.isArray(json.content) ? json.content : [];
            taches = taches.concat(pageContent);
            const totalElements = json.totalElements || taches.length;
            if (taches.length >= totalElements || pageContent.length === 0) break;
        }

        if (echec) {
            _statusCountersEchecsConsecutifs++;
            console.warn(`Animex Toolkit: échec compteurs statuts (${_statusCountersEchecsConsecutifs}/${STATUS_COUNTERS_MAX_ECHECS}), pas de nouvel essai avant ${STATUS_COUNTERS_COOLDOWN_MS / 60000} min.`);
            return;
        }
        if (taches.length === 0) return; // pas d'échec réseau, juste aucune tâche active : rien à afficher
        _statusCountersEchecsConsecutifs = 0; // ce passage a fonctionné, on repart à zéro

        if (document.getElementById('animex-status-counters')) return; // recheck après les await (course évitée par le flag, sécurité en plus)

        const compteurs = {};
        taches.forEach(t => {
            const statut = t.status || (t.experiment && t.experiment.status) || 'AUTRE';
            compteurs[statut] = (compteurs[statut] || 0) + 1;
        });
        const entrees = Object.entries(compteurs).sort((a, b) => b[1] - a[1]);

        const container = document.createElement('div');
        container.id = 'animex-status-counters';
        container.style.cssText = 'display:inline-flex; align-items:center; gap:6px; margin-right:10px; vertical-align:middle;';

        const total = document.createElement('span');
        total.innerText = `${taches.length} tâche${taches.length > 1 ? 's' : ''}`;
        total.style.cssText = 'font-size:0.75em; color:#555; font-weight:bold; margin-right:4px;';
        container.appendChild(total);

        entrees.forEach(([statut, nb]) => {
            const pill = document.createElement('span');
            const libelle = LIBELLES_STATUT_TACHE[statut] || statut;
            pill.innerText = `${libelle} : ${nb}`;
            pill.title = statut;
            const couleur = COULEURS_STATUT_TACHE[statut] || '#616161';
            pill.style.cssText = `background-color:${couleur}; color:white; font-size:0.7em; font-weight:bold; padding:3px 8px; border-radius:10px; display:inline-block; white-space:nowrap;`;
            container.appendChild(pill);
        });

        toolbar.appendChild(container);
    } catch (err) {
        _statusCountersEchecsConsecutifs++;
        console.error(`Animex Toolkit: afficherCompteursStatuts error (${_statusCountersEchecsConsecutifs}/${STATUS_COUNTERS_MAX_ECHECS}), pas de nouvel essai avant ${STATUS_COUNTERS_COOLDOWN_MS / 60000} min.`, err);
    } finally {
        _statusCountersEnCours = false;
    }
}

function creerEtOuvrirPopup(titreHeader, contenuHtml) {
    try {
        // Remplacer le popup modal par l'ouverture d'une nouvelle fenêtre (pas d'overlay)
        const w = window.open('', '_blank');
        if (!w) {
            // fallback : écrire dans un élément non-modal sous le titre
            const titre = document.querySelector(SELECTEUR_TITRE) || document.body;
            const containerId = 'animex-inline-popup';
            let cont = document.getElementById(containerId);
            if (cont) cont.remove();
            cont = document.createElement('div');
            cont.id = containerId;
            cont.style.cssText = 'background:#fff;border:1px solid #ddd;padding:12px;margin-top:12px;border-radius:6px;max-width:90%;box-shadow:0 2px 6px rgba(0,0,0,0.08);';
            cont.innerHTML = `<div style="font-weight:700;margin-bottom:8px;">${titreHeader}</div><div>${contenuHtml}</div>`;
            if (titre.parentNode) titre.parentNode.insertBefore(cont, titre.nextSibling);
            return;
        }
        const html = `<!doctype html><html><head><meta charset="utf-8"><title>${titreHeader}</title><style>body{font-family:sans-serif;padding:18px;color:#222} h1{font-size:18px} .content{line-height:1.4}</style></head><body><h1>${titreHeader}</h1><div class="content">${contenuHtml}</div></body></html>`;
        w.document.open();
        w.document.write(html);
        w.document.close();
    } catch (e) {
        console.error('creerEtOuvrirPopup fallback error', e);
    }
}

// Copie la date depuis <td headers="cpToDate"> vers l'input ayant l'id "lastAttendedDay"
function copierDateVersInput() {
    try {
        const input = document.getElementById('lastAttendedDay');
        if (!input) return;

        const currentUrl = window.location.href;

        const td = document.querySelector('td[headers="cpToDate"]');
        if (!td) return;
        const dateText = (td.textContent || '').trim();
        if (!dateText) return;

        // Ne pas écraser une valeur déjà présente
        if (input.value && input.value.toString().trim() !== '') return;

        // Eviter répétitions inutiles sur la même page
        if (_lastDateCopiedValue === dateText && _lastDateAutoCopyAttemptUrl === currentUrl) return;

        input.value = dateText;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));

        _lastDateAutoCopyAttemptUrl = currentUrl;
        _lastDateCopiedValue = dateText;
        console.log('Animex Toolkit: copied cpToDate -> #lastAttendedDay', dateText);
    } catch (err) {
        console.error('Animex Toolkit: copierDateVersInput error', err);
    }
}