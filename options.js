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
  }, (items) => {
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

chrome.storage.local.get({ rappelsCommission: {} }, ({ rappelsCommission }) => {
  const liste = Object.values(rappelsCommission).filter(r => !r.envoye).sort((a, b) => a.echeance - b.echeance);
  document.getElementById('ntfyEnAttente').textContent = liste.length
    ? 'En attente : ' + liste.map(r => `${r.ref} (${new Date(r.echeance).toLocaleDateString('fr-CH')})`).join(', ')
    : 'Aucun rappel en attente.';
});
