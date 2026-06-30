/* ---------------------------------------------------------------
   Partage entre appareils (façon SARIC), via GitHub — sans Firebase.
   Renseignez le dépôt qui STOCKERA les données partagées.
   Laissez vide pour utiliser l'app en mode local seul.

   IMPORTANT : ne mettez PAS votre jeton ici (il deviendrait public).
   Le jeton se saisit dans l'app (réglages) et reste sur l'appareil.
   --------------------------------------------------------------- */
window.AGATHE_CONFIG = {
  GITHUB_OWNER: "",          // votre pseudo GitHub (ex. "antoine-briz")
  GITHUB_REPO:  "",          // dépôt qui stocke les données (idéalement PRIVÉ)
  GITHUB_BRANCH: "main",     // ou "master"
  GITHUB_PATH:  "agathe.json" // nom du fichier de données dans ce dépôt
};
