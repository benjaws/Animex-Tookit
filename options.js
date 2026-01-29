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
  
  chrome.storage.sync.set({
    commissionTemplate: templateValue,
    hideTargetDate: hideTargetDate,
    hideType: hideType
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
  }, (items) => {
    document.getElementById('template').value = items.commissionTemplate;
    document.getElementById('hideTargetDate').checked = items.hideTargetDate;
    document.getElementById('hideType').checked = items.hideType;
  });
}

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('save').addEventListener('click', saveOptions);