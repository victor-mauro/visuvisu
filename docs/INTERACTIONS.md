# Guide des interactions — VISU VISU

Documentation de référence des interactions de projets pour le site visuvisu.fr.
Le site lit `projects.json` et génère la grille de projets ; chaque projet déclare une
`interaction` qui définit son comportement au survol / au clic.

## Vue d'ensemble

Le site supporte **4 interactions** :

1. **zoom** — Zoom au survol
2. **unzoom** — Dézoom au survol (inverse de zoom)
3. **toggle** — Bascule entre deux médias
4. **3d** — Viewer 3D interactif

## Nomenclature unifiée

Propriétés de base (communes à toutes les interactions) :

- `image` / `video` = média principal
- `image_hover` / `video_hover` = au survol (toggle)
- `image_zoomed` / `video_zoomed` = version zoomée (zoom / unzoom)

---

## 1. ZOOM — Zoom au survol

**Description.** Affiche un média normal par défaut, puis zoome en plein écran au survol.

**Comportement**
- Repos : image/vidéo normale (centrée, `object-fit: contain`)
- Hover : image/vidéo zoomée (plein écran, `object-fit: cover`)
- Après hover : retour au média normal

**Combinaisons supportées** : Image → Image, Vidéo → Vidéo, Image → Vidéo, Vidéo → Image

**Propriétés JSON**

| Propriété | Type | Requis | Description |
|---|---|---|---|
| `image` | URL | Optionnel* | Image affichée par défaut |
| `video` | URL | Optionnel* | Vidéo affichée par défaut |
| `image_zoomed` | URL | Optionnel | Image affichée au hover |
| `video_zoomed` | URL | Optionnel | Vidéo affichée au hover |
| `interaction` | String | Oui | Doit être `"zoom"` |

*Au moins `image` OU `video` requis.

**Exemples**

Image → Image (classique) :
```json
{
  "id": "projet_zoom_classique",
  "title": "Mon projet, 2025",
  "image": "https://res.cloudinary.com/.../normale.jpg",
  "image_zoomed": "https://res.cloudinary.com/.../zoomee.jpg",
  "interaction": "zoom"
}
```

Image → Vidéo (style Enso) :
```json
{
  "id": "enso_2022",
  "title": "CT&GP, Enso, 2022",
  "image": "https://res.cloudinary.com/.../statique.jpg",
  "video_zoomed": "https://res.cloudinary.com/.../animation.mp4",
  "interaction": "zoom"
}
```

Vidéo → Image :
```json
{
  "id": "projet_video_to_image",
  "title": "Mon projet, 2025",
  "video": "https://res.cloudinary.com/.../animation.mp4",
  "image_zoomed": "https://res.cloudinary.com/.../finale.jpg",
  "interaction": "zoom"
}
```

Image unique (auto-zoom) :
```json
{
  "id": "projet_simple",
  "title": "Mon projet, 2025",
  "image": "https://res.cloudinary.com/.../photo.jpg",
  "interaction": "zoom"
}
```
Si `image_zoomed` n'est pas fourni, l'image se zoome sur elle-même.

---

## 2. UNZOOM — Dézoom au survol

**Description.** L'inverse de `zoom` : affiche un média en plein écran par défaut, puis
dézoome au survol pour montrer le média normalement.

**Comportement**
- Repos : image/vidéo zoomée (plein écran, `object-fit: cover`)
- Hover : image/vidéo normale (centrée, `object-fit: contain`)
- Après hover : retour au média zoomé

**Combinaisons supportées** : Image → Image, Vidéo → Vidéo, Image → Vidéo, Vidéo → Image

**Propriétés JSON**

| Propriété | Type | Requis | Description |
|---|---|---|---|
| `image` | URL | Optionnel | Image normale (affichée au hover) |
| `video` | URL | Optionnel | Vidéo normale (affichée au hover) |
| `image_zoomed` | URL | Optionnel* | Image zoomée (par défaut) |
| `video_zoomed` | URL | Optionnel* | Vidéo zoomée (par défaut) |
| `interaction` | String | Oui | Doit être `"unzoom"` |

*Au moins `image_zoomed` OU `video_zoomed` requis.

**Exemples**

Image zoomée → Image normale :
```json
{
  "id": "projet_unzoom",
  "title": "Mon projet, 2025",
  "image": "https://res.cloudinary.com/.../detail.jpg",
  "image_zoomed": "https://res.cloudinary.com/.../vue_large.jpg",
  "interaction": "unzoom"
}
```

Vidéo zoomée → Image détail :
```json
{
  "id": "projet_video_unzoom",
  "title": "Mon projet, 2025",
  "image": "https://res.cloudinary.com/.../detail.jpg",
  "video_zoomed": "https://res.cloudinary.com/.../animation.mp4",
  "interaction": "unzoom"
}
```

---

## 3. TOGGLE — Bascule entre deux médias

**Description.** Bascule entre deux versions d'un média au survol. Souvent utilisé pour
avant/après ou jour/nuit.

**Comportement**
- Repos : média par défaut
- Hover : média alternatif
- Après hover : retour au média par défaut

**Différence avec zoom/unzoom** : les médias gardent la **même taille** (pas de plein écran).

**Combinaisons supportées** : Image → Image, Vidéo → Vidéo, Image → Vidéo, Vidéo → Image

**Propriétés JSON**

