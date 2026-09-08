// --- CONFIGURATION ---
const BASE_URL = window.location.origin; 
const API_RAPPORT_PREFIX = '/api/v1/report-ac/'; 
const API_FORM_A_PREFIX = '/api/v1/animal-experiment-applications/';
const API_AUTH_PREFIX = '/api/v1/authorizations/'; 
const API_REMARKS_BASE = '/api/v1/remarks'; 
const API_USER = '/api/v1/persons/current-user';
const API_COMMISSION = '/api/v1/commission';
const API_TASK_SEARCH = '/api/v1/task/search';
const API_DOSSIER_PREFIX = '/api/v1/animal-experiments/dossier/';

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
// Membres complets (prénom, nom, rôle) et pas seulement leurs adresses : le
// cahier de suivi note les commissaires par leur prénom.
let currentCommissionMembers = [];
// Référence du dossier ("SC 36751 - VD4006b") utilisée comme objet du mail.
let currentDossierRef = '';
let extensionActivee = false;

let configColonnes = {
    hideTargetDate: true,
    hideType: true
};
let autoCopyEnabled = true;
// URL pour laquelle les destinataires de commission ont déjà été demandés :
// évite de rappeler l'API à chaque tick du MutationObserver.
let _emailsChargesPourUrl = '';
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
        marquerAnnonces();
        verifierPopupCommission();
        copierJoursDemandes();
        copierDateVersInput();
        telechargerCertificatDuModal();

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
    if (!textarea) {
        // Popup fermé : on réarme pour la prochaine demande consultée.
        _emailsChargesPourUrl = '';
        return;
    }

    // Les destinataires étaient chargés uniquement dans la branche
    // d'auto-remplissage ci-dessous, qui ne s'exécute que sur un textarea vide.
    // Rouvrir le popup, ou revenir sur un avis déjà rédigé, laissait donc la
    // liste vide et le bouton SEND EMAIL ne savait à qui écrire — il affichait
    // « Chargement des emails en cours… » sans jamais aboutir. Le chargement
    // appartient à l'ouverture du popup, pas au remplissage du texte.
    if (_emailsChargesPourUrl !== window.location.href) {
        _emailsChargesPourUrl = window.location.href;
        chargerEmailsCommission();
    }

    if (!textarea.disabled && !textarea.getAttribute('data-autofilled') && textarea.value.trim() === '') {
        chrome.storage.sync.get({
            commissionTemplate: DEFAULT_TEMPLATE_FALLBACK
        }, (items) => {
            let template = items.commissionTemplate;
            template = template.replace('{FULLNAME}', currentUserFullName);
            textarea.value = template;
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            textarea.setAttribute('data-autofilled', 'true');
        });
    }

    poserSelecteursCommissaires(textarea);

    const btnInvite = document.querySelector('button[aria-label="Send Invite To All"]');
    if (btnInvite && !document.getElementById('animex-email-btn')) {
        const btnEmail = document.createElement('button');
        btnEmail.id = 'animex-email-btn';
        btnEmail.innerHTML = "📧 SEND EMAIL";
        btnEmail.style.cssText = "background-color: #0078D4; color: white; margin-right: 10px; margin-top: 5px; border: none; border-radius: 4px; padding: 6px 12px; font-weight: bold; cursor: pointer; display: inline-block;";
        btnEmail.onclick = (e) => {
            e.preventDefault();
            ouvrirOutlook(textarea.value).catch(err => {
                console.error('Animex Toolkit: envoi email', err);
                alert("⚠️ Erreur pendant la préparation du mail — détail dans la console (F12).");
            });
        };
        btnInvite.parentNode.insertBefore(btnEmail, btnInvite);
    }
}

/**
 * Dernier segment d'identifiant de l'URL courante.
 * Le simple href.split('/').pop() ramenait la query string avec lui
 * (« 1234?tab=x »), et l'API répondait alors en erreur — silencieusement, le
 * catch de l'appelant se contentant de logger. Le routage Angular passant par
 * le hash, on le lit en priorité.
 */
