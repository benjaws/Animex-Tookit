🐭 Animex Toolkit
Animex Toolkit est une extension Chrome conçue pour améliorer l'expérience utilisateur, la sécurité et la productivité sur le portail fédéral Animex-ch (blv.admin.ch).

Elle ajoute des alertes visuelles critiques, automatise la rédaction d'avis de commission et nettoie l'interface pour une meilleure lisibilité.

🔒 Sécurisé & Privé : Cette extension fonctionne localement. Aucune donnée n'est envoyée vers des serveurs externes. Elle est compatible avec le système d'authentification AGOV/SAML.

✨ Fonctionnalités Principales
1. ⚠️ Alertes de Sécurité (Sécurité Expérimentale)
Pour éviter les erreurs lors de la consultation des demandes (Form A) :

Détection OGM : Affiche un badge rouge ⚠️ Genetically modified bien visible à côté des mentions "Mice gm" (titres ou texte).

Détection Sexe : Affiche un badge rouge ⚠️ Not Mixed si le sexe des animaux est uniquement "Male" ou "Female", attirant l'attention sur les protocoles non mixtes.

2. 📝 Historique & Charges (Accès Rapide)
Plus besoin de fouiller dans les menus :

Bouton REMARKS : Un bouton orange apparaît en haut de la page. Il indique le nombre de remarques et permet, en un clic, d'afficher tout l'historique des échanges dans un popup lisible.

Bouton CHARGES : Analyse automatique des autorisations liées. Si des "Special Provisions" ou "Requirements" existent, un bouton rouge apparaît pour les consulter immédiatement.

N° Cantonal : Affiche le numéro de licence cantonale (Badge Vert) directement dans le titre du rapport AC, avec un lien cliquable vers le Form A.

3. 📧 Outils pour la Commission
Dans le popup de la Commission (Canton Remarks) :

Auto-Remplissage (Template) : Insère automatiquement un modèle de texte (configurable) avec votre signature dès l'ouverture du popup.

Bouton "SEND EMAIL" : Un nouveau bouton permet d'ouvrir votre logiciel de messagerie (Outlook, etc.) avec :

Les destinataires pré-remplis (récupérés depuis la liste des membres de la commission).

Le sujet correct.

Le corps du message contenant votre avis actuel.

4. 🧹 Nettoyage d'Interface
Listes de tâches épurées : Masque automatiquement les colonnes souvent inutiles ("Target Date", "Type") pour gagner de la place (Configurable).

Pagination étendue : Ajoute une option pour afficher 100 résultats par page dans les listes.

⚙️ Configuration (Page d'Options)
L'extension est entièrement personnalisable. Faites un Clic-droit sur l'icône de l'extension > Options pour :

Modifier le modèle d'email : Changez le texte par défaut inséré dans les avis de commission.

Astuce : Utilisez la balise {FULLNAME} pour insérer automatiquement votre nom complet (tel que connecté sur Animex).

Gestion des colonnes : Cochez ou décochez les colonnes que vous souhaitez masquer dans les tableaux (Target Date, Type).

🚀 Installation
Via le Chrome Web Store (Recommandé)
Accédez à la page de l'extension [Lien vers ton extension sur le store].

Cliquez sur "Ajouter à Chrome".

L'extension se mettra à jour automatiquement.

Installation Manuelle (Mode Développeur)
Téléchargez ce dépôt (Code > Download ZIP) et décompressez-le.

Ouvrez Chrome et allez sur chrome://extensions.

Activez le Mode développeur (en haut à droite).

Cliquez sur Charger l'extension non empaquetée.

Sélectionnez le dossier décompressé.

🛠️ Technique & Sécurité
Compatibilité AGOV/SAML : L'extension utilise un système de "Lazy Loading" et de détection de hash (#/) pour ne jamais interférer avec le processus de login fédéral. Elle reste inactive tant que l'application Angular n'est pas totalement chargée.

Permissions :

storage : Pour sauvegarder vos préférences (Template, colonnes cachées) localement sur votre ordinateur.

host_permissions : Uniquement restreint au domaine animex-ch.blv.admin.ch.



Note : Ceci est un outil tiers développé pour faciliter l'usage de la plateforme et n'est pas officiellement affilié à l'OSAV (BLV).