| Propriété | Type | Requis | Description |
|---|---|---|---|
| `image` | URL | Optionnel* | Image par défaut |
| `video` | URL | Optionnel* | Vidéo par défaut |
| `image_hover` | URL | Optionnel** | Image au hover |
| `video_hover` | URL | Optionnel** | Vidéo au hover |
| `interaction` | String | Oui | Doit être `"toggle"` |

*Au moins `image` OU `video` requis.
**Au moins `image_hover` OU `video_hover` requis.

**Exemples**

Avant/Après (classique) :
```json
{
  "id": "avant_apres",
  "title": "Rénovation, 2025",
  "image": "https://res.cloudinary.com/.../avant.jpg",
  "image_hover": "https://res.cloudinary.com/.../apres.jpg",
  "interaction": "toggle"
}
```

Jour/Nuit :
```json
{
  "id": "jour_nuit",
  "title": "Façade, 2025",
  "image": "https://res.cloudinary.com/.../jour.jpg",
  "image_hover": "https://res.cloudinary.com/.../nuit.jpg",
  "interaction": "toggle"
}
```

Image → Vidéo (toggle) :
```json
{
  "id": "toggle_video",
  "title": "Animation, 2025",
  "image": "https://res.cloudinary.com/.../preview.jpg",
  "video_hover": "https://res.cloudinary.com/.../animation.mp4",
  "interaction": "toggle"
}
```

---

## 4. 3D — Viewer 3D interactif

**Description.** Affiche un modèle 3D interactif avec contrôles de rotation, zoom et
auto-rotation.

**Comportement**
- Rotation : clic + glisser (ou doigt sur mobile)
- Zoom : molette souris (ou pinch sur mobile)
- Auto-rotation : le modèle tourne automatiquement
- AR ready : compatible avec la réalité augmentée (sur appareils compatibles)

**Format de fichier** : GLB (recommandé) — format 3D compact et performant.

**Comment créer un GLB ?**
- Depuis Blender : File → Export → glTF 2.0 (.glb)
- Depuis SketchUp : exporter en COLLADA, puis convertir en GLB
- Depuis 3ds Max : Babylon.js exporter
- Convertisseur en ligne : https://products.aspose.app/3d/conversion/obj-to-glb

**Propriétés JSON**

| Propriété | Type | Requis | Description |
|---|---|---|---|
| `model_3d` | URL | Oui | URL du fichier `.glb` sur Cloudinary |
| `interaction` | String | Oui | Doit être `"3d"` |

**Exemple**
```json
{
  "id": "mon_modele_3d",
  "title": "Maquette 3D, 2025",
  "model_3d": "https://res.cloudinary.com/.../maquette.glb",
  "interaction": "3d"
}
```

---

## Tableau récapitulatif

| Interaction | Par défaut | Au hover | Responsive | Format supporté |
|---|---|---|---|---|
| zoom | Normal | Plein écran | Oui | Image, Vidéo |
| unzoom | Plein écran | Normal | Oui | Image, Vidéo |
| toggle | Média A | Média B | Oui | Image, Vidéo |
| 3d | Modèle 3D rotatif | — | Oui | GLB |

---

## Groupement de projets

Pour regrouper plusieurs projets visuellement, utiliser la propriété `group` :

```json
{
  "id": "projet1",
  "title": "Projet 1",
  "image": "...",
  "interaction": "zoom",
  "group": "nom_du_groupe"
},
{
  "id": "projet2",
  "title": "Projet 2",
  "image": "...",
  "interaction": "toggle",
  "group": "nom_du_groupe"
}
```

Les projets avec le même `group` apparaissent visuellement groupés dans la liste
(sans bordure entre eux).

---

## Cas d'usage recommandés

**Zoom** : révéler des détails ; architecture (vue d'ensemble → détail) ;
produit (contexte → gros plan).

**Unzoom** : contexte dramatique (focus → vue large) ; storytelling inversé
(détail → ensemble) ; effet « reveal ».

**Toggle** : avant/après rénovation ; jour/nuit ; variations de design ;
états différents d'un projet.

**3D** : maquettes architecturales ; objets design ; mobilier ; espaces intérieurs ;
sculptures.

---

## Notes importantes

**Taille des fichiers**
- Images : optimiser pour le web (WebP recommandé, < 2 Mo)
- Vidéos : MP4 H.264, < 10 Mo idéalement
- Modèles 3D : GLB optimisé, < 20 Mo

**Compatibilité**
- Chrome, Firefox, Safari, Edge (versions récentes) : OK
- iOS Safari, Chrome Mobile, Firefox Mobile : OK
- Internet Explorer : non supporté

**Performance**
- Les interactions sont désactivées sur mobile < 480 px
- Les vidéos sont préchargées en arrière-plan
- Les images sont préchargées en arrière-plan
- Les modèles 3D utilisent le cache navigateur

**Responsive**
- Desktop : toutes les interactions actives
- Tablette : toutes les interactions actives
- Mobile < 480 px : affichage simple sans interaction (background-image)

---

## Aide au choix

Je veux…
- Zoomer sur les détails → `zoom`
- Montrer l'avant/après → `toggle`
- Partir d'un gros plan → `unzoom`
- Montrer un modèle 3D → `3d`
- Révéler une animation → `zoom` (image → vidéo)
- Comparer deux versions → `toggle`

---

## Template vide

```json
{
  "id": "mon_projet_2025",
  "title": "Mon projet, 2025",
  "interaction": "zoom",
  "image": "https://res.cloudinary.com/.../...",
  "image_zoomed": "https://res.cloudinary.com/.../...",
  "group": "nom_optionnel"
}
```

Remplacer les URLs, l'interaction et les propriétés selon les besoins.
