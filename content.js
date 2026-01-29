// --- CONFIGURATION ---
const BASE_URL = window.location.origin; 
const API_RAPPORT_PREFIX = '/api/v1/report-ac/'; 
const API_FORM_A_PREFIX = '/api/v1/animal-experiment-applications/';
const API_AUTH_PREFIX = '/api/v1/authorizations/'; 
const API_REMARKS_BASE = '/api/v1/remarks'; 
const API_USER = '/api/v1/persons/current-user'; 
const API_COMMISSION = '/api/v1/commission'; 

const SELECTEUR_TITRE = 'h1.type'; 
const DEFAULT_TEMPLATE_FALLBACK = `Bonjour,\n\nVoici une demande pour la commission :\n\nCommissaire 1 :\nCommissaire 2 :\n\nSincères salutations,\n\n{FULLNAME}`;

console.log("Animex Toolkit : V28 (EIAM Shield) Chargée.");

let urlPrecedente = '';
let currentUserFullName = "[Utilisateur]"; 
let currentCommissionEmails = [];
let extensionActivee = false;

let configColonnes = {
    hideTargetDate: true,
    hideType: true
};

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
        }

        marquerMiceGM_V13(); 
        marquerSexeNonMixte();
        verifierPopupCommission();

    }, 800); 
}

// ============================================================
// LOGIQUE MÉTIER (INCHANGÉE)
// ============================================================

function chargerPreferences() {
    if (chrome.storage && chrome.storage.sync) {
        chrome.storage.sync.get({
            hideTargetDate: true,
            hideType: true
        }, (items) => {
            configColonnes.hideTargetDate = items.hideTargetDate;
            configColonnes.hideType = items.hideType;
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

function creerEtOuvrirPopup(titreHeader, contenuHtml) {
    const ancien = document.getElementById('animex-popup-overlay');
    if (ancien) ancien.remove();
    const overlay = document.createElement('div');
    overlay.id = 'animex-popup-overlay';
    overlay.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); z-index: 9999; display: flex; justify-content: center; align-items: center;";
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    const modal = document.createElement('div');
    modal.style.cssText = "background: white; width: 600px; max-width: 90%; max-height: 80vh; border-radius: 8px; display: flex; flex-direction: column; overflow: hidden; font-family: sans-serif; box-shadow: 0 10px 25px rgba(0,0,0,0.5);";
    const couleurHeader = titreHeader.includes('CHARGES') ? '#d32f2f' : '#F57C00';
    const header = document.createElement('div');
    header.style.cssText = `background: ${couleurHeader}; color: white; padding: 15px; font-size: 18px; font-weight: bold; display: flex; justify-content: space-between;`;
    header.innerHTML = `<span>${titreHeader}</span><span style='cursor:pointer;' id='close-popup'>&times;</span>`;
    const body = document.createElement('div');
    body.style.cssText = "padding: 20px; overflow-y: auto; color: #333; line-height: 1.5; font-size: 14px;";
    body.innerHTML = contenuHtml;
    modal.appendChild(header);
    modal.appendChild(body);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    document.getElementById('close-popup').onclick = () => overlay.remove();
}