function extraireIdDeLUrl() {
    const source = window.location.hash
        ? window.location.hash.replace(/^#/, '')
        : window.location.pathname;
    const sansQuery = source.split('?')[0].split(';')[0].replace(/\/+$/, '');
    return sansQuery.split('/').pop() || '';
}

/**
 * Destinataires de commission, lus dans la réponse de /api/v1/commission.
 *
 * Le code d'origine lisait json.commissionMembers, alors que la réponse imbrique
 * le tout sous applicationCommission : la liste repartait donc toujours vide, et
 * le bouton SEND EMAIL restait sans destinataire alors que la requête avait
 * parfaitement abouti. On retrouve désormais le tableau des membres où qu'il
 * soit dans la réponse, ce qui rend l'extraction insensible à un niveau
 * d'imbrication qui changerait à nouveau.
 *
 * Volontairement ciblé sur ce tableau, et non sur toute chaîne ayant la forme
 * d'un email : la réponse contient aussi cantonRemarks — le texte libre de
 * l'avis — et un bloc canton. Y pêcher une adresse au hasard reviendrait à
 * envoyer un avis de commission à quelqu'un qui n'a rien à en connaître.
 */
function trouverMembresCommission(donnees, profondeur = 0) {
    if (!donnees || typeof donnees !== 'object' || profondeur > 8) return null;

    for (const cle of ['commissionMembers', 'members']) {
        if (Array.isArray(donnees[cle]) && donnees[cle].length > 0) return donnees[cle];
    }

    for (const valeur of Object.values(donnees)) {
        if (valeur && typeof valeur === 'object') {
            const trouve = trouverMembresCommission(valeur, profondeur + 1);
            if (trouve) return trouve;
        }
    }
    return null;
}

/**
 * Adresses des membres, dédoublonnées. Un membre peut porter son email sur la
 * personne ou à plat selon les endpoints ; les deux sont acceptés.
 */
function collecterMembres(donnees) {
    const membres = trouverMembresCommission(donnees);
    if (!membres) return [];

    const retenus = [];
    const vus = new Set();
    const FORME_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

    membres.forEach(membre => {
        const personne = membre?.person || {};
        const brut = personne.email || personne.emailAddress
            || membre?.email || membre?.emailAddress || '';
        const email = String(brut).trim();
        if (!FORME_EMAIL.test(email) || vus.has(email.toLowerCase())) return;
        vus.add(email.toLowerCase());

        // Le prénom vient de l'API et non du texte de l'avis : c'est sous cette
        // forme que le cahier de suivi désigne les commissaires. Repli sur le
        // premier mot du nom complet quand firstName n'est pas renseigné.
        const prenom = (personne.firstName || '').trim()
            || String(personne.fullName || '').trim().split(/\s+/)[0]
            || '';

        retenus.push({
            email,
            prenom,
            nomFamille: (personne.lastName || '').trim(),
            nomComplet: (personne.fullName || `${personne.firstName || ''} ${personne.lastName || ''}`).trim() || email,
            role: membre?.roleAbbreviation || membre?.role || '',
        });
        // Le rôle est journalisé pour repérer d'un coup d'oeil un destinataire
        // qui n'aurait rien à faire dans la liste.
        console.log(`Animex Toolkit: membre ${retenus[retenus.length - 1].nomComplet} (${retenus[retenus.length - 1].role || 'rôle inconnu'})`);
    });
    return retenus;
}

/**
 * Référence du dossier, telle que la commission la cite : « SC 36751 - VD4006b ».
 *
 * Elle vit dans /animal-experiments/dossier/{dossierId}?applicationId={id}, qui
 * réclame un dossierId absent de l'identifiant déjà connu. Il est cherché dans
 * l'URL — les écrans du dossier le portent — puis, à défaut, dans la demande
 * elle-même, dont la réponse référence son dossier. Renvoie une chaîne vide
 * plutôt que d'échouer : un objet de mail ne vaut pas d'empêcher un envoi.
 */
async function chargerReferenceDossier(applicationId) {
    const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
    const candidats = [];
    const ajouter = (uuid) => {
        if (!uuid) return;
        if (uuid.toLowerCase() === String(applicationId).toLowerCase()) return;
        if (!candidats.some(c => c.toLowerCase() === uuid.toLowerCase())) candidats.push(uuid);
    };

    // Source la plus sûre : l'application a elle-même appelé cet endpoint pour
    // afficher l'écran, et le navigateur garde la trace de ses requêtes. On lit
    // donc l'identifiant qu'elle a utilisé au lieu d'essayer de le deviner.
    try {
        performance.getEntriesByType('resource')
            .map(e => e.name)
            .filter(nom => nom.includes(API_DOSSIER_PREFIX))
            .forEach(nom => {
                const apres = nom.split(API_DOSSIER_PREFIX)[1] || '';
                const trouve = apres.match(UUID);
                if (trouve) ajouter(trouve[0]);
            });
    } catch (err) { console.warn('Animex Toolkit: historique réseau illisible', err); }

    // À défaut, les écrans de dossier portent l'identifiant dans leur URL.
    (window.location.href.match(UUID) || []).forEach(ajouter);

    if (candidats.length === 0) {
        // Pas de dossierId sous la main : la demande le référence.
        try {
            const repApp = await fetch(`${BASE_URL}${API_FORM_A_PREFIX}${applicationId}`);
            if (repApp.ok && (repApp.headers.get('content-type') || '').includes('application/json')) {
                const jsonApp = await repApp.json();
                const trouve = chercherIdDeDossier(jsonApp);
                if (trouve) candidats.push(trouve);
            }
        } catch (err) { console.warn('Animex Toolkit: dossier introuvable via la demande', err); }
    }

    for (const dossierId of candidats) {
        try {
            const url = `${BASE_URL}${API_DOSSIER_PREFIX}${dossierId}?applicationId=${applicationId}`;
            const rep = await fetch(url);
            if (!rep.ok || !(rep.headers.get('content-type') || '').includes('application/json')) continue;
            const json = await rep.json();
            // La réponse est une liste d'expériences ; toutes partagent la même
            // référence de dossier, la première suffit.
            const premier = Array.isArray(json) ? json[0] : json;
            if (!premier) continue;
            const numero = String(premier.id || '').trim();
            const cantonal = String(premier.cantonalId || '').trim();
            const ref = [numero, cantonal].filter(Boolean).join(' - ');
            if (ref) {
                console.log(`Animex Toolkit: référence dossier « ${ref} »`);
                return ref;
            }
        } catch (err) { console.warn('Animex Toolkit: lecture dossier échouée', err); }
    }

    console.warn("Animex Toolkit: référence de dossier introuvable, objet de mail par défaut.",
        { applicationId, candidatsEssayes: candidats, url: window.location.href });
    return '';
}

/** Premier identifiant rattaché à un dossier dans une réponse d'API. */
function chercherIdDeDossier(noeud, profondeur = 0) {
    if (!noeud || typeof noeud !== 'object' || profondeur > 6) return null;
    for (const [cle, valeur] of Object.entries(noeud)) {
        if (/dossier/i.test(cle)) {
            if (typeof valeur === 'string' && valeur) return valeur;
            if (valeur && typeof valeur === 'object' && typeof valeur.id === 'string') return valeur.id;
        }
    }
    for (const valeur of Object.values(noeud)) {
        if (valeur && typeof valeur === 'object') {
            const trouve = chercherIdDeDossier(valeur, profondeur + 1);
            if (trouve) return trouve;
        }
    }
    return null;
}

/**
 * Écrit « Commissaire N : Prénom Nom » dans l'avis, en remplaçant la ligne si
 * elle existe déjà. Le champ est piloté par Angular : la valeur seule ne suffit
 * pas, il faut lui signaler la saisie comme le ferait une frappe au clavier.
 */
function ecrireCommissaireDansTexte(textarea, rang, libelle) {
    const ligne = `Commissaire ${rang} : ${libelle}`;
    const motif = new RegExp(`^.*commissaire\\s*${rang}\\s*:?.*$`, 'im');

    if (motif.test(textarea.value)) {
        textarea.value = textarea.value.replace(motif, ligne);
    } else {
        // Pas de ligne à remplacer : on l'ajoute sans écraser ce qui est écrit.
        const separateur = textarea.value && !textarea.value.endsWith('\n') ? '\n' : '';
        textarea.value = `${textarea.value}${separateur}${ligne}\n`;
    }
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * Deux listes déroulantes des membres, posées au-dessus de l'avis.
 *
 * Choisir dans la liste plutôt que taper « M Perréaz » fait écrire au texte la
 * forme exacte que porte Animex : le cahier de suivi reçoit alors le prénom
 * attendu sans qu'aucun rapprochement approximatif n'ait à deviner de qui il
 * s'agit. La frappe libre reste possible, ces menus ne font qu'écrire à la
 * place de l'utilisateur.
 *
 * Rien n'est affiché tant qu'il y a moins de deux membres : une commission
 * réduite à une personne est une procédure simplifiée, où les commissaires ne
 * se désignent pas.
 */
function poserSelecteursCommissaires(textarea) {
    const existant = document.getElementById('animex-commissaires');
    if (currentCommissionMembers.length < 2) { existant?.remove(); return; }
    // Reconstruit si la liste a changé de demande entre-temps.
    const signature = currentCommissionMembers.map(m => m.email).join('|');
    if (existant && existant.dataset.signature === signature) return;
    existant?.remove();

    const bloc = document.createElement('div');
    bloc.id = 'animex-commissaires';
    bloc.dataset.signature = signature;
    bloc.style.cssText = 'display:flex;gap:10px;margin:8px 0;font-family:system-ui,sans-serif;font-size:13px;';

    [1, 2].forEach(rang => {
        const champ = document.createElement('label');
        champ.style.cssText = 'flex:1;display:flex;flex-direction:column;gap:3px;color:#555;';
        champ.textContent = `Commissaire ${rang}`;

        const select = document.createElement('select');
        select.style.cssText = 'padding:5px;border:1px solid #ccc;border-radius:4px;background:#fff;';
        select.appendChild(new Option('— choisir —', ''));
        currentCommissionMembers.forEach(m => {
            const libelle = `${m.prenom} ${m.nomFamille}`.trim() || m.nomComplet;
            select.appendChild(new Option(libelle, libelle));
        });
        select.onchange = () => {
            if (select.value) ecrireCommissaireDansTexte(textarea, rang, select.value);
        };

        champ.appendChild(select);
        bloc.appendChild(champ);
    });

    textarea.parentNode.insertBefore(bloc, textarea);
}

async function chargerEmailsCommission() {
    try {
        const applicationId = extraireIdDeLUrl();
        if (!applicationId) { console.warn("Animex Toolkit: aucun applicationId dans l'URL"); return; }
        const url = `${BASE_URL}${API_COMMISSION}?applicationId=${applicationId}`;
        const rep = await fetch(url);
        const contentType = rep.headers.get("content-type");
        if (rep.ok && contentType && contentType.includes("application/json")) {
            const json = await rep.json();
            currentCommissionMembers = collecterMembres(json);
            currentCommissionEmails = currentCommissionMembers.map(m => m.email);
            console.log(`Animex Toolkit: ${currentCommissionEmails.length} destinataire(s) de commission chargé(s).`, currentCommissionEmails);
            currentDossierRef = await chargerReferenceDossier(applicationId);
            if (currentCommissionEmails.length === 0) {
                // Aucun email trouvé alors que la requête a abouti : la forme de
                // la réponse a changé. On la donne en clair pour pouvoir la lire
                // sans avoir à rejouer l'appel dans l'onglet Network.
                console.warn("Animex Toolkit: aucune adresse dans la réponse commission. Structure reçue :", json);
            }
        } else {
            console.warn("Animex Toolkit: réponse commission inattendue", rep.status, contentType);
        }
    } catch (err) { console.error("Err Email:", err); }
}

/**
 * Noms des commissaires, lus dans l'avis lui-même : le template les fait saisir
 * sur des lignes « Commissaire 1 : … ». Les relire ici évite de les redemander
 * dans un second formulaire, au risque qu'ils divergent du texte envoyé.
 * Tolère l'absence d'accent, les deux-points optionnels et les espaces.
 */
function extraireCommissaires(texte) {
    const lire = (n) => {
        const re = new RegExp(`commissaire\\s*${n}\\s*:?[ \\t]*(.*)`, 'i');
        const m = (texte || '').match(re);
        return m ? m[1].trim() : '';
    };
    return { commissaire1: lire(1), commissaire2: lire(2) };
}

/**
 * Date du jour en JJ/MM/AAAA, séparateurs du cahier de suivi. Construite à la
 * main plutôt que par toLocaleDateString, qui produit des points en fr-CH.
 */
function dateDuJourCH() {
    const d = new Date();
    const jj = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${jj}/${mm}/${d.getFullYear()}`;
}

/**
 * Ligne prête à coller dans le cahier de suivi. Séparée par des tabulations :
 * collée dans Excel, chaque champ tombe dans sa propre colonne.
 */
/** Minuscules sans accent ni ponctuation, pour comparer des noms saisis à la main. */
function normaliserNom(valeur) {
    return String(valeur || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z\s-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

const CIVILITES = /^(m|mr|mme|mlle|monsieur|madame|mademoiselle|dr|pr|prof|professeur)\.?\s+/i;

/**
 * Prénom du membre désigné par une mention libre de l'avis.
 *
 * L'avis nomme les commissaires comme on s'adresse à eux — « M Perréaz »,
 * « Mme Kirchdoerffer » — alors que le cahier de suivi n'accepte que des
 * prénoms, via une liste déroulante qui rejette toute autre valeur. La
 * correspondance se fait sur le nom de famille, que l'API fournit à côté du
 * prénom ; civilité et accents sont ignorés, l'avis étant saisi à la main.
 *
 * Renvoie une chaîne vide si personne ne correspond : mieux vaut une case à
 * compléter qu'une valeur que la liste déroulante refusera.
 */
function resoudrePrenomCommissaire(mention) {
    const sansCivilite = String(mention || '').trim().replace(CIVILITES, '');
    const cible = normaliserNom(sansCivilite);
    if (!cible) return '';

    for (const membre of currentCommissionMembers) {
        const nom = normaliserNom(membre.nomFamille);
        if (nom && (cible === nom || cible.includes(nom) || nom.includes(cible))) return membre.prenom;
    }
    // Le prénom a pu être écrit directement, ou le nom complet.
    for (const membre of currentCommissionMembers) {
        const prenom = normaliserNom(membre.prenom);
        const complet = normaliserNom(membre.nomComplet);
        if (prenom && cible === prenom) return membre.prenom;
        if (complet && (cible === complet || complet.includes(cible))) return membre.prenom;
    }
    return '';
}

/**
 * Les deux commissaires à reporter, selon le nombre de membres saisis.
 *
 * Un seul membre : la demande part en procédure simplifiée, cette personne est
 * le commissaire et son prénom suffit.
 *
 * Plusieurs membres : la liste est celle de la commission entière, pas des deux
 * commissaires désignés — ceux-là sont nommés dans le texte de l'avis, sur les
 * lignes « Commissaire 1 : … ». Y prendre les prénoms de l'API reviendrait à
 * inscrire deux personnes au hasard dans un registre officiel, donc on ne
 * complète rien : les champs restent vides et la bannière le signale.
 */
function determinerCommissaires(corpsDuMessage) {
    const prenoms = currentCommissionMembers.map(m => m.prenom).filter(Boolean);

    if (prenoms.length === 1) {
        return { commissaire1: prenoms[0], commissaire2: '', simplifiee: true, nonResolus: [], incomplet: false };
    }

    const duTexte = extraireCommissaires(corpsDuMessage);
    const commissaire1 = resoudrePrenomCommissaire(duTexte.commissaire1);
    const commissaire2 = resoudrePrenomCommissaire(duTexte.commissaire2);

    // Nommé dans l'avis mais introuvable parmi les membres : la case reste vide
    // pour ne pas heurter la liste déroulante, et on dit lequel a résisté.
    const nonResolus = [
        [duTexte.commissaire1, commissaire1],
        [duTexte.commissaire2, commissaire2],
    ].filter(([brut, prenom]) => brut && !prenom).map(([brut]) => brut);

    return {
        commissaire1,
        commissaire2,
        simplifiee: false,
        nonResolus,
        incomplet: prenoms.length > 1 && !duTexte.commissaire1 && !duTexte.commissaire2,
    };
}

/** Colonnes du cahier de suivi : date, puis les deux commissaires. */
function construireLigneSuivi(corpsDuMessage) {
    const { commissaire1, commissaire2 } = determinerCommissaires(corpsDuMessage);
    return [dateDuJourCH(), commissaire1, commissaire2].join('\t');
}

/**
 * Copie dans le presse-papier. navigator.clipboard exige un contexte sécurisé
 * et un geste utilisateur : les deux sont réunis ici (HTTPS + clic), mais le
 * focus peut être perdu au profit du client mail juste après, d'où la copie
 * AVANT l'ouverture du mailto, et un repli sur execCommand si l'API refuse.
 */
async function copierDansPressePapier(texte) {
    try {
        await navigator.clipboard.writeText(texte);
        return true;
    } catch (e) {
        try {
            const ta = document.createElement('textarea');
            ta.value = texte;
            ta.style.cssText = 'position:fixed;top:-1000px;left:-1000px;opacity:0;';
            document.body.appendChild(ta);
            ta.select();
            const ok = document.execCommand('copy');
            document.body.removeChild(ta);
            return ok;
        } catch (e2) {
            console.error('Animex Toolkit: copie presse-papier impossible', e2);
            return false;
        }
    }
}

/**
 * Rappel du cahier de suivi. Volontairement une bannière et non un alert() :
 * un alert() bloque le thread au moment précis où le client mail s'ouvre, et
 * se referme d'un réflexe sans avoir été lu. Celle-ci reste à l'écran, montre
 * ce qui a été copié, et permet de recopier si le presse-papier a été écrasé
 * entre-temps.
 */
function afficherRappelSuivi(ligne, copieOk, etatCommissaires) {
    document.getElementById('animex-suivi-banner')?.remove();

    const banner = document.createElement('div');
    banner.id = 'animex-suivi-banner';
    banner.style.cssText = [
        'position:fixed', 'top:16px', 'right:16px', 'z-index:2147483647',
        'max-width:420px', 'background:#fff8e1', 'border:2px solid #f57c00',
        'border-radius:8px', 'padding:14px 16px', 'box-shadow:0 4px 16px rgba(0,0,0,.2)',
        'font-family:system-ui,sans-serif', 'font-size:13px', 'color:#333',
    ].join(';');

    const titre = document.createElement('div');
    titre.textContent = '📒 REMPLIR LE CAHIER DE SUIVI !';
    titre.style.cssText = 'font-weight:bold;font-size:15px;color:#e65100;margin-bottom:8px;';

    const etat = document.createElement('div');
    etat.textContent = copieOk
        ? 'Les infos sont dans le presse-papier — colle-les dans Excel (Ctrl+V).'
        : 'Copie automatique refusée par le navigateur : utilise le bouton ci-dessous.';
    etat.style.cssText = 'margin-bottom:8px;';

    let avertissement = null;
    if (etatCommissaires && etatCommissaires.nonResolus && etatCommissaires.nonResolus.length > 0) {
        const avert = document.createElement('div');
        const noms = etatCommissaires.nonResolus.join(' » et « ');
        const dispo = currentCommissionMembers.map(m => m.prenom).filter(Boolean).join(', ');
        avert.textContent = `⚠️ « ${noms} » ne correspond à aucun membre de la commission : la case reste vide.`
            + (dispo ? ` Prénoms disponibles : ${dispo}.` : '');
        avert.style.cssText = 'background:#ffebee;border:1px solid #ffcdd2;border-radius:4px;padding:8px;margin-bottom:8px;color:#c62828;';
        avertissement = avert;
    } else if (etatCommissaires && etatCommissaires.incomplet) {
        const avert = document.createElement('div');
        avert.textContent = "⚠️ Plusieurs membres dans la commission, mais aucun « Commissaire 1 : … » dans ton avis : les deux colonnes sont vides, à compléter à la main.";
        avert.style.cssText = 'background:#ffebee;border:1px solid #ffcdd2;border-radius:4px;padding:8px;margin-bottom:8px;color:#c62828;';
        avertissement = avert;
    }

    const apercu = document.createElement('pre');
    apercu.textContent = ligne.split('\t').join('  |  ');
    apercu.style.cssText = 'background:#fff;border:1px solid #ffe0b2;border-radius:4px;padding:8px;margin:0 0 10px;white-space:pre-wrap;word-break:break-word;font-size:12px;';

    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:8px;';

    const btnCopier = document.createElement('button');
    btnCopier.textContent = 'Recopier';
    btnCopier.style.cssText = 'flex:1;padding:7px;border:none;border-radius:4px;background:#f57c00;color:#fff;font-weight:bold;cursor:pointer;';
    btnCopier.onclick = async () => {
        const ok = await copierDansPressePapier(ligne);
        btnCopier.textContent = ok ? 'Copié ✓' : 'Échec';
        setTimeout(() => { btnCopier.textContent = 'Recopier'; }, 1500);
    };

    const btnFermer = document.createElement('button');
    btnFermer.textContent = "C'est noté";
    btnFermer.style.cssText = 'flex:1;padding:7px;border:1px solid #ccc;border-radius:4px;background:#fff;cursor:pointer;';
    btnFermer.onclick = () => banner.remove();

    actions.append(btnCopier, btnFermer);
    banner.append(titre, etat, ...(avertissement ? [avertissement] : []), apercu, actions);
    document.body.appendChild(banner);
}

// Au-delà de cette longueur, l'URL mailto n'est plus transmise intégralement au
// client mail (limite de la ligne de commande sous Windows, ~2000 caractères
// une fois l'encodage appliqué). Outlook s'ouvrait alors vide ou tronqué, sans
// la moindre erreur.
const MAILTO_LONGUEUR_MAX = 1800;

async function ouvrirOutlook(corpsDuMessage) {
    if (currentCommissionEmails.length === 0) {
        // Une seconde chance : la liste peut n'être pas encore revenue de l'API.
        await chargerEmailsCommission();
        if (currentCommissionEmails.length === 0) {
            alert("⚠️ Impossible de récupérer les membres de la commission.\n\nVérifie que la demande est bien ouverte, puis réessaie. Le détail est dans la console (F12).");
            return;
        }
    }

    const destinataires = currentCommissionEmails.join(';');
    // La commission identifie un dossier par sa référence ; l'ancien objet fixe
    // obligeait à la retrouver à la main dans chaque fil de discussion.
    const sujet = currentDossierRef || "Commission - Demande d'avis";

    // Le presse-papier est rempli AVANT d'ouvrir le client mail : après, la page
    // a perdu le focus et le navigateur refuse l'écriture.
    const ligneSuivi = construireLigneSuivi(corpsDuMessage);
    const etatCommissaires = determinerCommissaires(corpsDuMessage);
    const copieOk = await copierDansPressePapier(ligneSuivi);

    let corpsEnvoye = corpsDuMessage || '';
    let url = `mailto:${destinataires}?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(corpsEnvoye)}`;
    if (url.length > MAILTO_LONGUEUR_MAX) {
        console.warn(`Animex Toolkit: mailto de ${url.length} caractères, corps omis pour ne pas être tronqué.`);
        url = `mailto:${destinataires}?subject=${encodeURIComponent(sujet)}`;
        alert("⚠️ Ton avis est trop long pour être transmis automatiquement à Outlook.\n\nLe mail s'ouvre avec les destinataires et le sujet : copie ton texte depuis le champ de l'avis et colle-le dans le message.");
    }

    // Un <a> cliqué plutôt qu'une affectation de window.location : dans une SPA
    // Angular, écrire location.href peut être intercepté par le routeur, et
    // certains navigateurs ignorent une navigation mailto faite ainsi.
    const lien = document.createElement('a');
    lien.href = url;
    lien.style.display = 'none';
    document.body.appendChild(lien);
    lien.click();
    lien.remove();

    afficherRappelSuivi(ligneSuivi, copieOk, etatCommissaires);
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

/**
 * Signale la présence d'annonces sur la demande.
 *
 * Le bloc « Announcements » n'apparaît que lorsqu'il y en a, mais rien ne le
 * distingue du reste de la page : il se lit comme un intitulé de section
 * ordinaire et passe inaperçu à la lecture.
 *
 * Ne marque que les éléments dont le texte se réduit à ce mot : le paragraphe
 * porte un commentaire Angular vide (« Announcements <!----> ») qui ne compte
 * pas dans textContent, tandis qu'un conteneur englobant en contiendrait bien
 * davantage et se retrouverait surligné en entier.
 */
function marquerAnnonces() {
    document.querySelectorAll('p, h2, h3, h4, h5, span, div, label, legend').forEach(el => {
        if (el.getAttribute('data-annonce-tagged')) return;
        if (el.children.length > 0) return;
        if ((el.textContent || '').trim().toLowerCase() !== 'announcements') return;

        el.setAttribute('data-annonce-tagged', 'true');
        el.style.color = '#c62828';
        el.style.fontWeight = 'bold';

        const badge = document.createElement('span');
        badge.innerHTML = ' ⚠️';
        badge.style.cssText = 'font-size: 1.1em; margin-left: 8px; vertical-align: middle;';
        el.appendChild(badge);
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
// Une seule requête size=100 (pas de pagination) : le 405 initial venait de
// la méthode GET et des en-têtes manquants, pas de la taille de page.
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
        let taches = [];

        const url = `${BASE_URL}${API_TASK_SEARCH}?page=0&size=100&direction=DESC&property=createdOn&activestatus=DRAFT&activestatus=PENDING&activestatus=VALID`;
        // POST requis (405 en GET) ; Content-Type + corps JSON requis (415 sinon) ;
        // Accept-Language: "EN" exact (valeur observée sur une requête Angular
        // qui fonctionne réellement dans DevTools) — toute autre valeur (fr,
        // fr-CH, ou le format composé par défaut du navigateur) donne 400.
        const rep = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'EN'
            },
            body: '{}'
        });
        const contentType = rep.headers.get("content-type");
        if (!rep.ok || !contentType || !contentType.includes("application/json")) {
            console.warn('Animex Toolkit: réponse inattendue de task/search', rep.status, url);
            echec = true;
        } else {
            const json = await rep.json();
            const pageContent = Array.isArray(json.content) ? json.content : [];
            // Uniquement les demandes d'expérimentation (EXPERIMENT_APPLICATION) :
            // on ignore FACILITY_APPLICATION, REPORT_AC, etc. pour ce comptage.
            taches = pageContent.filter(t => t.objectType === 'EXPERIMENT_APPLICATION');
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
        container.style.cssText = 'display:inline-flex; align-items:center; gap:8px; margin-right:12px; vertical-align:middle;';

        const total = document.createElement('span');
        total.innerText = `${taches.length} tâche${taches.length > 1 ? 's' : ''}`;
        total.style.cssText = 'font-size:0.9em; color:#555; font-weight:bold; margin-right:4px;';
        container.appendChild(total);

        entrees.forEach(([statut, nb]) => {
            const pill = document.createElement('span');
            const libelle = LIBELLES_STATUT_TACHE[statut] || statut;
            pill.innerText = `${libelle} : ${nb}`;
            pill.title = statut;
            const couleur = COULEURS_STATUT_TACHE[statut] || '#616161';
            pill.style.cssText = `background-color:${couleur}; color:white; font-size:0.85em; font-weight:bold; padding:5px 11px; border-radius:12px; display:inline-block; white-space:nowrap;`;
            container.appendChild(pill);
        });

        // Placé juste avant le div .btn-toolbar.pull-right (pas dedans), pour
        // apparaître à gauche du bouton Export plutôt qu'à sa droite/dedans.
        toolbar.parentNode.insertBefore(container, toolbar);
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

// Pièces jointes déjà envoyées au téléchargement, par URL : le modal est
// réinspecté toutes les 800 ms et rouvert plusieurs fois par session, sans quoi
// le même certificat serait enregistré en boucle.
const _certificatsTelecharges = new Set();

// Extensions de fichiers considérées comme un certificat téléchargeable.
const EXT_CERTIFICAT = /\.(pdf|jpe?g|png|docx?|odt)(\?|$)/i;
// À défaut d'extension, les routes de l'API qui servent un document.
const ROUTE_DOCUMENT = /\/(attachment|attachments|document|documents|file|files|download|certificate)s?\//i;

/**
 * Enregistre la pièce jointe du modal de formation dans le dossier des
 * certificats, dès son ouverture.
 *
 * Le lien n'est cherché que dans le conteneur du modal — repéré par les champs
 * que l'extension y remplit déjà — et non dans toute la page : ailleurs, une
 * ancre vers un PDF est un document quelconque, qu'il n'y a aucune raison
 * d'aspirer.
 *
 * Le téléchargement passe par le service worker, chrome.downloads n'étant pas
 * exposé aux content scripts.
 */
function telechargerCertificatDuModal() {
    try {
        const ancre = document.getElementById('lastAttendedDay')
            || document.querySelector('[formcontrolname="approvedDays"]');
        if (!ancre) return;

        // Le modal est le premier ancêtre qui contient aussi des liens ; à
        // défaut on se rabat sur le formulaire englobant.
        const modal = ancre.closest('.modal, .modal-content, [role="dialog"], form') || ancre.parentElement;
        if (!modal) return;

        const liens = [...modal.querySelectorAll('a[href]')]
            .filter(a => {
                const href = a.getAttribute('href') || '';
                if (!href || href.startsWith('#') || href.startsWith('javascript:')) return false;
                return a.hasAttribute('download') || EXT_CERTIFICAT.test(href) || ROUTE_DOCUMENT.test(href);
            });

        if (liens.length === 0) return;

        liens.forEach(lien => {
            const url = new URL(lien.getAttribute('href'), window.location.origin).href;
            if (_certificatsTelecharges.has(url)) return;
            _certificatsTelecharges.add(url);

            console.log('Animex Toolkit: certificat envoyé au téléchargement', url);
            chrome.runtime.sendMessage({ type: 'telecharger-certificat', url }, (reponse) => {
                if (chrome.runtime.lastError) {
                    console.error('Animex Toolkit: service worker injoignable', chrome.runtime.lastError.message);
                    _certificatsTelecharges.delete(url); // réessayable
                } else if (!reponse?.ok) {
                    console.error('Animex Toolkit: téléchargement refusé', reponse?.error);
                    _certificatsTelecharges.delete(url);
                }
            });
        });
    } catch (err) {
        console.error('Animex Toolkit: telechargerCertificatDuModal', err);
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