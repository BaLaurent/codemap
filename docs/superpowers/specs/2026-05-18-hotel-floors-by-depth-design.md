# Design — Étages de l'hôtel par profondeur de dossier + Tree interactive

Date : 2026-05-18
Branche : `feature/hotel-floors-by-depth`

## Problème

Sur un projet avec beaucoup de dossiers et sous-dossiers :

1. La vue Tree (`FileGraph.tsx`, route `/`) est un canvas en lecture seule, sans
   zoom/pan/clic. Inutilisable au-delà de quelques dizaines de nœuds.
2. La vue Hôtel (`HabboRoom.tsx`, route `/hotel`) manque de profondeur : le
   numéro d'étage est dérivé du **rang d'activité git** (liste plate
   `hotFolders` découpée en pyramide), pas de l'arborescence réelle. Aucun lien
   entre les étages et la structure du projet.

## Objectif

- L'hôtel a des étages qui correspondent à la **profondeur des dossiers**.
- On n'affiche **qu'un seul étage à la fois**, suivant l'agent en cours, avec
  une navigation explicite.
- La vue Tree devient **interactive** (zoom, pan, repli/dépli des dossiers).

## Décisions validées (brainstorming)

| Sujet | Décision |
|---|---|
| Modèle d'étages | **Profondeur globale** : étage N = tous les dossiers de profondeur N, toutes racines confondues |
| Vue Tree | **Rendue interactive** (on la garde, pas de suppression) |
| Affichage hôtel | **Un seul étage visible** à la fois |
| Étage affiché par défaut | Celui de l'**agent focus** sélectionné |
| Manuel vs auto | Sélection d'étage manuelle = **pause** du suivi ; **sélectionner un agent** (◀/▶) **réactive** le suivi auto sur cet agent |
| Code mort | `multi-floor.ts` + `MultiFloorHotel.tsx` supprimés (jamais montés dans `App.tsx`) |

## Approche retenue : Option B (modules extraits)

Deux modules profonds à interface simple, consommés par `HabboRoom` ; pas de
logique nouvelle entassée dans `HabboRoom` (déjà 1239 lignes).

```
/api/graph (arbre complet) ──┐
                             ├─► floor-by-depth.ts ──► FloorModel[]
/api/hot-folders (scores) ───┘     (groupe les dossiers par profondeur de chemin)
                                            │
useFloorNavigation.ts ◄─────────────────────┘  (état: focusAgentId, manualFloor?, follow)
   │  entrées: agents + leur fichier courant, FloorModel[]
   │  sortie: currentFloorIndex, focusAgentId, actions
   ▼
HabboRoom.tsx ── ne rend QUE currentFloor ── + <FloorNavBar/>
```

## Composants

### 1. `client/src/layout/floor-by-depth.ts` (nouveau, fonction pure)

- Entrée : arbre de fichiers (`graphDataRef`, nœuds avec `isFolder` + chemin) et
  scores git (`FolderScore[]`).
- Sortie : `FloorModel[]`, indexé par profondeur.
  - **Profondeur** = nombre de segments du chemin du dossier.
    `client` → étage 0, `client/src` → étage 1,
    `client/src/components` → étage 2.
  - Un fichier appartient à la chambre de son dossier ; l'étage de cette
    chambre = profondeur du dossier.
  - Au sein d'un étage, les chambres sont ordonnées par score git (les plus
    chaudes au centre, comme le rendu actuel).
- Cas limites couverts : projet multi-racines, fichier directement à la racine
  (profondeur 0), dossiers intermédiaires vides, dossier sans fichier.
- Interface :
  - `buildFloorsByDepth(graph, hotFolders): FloorModel[]`
  - `floorOfFolder(folderPath): number`
  - `findFloorForFile(floors, filePath): number | null`

### 2. `client/src/hooks/useFloorNavigation.ts` (nouveau)

Machine à états de navigation. Aucune dépendance au canvas.

