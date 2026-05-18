# Addendum v2 — Corrections après test réel sur gros projet (2722 fichiers)

Date : 2026-05-18
Branche : `feature/hotel-floors-by-depth`

## Problèmes constatés en exécution

1. **Hôtel — chambres vides** : `floor-by-depth.ts` ne remplit les bureaux que
   depuis `recentFiles` des dossiers git-chauds (plafond global
   `HOT_FOLDERS_LIMIT = 12`). Sur 36 chambres d'un étage, ~4 ont des bureaux,
   le reste est vide. Les vrais fichiers (nœuds du graphe) sont ignorés.
2. **Hôtel — bruit** : le serveur scanne `node_modules`, `.git`, dossiers de
   build/binaires → étages saturés de dossiers non pertinents.
3. **Arbre — illisible** : 2722 nœuds tous dépliés → colonne écrasée par
   l'auto-fit. Zoom/pan/clic existent mais la vue par défaut est inutilisable.

## Décisions validées (questions du 2026-05-18)

| Sujet | Décision |
|---|---|
| Source des bureaux | **Vrais fichiers du dossier** (nœuds fichiers du graphe) |
| Dossiers sans fichier direct | **Pas de chambre** (masqués) |
| Bruit | **Filtrage serveur** d'une liste fixe (node_modules, .git, dist, build, .next, out, coverage, .turbo, .cache) |
| Vue Arbre | **Conservée mais minimale** : seulement l'arborescence autour des fichiers actifs |

### Détails tranchés par défaut (non demandés)

- Plafond bureaux/chambre : `MAX_FILES_PER_ROOM = 12`, tri par activité git
  décroissante puis nom ; au-delà du plafond, les fichiers excédentaires ne
  sont pas dessinés (pas d'indicateur `+N` : une chambre ne peut physiquement
  pas montrer 50 bureaux ; YAGNI).
- « Fichier actif » (vue Arbre) : nœud fichier dont
  `activityCount.reads + writes + searches > 0` **ou** ayant `lastActivity`.
  Ensemble affiché = ces fichiers + tous leurs dossiers ancêtres jusqu'à la
  racine (arbre connexe) + la racine. Zéro actif → message
  « Waiting for file activity… » existant.
- Liste d'ignore serveur : fixe (pas de parsing `.gitignore` — plus simple,
  couvre 99 % du bruit). Appliquée au scan initial ET au file-watcher.

## Plan d'implémentation v2 (3 tâches indépendantes, parallélisables)

### Task V1 — Filtrage serveur du bruit
`server/src/activity-store.ts` (+ tests existants verts).
- Constante `const IGNORED_DIRS = new Set(['node_modules','.git','dist','build','.next','out','coverage','.turbo','.cache','.svn','.hg'])`.
- Dans `scanDirectory` : ignorer toute entrée dossier dont le nom ∈ `IGNORED_DIRS`.
- Dans le watcher chokidar : option `ignored` couvrant ces dossiers (regex/glob).
- Aucun fichier client modifié.

### Task V2 — Bureaux = vrais fichiers + masquer dossiers vides
`client/src/layout/floor-by-depth.ts` (+ `floor-by-depth.test.ts`).
- `buildFloorsByDepth` reçoit déjà tout `nodes` (fichiers inclus). Construire
  une map `filesByParentRel : relativeFolderPath -> GraphNode[]` à partir des
  nœuds **fichiers** (`!isFolder`), parent dérivé du chemin relativisé.
- Pour chaque dossier : ses bureaux = ses fichiers directs (depuis la map),
  triés par `(reads+writes+searches)` décroissant puis nom, plafonnés à
  `MAX_FILES_PER_ROOM`. `filePositions` keyés par chemin projet-relatif complet
  (déjà le cas). `heatLevel` dérivé de l'activité du fichier (ou du score
  dossier en repli).
- **Masquer** : un dossier sans aucun fichier direct → pas de `RoomLayout`
  (continue la boucle). Les étages se densifient.
