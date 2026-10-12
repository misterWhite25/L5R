# L5R

Projet personnel et indépendant pour jouer à **La Légende des Cinq Anneaux, quatrième édition**, dans Foundry VTT.

Développé et maintenu par **Tonio (misterWhite25)** avec l'assistance de **Codex Astra**. Le premier objectif est l'adaptation à **Foundry VTT v14**, puis le développement de nos compendiums.

## État du projet

La préversion **3.3.0-beta.1** cible **Foundry VTT v14**, testée sous **14.367**. Elle n'est pas compatible v13. L'identifiant technique `l5r4-enhanced` reste conservé pour les références des documents et des mondes.

Validation : **1 023 tests unitaires** et **13 scénarios navigateur** dans un monde v14 isolé, sans erreur JavaScript relevée. Les mondes existants v13, les compendiums externes et les modules optionnels ne sont pas encore validés. Sauvegarder un monde avant toute migration.

Cette branche est une préversion de développement, sans release installable publiée. Voir [les instructions de test local](docs/foundry-v14.md).

## Indépendance et crédits

Ce projet repose sur [ernieayala/l5r4](https://github.com/ernieayala/l5r4). Merci à **Ernie Ayala et à tous les contributeurs du système d'origine** : leur travail constitue la base de ce système. L'historique Git et la licence MIT d'origine sont conservés.

Ce dépôt évolue séparément, sans remote vers le projet initial ni intention de lui soumettre nos modifications. Les contributions externes ne sont pas sollicitées.

La documentation héritée est conservée dans [docs/README-original.md](docs/README-original.md) à titre de référence ; ses liens d'installation concernent le système d'origine.

## Feuille de route

1. Auditer les API utilisées et appliquer les recommandations officielles Foundry v14.
2. Valider les fiches, les jets Roll & Keep, le combat, les effets et la sauvegarde des données dans un monde de test dédié.
3. Publier une version installable après validation.
4. Développer les compendiums du projet.

Voir [le suivi de migration](docs/foundry-v14.md). Le système reste une réalisation non officielle ; les marques et contenus de jeu appartiennent à leurs détenteurs respectifs. Voir [LICENSE](LICENSE).
