# Difficulté définie par le MJ

Dans le chat, le bouton **ND** (infobulle « Difficulté MJ »), réservé aux MJ, ouvre le réglage partagé du monde. Saisir un ND de base, cocher **Imposer ce ND à tous les jets**, puis enregistrer. Le bouton indique alors le ND actif. Désactiver cette option rétablit les ND habituels du système.

Le ND de base remplace la saisie du joueur et les ND automatiques, notamment la défense de la cible et la difficulté des sorts. Les augmentations déclarées ajoutent toujours 5 chacune, et les modificateurs existants continuent de s'appliquer. Exemple : ND 25 + deux augmentations + pénalité de condition de 5 = ND final 40. Les blessures continuent de modifier le total du jet selon les règles existantes.

Les joueurs voient le ND imposé dans leurs dialogues ; le champ ND devient non modifiable. Une modification par le MJ se transmet également aux dialogues déjà ouverts. Le réglage reste actif jusqu'à sa désactivation et est conservé après reconnexion.

Les jets de compétence, de trait, d'anneau, de PNJ, de magie, de maho et de peur utilisent ce ND pour déterminer le résultat. Les dégâts, l'initiative et les jets directs publiés avec des données Roll reçoivent une comparaison au ND dans le chat, sans changer les dégâts ni l'initiative. Un message de texte seul n'est pas un jet. Les modes privé et aveugle sont conservés.

Chaque message conserve le ND utilisé au moment du jet : les changements ultérieurs ne recalculent pas les anciens résultats.

## Validation

Tests unitaires : `npm run test:unit`.

Test navigateur : `node scripts/test-gm-difficulty.cjs`, avec une instance Foundry v14 dédiée sur le port 30005, le monde `l5r-gm-difficulty-test` intitulé `L5R GM difficulty TEST` et un utilisateur `Gamemaster` sans mot de passe. Le script refuse les autres mondes. Il crée des acteurs et un utilisateur de test dans ce monde jetable ; ne pas le lancer sur une partie réelle. Le système doit être installé sous son identifiant technique `l5r4-enhanced`.

Ce test ouvre deux sessions (MJ et joueur), contrôle les droits, la synchronisation et les dialogues, les augmentations, les différents types de jets, la confidentialité et la désactivation du réglage. Une capture du dialogue est enregistrée dans `test-results/gm-difficulty/settings.png`.