- API publique inchangée (`FloorModel`, `floorOfFolder`, `findFloorForFile`,
  `buildFloorsByDepth`). `hotFolders` reste accepté (heat/repli) mais n'est
  plus la source des bureaux. Aucun changement HabboRoom requis.
- Tests : fixtures avec nœuds fichiers absolus réalistes ; asserts : bureaux =
  fichiers réels, dossier sans fichier direct absent des `rooms`, plafond
  respecté, tri par activité.

### Task V3 — Arbre = mini-carte d'activité
`client/src/layout/tree-layout.ts` (helper pur + tests) et
`client/src/components/FileGraph.tsx`.
- Nouveau helper pur `pruneToActive(nodes: GraphNode[]): GraphNode[]` :
  garde les fichiers actifs (activité > 0 ou `lastActivity`), tous leurs
  dossiers ancêtres (par préfixe de chemin/`id`) et la racine. Retourne le
  sous-ensemble connexe. `[]` si rien d'actif (hors racine).
- `FileGraph` applique `pruneToActive` aux nœuds AVANT
  `calculateTreeLayout(...)`. Recalcul quand l'activité change (réutiliser le
  trigger existant : le compteur de nœuds ne suffit plus → recalculer aussi
  quand `activityVersionRef` change ; sinon forcer via `layoutDirtyRef`).
- Le repli au clic (B3) et zoom/pan (B2) restent ; `collapsedFoldersRef` reste
  vide par défaut (l'ensemble est déjà petit car limité à l'actif).
- Tests `tree-layout.test.ts` pour `pruneToActive` : fichier actif + ancêtres
  conservés, fichiers inactifs retirés, racine toujours présente, rien
  d'actif → `[]` (ou racine seule selon implémentation), arbre reste connexe.

## Hors périmètre

- Pas de parsing `.gitignore`. Pas d'indicateur d'overflow de bureaux.
- Pas de changement de la machine de navigation d'étage (inchangée, OK).
- Pas de persistance.

---

# Addendum v3 — Corrections après 2e test réel

Problèmes constatés : bureaux qui débordent des salles (hôtel) ; ▲▼ d'étage
incohérents (profondeurs vides omises) ; la mini-carte d'activité fait perdre
le côté explorateur de l'Arbre.

## Décisions

- **Arbre** : revirement validé — abandonner `pruneToActive`. Arbre COMPLET
  (après filtrage serveur), tous les dossiers de profondeur >= 1 repliés par
  défaut (`collapsedFoldersRef` pré-rempli au chargement du graphe), clic =
  déplier/replier (B3), zoom/pan (B2) conservés. `pruneToActive` + son câblage
  (trigger activity-version, empty-state `hasActiveNodes`) supprimés (code mort).
- **Hôtel — débordement** : taille de chaque salle dérivée du nombre de
  bureaux ; toutes les salles d'un étage dimensionnées sur la salle la plus
  remplie de cet étage (grille régulière, rien ne déborde, l'étage grandit en
  hauteur si besoin). Aucun fichier perdu. `HabboRoom` gère déjà des salles de
  taille variable (`room.width/height` par salle) — pas de changement chrome.
- **Hôtel — navigation d'étage** : `FloorNavBar` reçoit `availableFloors:
  number[]` (profondeurs réellement présentes, triées) ; ▲▼ saute d'un étage
  existant au suivant/précédent (plus de ±1 sur une profondeur inexistante) ;
  libellé toujours cohérent. Contrat `FloorNavBar` étendu (drift assumé,
  documenté ici).

## Tâches (séquentielles : W1 → W2 → W3, un commit chacune)

- **W1** `floor-by-depth.ts` (+test) : salles dimensionnées par contenu.
- **W2** `FloorNavBar.tsx` + `HabboRoom.tsx` : ▲▼ parmi étages existants.
- **W3** `FileGraph.tsx` + `tree-layout.ts` (+test) : arbre complet replié
  par défaut ; suppression de `pruneToActive` et de son câblage (code mort).
