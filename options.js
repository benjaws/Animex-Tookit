// Valeurs par défaut
const DEFAULT_TEMPLATE = `Bonjour,

Voici une demande pour la commission : 

Commissaire 1 : 
Commissaire 2 : 

Sincères salutations,

{FULLNAME}`;

// Sauvegarder
function saveOptions() {
  const templateValue = document.getElementById('template').value;
  const hideTargetDate = document.getElementById('hideTargetDate').checked;
  const hideType = document.getElementById('hideType').checked;
  const enableAutoCopy = document.getElementById('enableAutoCopy') ? document.getElementById('enableAutoCopy').checked : true;
  
  chrome.storage.sync.set({
    commissionTemplate: templateValue,
    hideTargetDate: hideTargetDate,
    hideType: hideType
    ,enableAutoCopy: enableAutoCopy
    ,commissairesListe: document.getElementById('commissairesListe').value
    ,ntfyTopic: document.getElementById('ntfyTopic').value.trim()
    ,ntfyServeur: document.getElementById('ntfyServeur').value.trim()
  }, () => {
    const status = document.getElementById('status');
    status.style.opacity = '1';
    setTimeout(() => status.style.opacity = '0', 1500);
  });
}

// Charger
function restoreOptions() {
  chrome.storage.sync.get({
    commissionTemplate: DEFAULT_TEMPLATE,
    hideTargetDate: true, // Par défaut : Masqué
    hideType: true        // Par défaut : Masqué
    ,enableAutoCopy: true
    ,ntfyTopic: ''
    ,ntfyServeur: ''
    ,commissairesListe: ''
  }, (items) => {
    document.getElementById('commissairesListe').value = items.commissairesListe;
    document.getElementById('ntfyTopic').value = items.ntfyTopic;
    document.getElementById('ntfyServeur').value = items.ntfyServeur;
    document.getElementById('template').value = items.commissionTemplate;
    document.getElementById('hideTargetDate').checked = items.hideTargetDate;
    document.getElementById('hideType').checked = items.hideType;
    if (document.getElementById('enableAutoCopy')) document.getElementById('enableAutoCopy').checked = items.enableAutoCopy;
  });
}

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('save').addEventListener('click', saveOptions);

// ntfy : canal aléatoire, test, et rappels en attente
document.getElementById('ntfyGenerer').addEventListener('click', () => {
  const octets = crypto.getRandomValues(new Uint8Array(12));
  document.getElementById('ntfyTopic').value = 'animex-' + Array.from(octets, o => o.toString(16).padStart(2, '0')).join('');
  document.getElementById('ntfyStatut').textContent = ' Pense à Enregistrer, puis abonne-toi à ce canal dans l’app ntfy.';
});

document.getElementById('ntfyTest').addEventListener('click', () => {
  const statut = document.getElementById('ntfyStatut');
  statut.textContent = ' Envoi…';
  chrome.runtime.sendMessage({
    type: 'tester-ntfy',
    topic: document.getElementById('ntfyTopic').value.trim(),
    serveur: document.getElementById('ntfyServeur').value.trim(),
  }, (r) => {
    statut.textContent = r && r.ok ? ' Envoyé, regarde ton téléphone.' : ' Échec : ' + ((r && r.error) || 'pas de réponse');
  });
});

// Rappels gardés dans chrome.storage.local : liste et suppression.
function afficherRappels() {
  chrome.storage.local.get({ rappelsCommission: {} }, ({ rappelsCommission }) => {
    const zone = document.getElementById('ntfyEnAttente');
    zone.textContent = '';
    const liste = Object.entries(rappelsCommission).sort((a, b) => a[1].echeance - b[1].echeance);
    if (!liste.length) { zone.textContent = 'Aucun rappel enregistré.'; return; }

    const table = document.createElement('table');
    table.style.cssText = 'width: 100%; border-collapse: collapse; font-size: 13px;';
    table.innerHTML = '<tr style="text-align: left;"><th>Dossier</th><th>Mail envoyé</th><th>Rappel</th><th>État</th><th></th></tr>';
    for (const [cle, r] of liste) {
      const tr = document.createElement('tr');
      tr.style.borderTop = '1px solid #ddd';
      const cellules = [r.ref, new Date(r.envoyeLe).toLocaleDateString('fr-CH'), new Date(r.echeance).toLocaleDateString('fr-CH'),
        r.envoye ? 'confié à ntfy' : 'en attente'];
      for (const texte of cellules) {
        const td = document.createElement('td');
        td.style.padding = '4px 6px 4px 0';
        td.textContent = texte;
        tr.appendChild(td);
      }
      const td = document.createElement('td');
      const bouton = document.createElement('button');
      bouton.type = 'button';
      bouton.textContent = 'Supprimer';
      bouton.style.cssText = 'margin: 0; padding: 3px 8px; font-size: 12px; background: #c62828;';
      bouton.addEventListener('click', () => {
        // Déjà confié à ntfy : il partira quand même, ntfy.sh ne permet pas de
        // l'annuler. On le dit plutôt que de laisser croire le contraire.
        if (r.envoye && !confirm('Ce rappel est déjà programmé chez ntfy : il arrivera quand même. Le retirer de la liste ?')) return;
        delete rappelsCommission[cle];
        chrome.storage.local.set({ rappelsCommission }, afficherRappels);
      });
      td.appendChild(bouton);
      tr.appendChild(td);
      table.appendChild(tr);
    }
    zone.appendChild(table);
  });
}
afficherRappels();