- État interne : `focusAgentId`, `manualFloor: number | null`, `follow: boolean`.
- Entrées : liste des agents (id + chemin du fichier courant), `FloorModel[]`.
- Sortie : `currentFloorIndex`, `focusAgentId`, `agentsElsewhere[]`
  (agents actifs sur d'autres étages), et les actions ci-dessous.
- Règles :
  - `follow = true` : `currentFloorIndex` = profondeur du dossier du fichier
    courant de l'agent focus. Agent idle/coffee → on conserve son dernier
    étage connu.
  - `selectAgent(next|prev|id)` : change `focusAgentId`, repasse
    `follow = true`, saute à l'étage de cet agent.
  - `selectFloor(n)` : `manualFloor = n`, `follow = false` ; l'étage ne bouge
    plus tout seul tant qu'on n'a pas resélectionné un agent.
  - `agentsElsewhere` : agents en activité dont la profondeur ≠
    `currentFloorIndex` (pour le badge).

### 3. `client/src/components/FloorNavBar.tsx` (nouveau, DOM léger)

UI de navigation, style aligné sur `ActivityLegend` (pas de canvas) :

- Boutons **Agent ◀ / ▶** (cycle d'agent focus + reprise du suivi).
- Sélecteur d'étage **▲ / ▼** + numéro/étage courant (déclenche la pause).
- Badges **« Agent 2 · étage 3 ▸ »** par agent actif ailleurs ; clic = focus
  cet agent.

### 4. `client/src/components/HabboRoom.tsx` (modifié)

- Remplacer la layout pyramide inline (~lignes 100–220) par :
  `floors = buildFloorsByDepth(...)`, puis ne construire chambres/desks que
  pour `floors[currentFloorIndex]`.
- Les agents existent toujours tous (positions, mouvement, grâce 30 s
  inchangés) mais ne sont **dessinés que s'ils sont sur l'étage affiché**.
  Un agent qui change d'étage disparaît de la vue et réapparaît quand on
  rejoint son étage (ou via le badge).
- Monter `<FloorNavBar/>` et brancher `useFloorNavigation`.

### 5. `client/src/components/FileGraph.tsx` (modifié — workstream indépendant)

- **Zoom** (molette) + **pan** (drag) via une transform canvas.
- **Clic sur un dossier** = replier/déplier son sous-arbre, puis relayout. Les
  dossiers repliés affichent un compteur `+N`.
- Le flash d'activité (lecture/écriture) continue de fonctionner sur les
  nœuds visibles après transform.

### 6. Suppression de code mort

- `client/src/layout/multi-floor.ts`
- `client/src/components/MultiFloorHotel.tsx`

Vérifiés non montés dans `App.tsx` (seuls `FileGraph` et `HabboRoom` sont
routés). À supprimer une fois `floor-by-depth.ts` en place.

## Tests

- `floor-by-depth.test.ts` : profondeurs correctes, multi-racines, fichier à la
  racine, dossiers vides, ordre par score intra-étage.
- `useFloorNavigation.test.ts` : suivi auto, pause manuelle, reprise via
  sélection d'agent, agent idle conserve l'étage, plusieurs agents sur des
  étages différents, calcul de `agentsElsewhere`.
- `FileGraph` : fold/unfold change le layout ; zoom/pan ne casse pas le
  matching d'activité.

## Gestion des erreurs / cas limites

- Arbre vide / pas encore reçu : aucun étage → afficher un étage vide
  (placeholder), pas de crash.
- Agent focus supprimé (fin de grâce) : retomber sur le premier agent actif,
  sinon garder le dernier étage et `follow = false`.
- Profondeur d'un fichier sans dossier correspondant : `findFloorForFile`
  renvoie `null` → on ne change pas d'étage.

## Hors périmètre (YAGNI)

- Pas de mini-carte / vue d'ensemble multi-étages simultanée.
- Pas d'animation d'ascenseur entre étages (transition simple suffit).
- Pas de persistance de l'étage/agent sélectionné entre rechargements.
```
