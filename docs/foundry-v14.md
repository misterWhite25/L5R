# Adaptation à Foundry VTT v14

## Version et périmètre

- Branche : `misterWhite-1` ; préversion `3.3.0-beta.1`.
- Source : [ernieayala/l5r4](https://github.com/ernieayala/l5r4), commit `51a287448a41bfdcd62f6850b258bc75718dfcc1`.
- Runtime vérifié : Foundry VTT **14.367**, Node **24.15.0**, le 12 octobre 2026.
- Développement : Tonio (`misterWhite25`), avec l'assistance de Codex Astra.
- Licence, historique et crédits d'origine conservés. Merci aux contributeurs qui ont fourni la base du système.

## Changements

Les confirmations de suppression, d'initiative et de dépense de Vide utilisent `DialogV2`, ses boutons et sa configuration de fenêtre. Les fiches utilisaient déjà `ApplicationV2`.

Les effets créés utilisent `img` et `system.changes`. Les bonus de famille/école et leur coût en XP lisent les changements v14 (`type: "add"`), ignorent les effets désactivés/supprimés et acceptent encore les données d'import v13 (`changes`, `mode: 2`). Le moteur Foundry applique lui-même les phases des effets transférés.

Les cartes d'objets utilisent `core.messageMode` et l'option `messageMode` de création. Les dégâts d'arme utilisent également `Roll.toMessage`, ce qui conserve leurs dés et leur confidentialité au lieu de publier une simple carte HTML. La défense totale utilise `author` et `Roll.toMessage` pour conserver le jet et respecter sa visibilité.

Le manifest cible exclusivement v14. L'identifiant `l5r4-enhanced` est conservé : le nom visible est **L5R**.

## Vérifications

- Référence avant modification : 1 020 tests unitaires réussis.
- Après adaptation : **1 023 tests unitaires réussis** ; lint JavaScript et compilation Sass réussis.
- **13 scénarios navigateur**, avec Chromium Playwright et Foundry réellement démarré :
  - Création et fiches PJ/PNJ ; chaque type d'objet et sa fiche.
  - Modification des compétences et dés dérivés.
  - Effets v14 transférés, bonus de famille/XP, désactivation.
  - Changement de postures, défense totale.
  - Jets de traits, modes public/MJ/aveugle/personnel et données de visibilité des cartes d'objets.
  - Compétences, dégâts, anneaux, magie et consommation des emplacements de sorts.
  - Initiative et progression du combat.
  - Ouverture des outils blessures, combat, états, XP, richesse et armure.
  - Clics dans le dialogue de trait avec dépense de Vide et confirmation de suppression.
  - Rechargement du navigateur et persistance des valeurs sauvegardées.
- Aucune erreur JavaScript dans ces scénarios. Les avertissements de rendu logiciel WebGL sont liés au navigateur automatisé. Sequencer/JB2A sont absents de ce monde : animations optionnelles non testées.

Les assertions de confidentialité portent sur les documents créés : elles ne remplacent pas une recette multijoueur sur deux navigateurs. La suite Quench héritée n'a pas été exécutée. Aucun monde v13 existant ni compendium externe n'a été migré pendant cette validation. Aucun paquet de release n'a été publié.

## Démonstration Ubuntu

- URL : **http://localhost:30004**
- Monde : **L5R — Démonstration v14** (`l5r-v14-demo`).
- Compte : **Gamemaster**, sans mot de passe dans ce monde de test.
- Acteurs : **Akodo Haru — Démonstration** et **Bandit — Démonstration**.
- Système : `/home/tonio2581/L5R`, via un lien symbolique.
- Application : `/home/tonio2581/foundry-v14`.
- Données isolées : `/home/tonio2581/foundry-v14-l5r`.
- UPnP désactivé ; aucune donnée de campagne Star Wars modifiée.

Pour démarrer si le serveur est arrêté :

```bash
/home/tonio2581/.nvm/versions/node/v24.15.0/bin/node \
  /home/tonio2581/foundry-v14/main.js \
  --dataPath=/home/tonio2581/foundry-v14-l5r \
  --port=30004 --world=l5r-v14-demo
```

Ne pas lancer une seconde instance sur les mêmes données. Journal de cette session : `/home/tonio2581/foundry-v14-l5r/server.log`.

## Reproduire les tests

```bash
cd /home/tonio2581/L5R
export PATH=/home/tonio2581/.nvm/versions/node/v24.15.0/bin:$PATH
npm ci --ignore-scripts
npx playwright install chromium
npm test
npm run lint:js
npm run build:css
npm run test:foundry-v14
```

Les tests navigateur nécessitent le serveur ci-dessus et le compte Gamemaster libre. Ils refusent un monde qui ne porte pas le nom et l'identifiant de démonstration. Ils créent des documents temporaires, remplacent les acteurs de démonstration marqués pour les tests et laissent des messages de chat. Résultats et capture : `test-results/v14/` (ignoré par Git). `FOUNDRY_TEST_URL` permet de changer le port de test.

## Références officielles

- [Guides de migration](https://foundryvtt.com/article/migration/).
- [Suppressions des API précédemment dépréciées en v14](https://github.com/foundryvtt/foundryvtt/issues/13436).
- [Notes de version 14.367](https://foundryvtt.com/releases/14.367).
- [DialogV2](https://foundryvtt.com/api/v14/classes/foundry.applications.api.DialogV2.html).
- [ChatMessage](https://foundryvtt.com/api/v14/classes/foundry.documents.ChatMessage.html).
- [ActiveEffect](https://foundryvtt.com/api/v14/classes/foundry.documents.ActiveEffect.html).
- [Roll](https://foundryvtt.com/api/v14/classes/foundry.dice.Roll.html).

Les signatures ont également été confrontées au code officiel de l'installation 14.367 et aux essais d'exécution. L'organisation des tests isolés reprend les conventions de StarWarsFFG.
