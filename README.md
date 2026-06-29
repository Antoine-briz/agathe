# Agathe — suivi bébé (PWA)

Application web installable (PWA) pour le suivi quotidien d'un nouveau-né : biberons,
entrées/sorties (couches), physionomie + courbe de poids, planning/calendrier,
traitements et page urgences. Tout fonctionne hors-ligne, sans serveur ni compte.
Les données sont enregistrées **localement sur l'appareil** (localStorage).

## Contenu du dépôt

```
index.html        Structure de l'application
style.css         Thème terracotta/beige + mode nuit + styles d'impression
app.js            Toute la logique (état, planning, mesures, calendrier, PDF…)
sw.js             Service worker (mode hors-ligne / installation)
manifest.json     Manifeste PWA (nom, icônes, couleurs)
icons/            Icônes 180/192/512 + maskable
```

## Déploiement sur GitHub Pages

1. Créez un dépôt (ex. `agathe`) et déposez-y **tous ces fichiers à la racine**
   (gardez le dossier `icons/`).
2. Sur GitHub : **Settings → Pages → Build and deployment → Source : Deploy from a branch**,
   branche `main`, dossier `/ (root)`, puis **Save**.
3. Au bout d'une minute, l'app est en ligne sur
   `https://<votre-pseudo>.github.io/agathe/`.
4. Ouvrez l'adresse sur le téléphone → menu du navigateur → **Ajouter à l'écran d'accueil**.

> GitHub Pages sert en HTTPS : c'est indispensable pour le service worker, les
> notifications et l'installation.

## Réglages (page Entrées/sorties → « réglages »)

- Prénom et date de naissance (l'âge se calcule tout seul : jours → semaines → mois).
- Heure de début, intervalle entre biberons, volume, premier tour (Antoine/Célia).
- « Recaler les biberons suivants sur l'heure réelle » : en cas de décalage, les
  créneaux à venir sont replanifiés à partir de la dernière prise réelle.
- Rappel biberon (notification à l'heure pile) + son (berceuse intégrée ou Spotify).

## Bon à savoir

- **Notifications** : déclenchées à l'heure du biberon **quand l'application est ouverte**
  (au premier plan ou onglet actif). Des notifications en arrière-plan, application
  fermée, nécessiteraient un service de push côté serveur — non inclus ici.
- **Spotify** : la lecture d'un morceau depuis l'app demande un compte Spotify Premium et
  une connexion à votre compte. À défaut, la berceuse douce intégrée est jouée. Le champ
  « lien Spotify » ouvre simplement la playlist dans l'app Spotify.
- **Courbe de poids** : les percentiles affichés sont **indicatifs** (type OMS, filles).
  La courbe de référence officielle reste celle du carnet de santé.
- **Export PDF** : bouton « Générer le PDF » → la fenêtre d'impression s'ouvre, choisissez
  « Enregistrer au format PDF ». Sélection Semaine ou Mois.
- **Sauvegarde** : les données restent sur l'appareil. Vider les données du navigateur
  ou changer de téléphone les efface. (Une synchro multi-appareils Antoine/Célia
  demanderait un petit backend — faisable en évolution.)

## Avertissement

Les informations de la page Urgence (numéros, signes d'alerte) sont fournies à titre
indicatif et ne remplacent pas un avis médical. En cas de doute, appelez le 15.
