// Gabarit unique des pages : accueil (index.html), projets (<slug>.html) et 404.html.
// Même mise en page partout : en-tête, présentation | image | liste des projets, pied de page.
// Une page projet affiche son projet sélectionné ; l'accueil en tire un au hasard (site.js).
// Ensuite, site.js change de projet sans recharger la page (history.pushState).
import { echapper, t, noms, head, urlPublique, ids } from './commun.mjs';

// Interactions connues (voir site.js) et clés des médias d'un projet.
export const INTERACTIONS = ['zoom', 'unzoom', 'toggle', '3d'];
export const CLES_MEDIAS = ['image', 'image_hover', 'image_zoomed', 'video', 'video_hover', 'video_zoomed', 'model_3d'];
const estVideo = (f) => /\.(mp4|webm|ogg|mov)$/i.test(f);
const estModele = (f) => /\.(glb|gltf|ply|splat|ksplat|spz|sog)$/i.test(f);

/**
 * Largeur d'affichage de l'image (attribut sizes), pour que le navigateur choisisse entre la
 * variante -1000 et l'original. Toggle : image entière dans le cadre. Zoom / unzoom : image
 * qui couvre tout le cadre (ordinateur : 50 % de large, hauteur de l'écran moins en-tête et
 * pied de page ; tablette : 100 % de large, 60 % de haut). Plafonnée à la taille réelle, pour
 * que l'image ne soit jamais affichée plus grande qu'avant. Mobile : l'original, comme le fond.
 */
function tailles(largeur, hauteur, couvre) {
  const l = `${largeur}px`;
  const r = Number((largeur / hauteur).toFixed(4));
  if (!couvre) return `(max-width: 479px) ${l}, (max-width: 991px) min(100vw, ${l}), min(50vw, ${l})`;
  return `(max-width: 479px) ${l}, (max-width: 991px) min(max(100vw, 60vh * ${r}), ${l}), min(max(50vw, (100vh - 125px) * ${r}), ${l})`;
}

/** Texte alternatif d'un média, lu dans le bloc « alt » du projet ; le build signale ceux qui manquent. */
export function texteAlt(ctx, projet, fichier) {
  const entree = (projet.alt ?? []).find((a) => a.fichier === fichier);
  if (!entree) ctx.avertir(`${projet.slug} : texte alternatif manquant pour ${fichier} (bloc « alt »)`);
  else if (!entree[`texte_${ctx.langue}`]) ctx.avertir(`${projet.slug} : texte alternatif « texte_${ctx.langue} » manquant pour ${fichier}`);
  return entree ? t(entree, 'texte', ctx.langue) : '';
}

/** Informations d'un média pour site.js : texte alternatif et, pour une image avec variante, srcset + sizes. */
function infoMedia(ctx, projet, fichier) {
  const info = { alt: texteAlt(ctx, projet, fichier) };
  if (estVideo(fichier) || estModele(fichier)) return info;
  const { largeur, hauteur, variante, largeurVariante } = ctx.infoImage(fichier);
  if (variante) {
    info.srcset = `${ctx.racine}${variante} ${largeurVariante}w, ${ctx.racine}${fichier} ${largeur}w`;
    info.sizes = tailles(largeur, hauteur, ['zoom', 'unzoom'].includes(projet.interaction));
  }
  return info;
}

/** Projet tel que site.js le lit (même clés que l'ancien projects.json, chemins relatifs à la page). */
function donneesProjet(ctx, projet) {
  const d = {
    id: projet.slug,
    url: `${ctx.base}${projet.slug}.html`,
    titre: t(projet, 'titre', ctx.langue),
    onglet: ongletProjet(ctx, projet),
    interaction: projet.interaction,
  };
  if (projet.groupe) d.group = projet.groupe;
  d.medias = {};
  for (const cle of CLES_MEDIAS) {
    if (!projet[cle]) continue;
    d[cle] = ctx.racine + projet[cle];
    d.medias[d[cle]] = infoMedia(ctx, projet, projet[cle]);
  }
  return d;
}

const ongletProjet = (ctx, projet) => `${t(projet, 'onglet', ctx.langue)} | ${ctx.site.nom_site}`;

/**
 * Média affiché d'emblée dans le HTML (identique à ce que site.js affiche sur ordinateur) :
 * zoom → image (ou vidéo) normale, unzoom → média zoomé, toggle → image normale,
 * 3d → image d'aperçu (remplacée par la vue 3D).
 */
function mediaInitial(ctx, projet) {
  const p = projet;
  let fichier, classe = 'main-image';
  if (p.interaction === 'zoom') { fichier = p.video ?? p.image; classe = 'main-image zoomable'; }
  else if (p.interaction === 'unzoom') { fichier = p.video_zoomed ?? p.image_zoomed ?? p.video ?? p.image; classe = 'main-image zoomed'; }
  else if (p.interaction === '3d') fichier = p.image;
  else fichier = p.video ?? p.image;
  if (!fichier) return { html: '', fond: null };
  const info = infoMedia(ctx, p, fichier);
  const src = ctx.racine + fichier;
  if (estVideo(fichier)) {
    return { html: `<video src="${src}" id="mainImage" class="${classe}" preload="auto" autoplay loop muted playsinline aria-label="${echapper(info.alt)}"></video>`, fond: null };
  }
  const { largeur, hauteur } = ctx.infoImage(fichier);
  const srcset = info.srcset ? ` srcset="${info.srcset}" sizes="${info.sizes}"` : '';
  return {
    html: `<img src="${src}"${srcset} width="${largeur}" height="${hauteur}" id="mainImage" class="${classe}" alt="${echapper(info.alt)}" fetchpriority="high">`,
    fond: fichier,
  };
}

/** Classe de groupe d'une ligne de la liste : lignes voisines d'un même groupe resserrées. */
function classeGroupe(projets, i) {
  const p = projets[i];
  if (!p.groupe) return '';
  const avant = i > 0 && projets[i - 1].groupe === p.groupe;
  const apres = i < projets.length - 1 && projets[i + 1].groupe === p.groupe;
  if (!avant && apres) return ' group-first';
  if (avant && apres) return ' group-middle';
  if (avant && !apres) return ' group-last';
  return '';
}

// --- Données structurées d'un projet ---------------------------------------------

function personne(ctx, nom) {
  const p = { '@type': 'Person', name: nom };
  if (nom === ctx.site.contact_nom) p['@id'] = ids(ctx.site).auteur;
  return p;
}

/** Le projet décrit comme une œuvre (CreativeWork), avec ses images et vidéos créditées. */
function oeuvre(ctx, projet, description) {
  const { site, langue } = ctx;
  const url = urlPublique(site, langue, `${projet.slug}.html`);
  const fichiers = [...new Set(CLES_MEDIAS.map((c) => projet[c]).filter(Boolean))];
  const createurs = new Set();
  const images = [];
  const videos = [];
  for (const f of fichiers) {
    const alt = texteAlt(ctx, projet, f);
    if (estVideo(f)) {
      const entree = (projet.alt ?? []).find((a) => a.fichier === f) ?? {};
      const qui = entree.createurs ?? [site.contact_nom];
      qui.forEach((n) => createurs.add(n));
      const { duree, largeur, hauteur } = ctx.infoVideo(f);
      const v = {
        '@type': 'VideoObject',
        name: t(projet, 'titre', langue),
        description: alt,
        contentUrl: `${site.url}/${f}`,
        thumbnailUrl: `${site.url}/${projet.image ?? partageProjet(projet)}`,
        encodingFormat: 'video/mp4',
        width: largeur,
        height: hauteur,
        creator: qui.map((n) => personne(ctx, n)),
        creditText: noms(qui, langue),
        copyrightNotice: `© ${projet.annee} ${noms(qui, langue)}`,
      };
      if (duree) v.duration = duree;
      videos.push(v);
    } else if (!estModele(f)) {
      const { largeur, hauteur, credit } = ctx.infoImage(f);
      credit.createurs.forEach((n) => createurs.add(n));
      images.push({
        '@type': 'ImageObject',
        contentUrl: `${site.url}/${f}`,
        url: `${site.url}/${f}`,
        width: largeur,
        height: hauteur,
        encodingFormat: 'image/webp',
        caption: alt,
        creator: credit.createurs.map((n) => personne(ctx, n)),
        creditText: noms(credit.createurs, langue),
        copyrightNotice: credit.droits,
      });
    }
  }
  if (!createurs.size) createurs.add(site.contact_nom);
  const donnees = {
    '@type': 'CreativeWork',
    '@id': `${url}#projet`,
    name: t(projet, 'titre', langue),
    description,
    url,
    inLanguage: langue,
    dateCreated: String(projet.annee),
    creator: [...createurs].map((n) => personne(ctx, n)),
    publisher: { '@id': ids(site).studio },
    isPartOf: { '@id': ids(site).site },
  };
  if (images.length) donnees.image = images;
  if (videos.length) donnees.video = videos;
  return donnees;
}

/** Image de l'aperçu de partage d'un projet (1200 × 630), sauf « partage » donné dans son contenu. */
export const partageProjet = (projet) => projet.partage ?? `images/partage/${projet.slug}.jpg`;

// --- Page complète ------------------------------------------------------------------

/**
 * @param ctx    { site, projets, langue, langues, fichier, typePage, racine, base, prefixes, versions,
 *                 infoImage, infoVideo, avertir }
 * @param projet projet sélectionné (page projet) ; null pour l'accueil et la 404
 */
export function page(ctx, projet) {
  const { site, projets, langue, racine } = ctx;
  const accueil = !projet;
  const defaut = projet ?? projets[0]; // accueil sans JavaScript : premier projet de la liste

  // Média initial : sur l'accueil, dans <noscript> (avec JavaScript, le projet est tiré au hasard).
  const media = mediaInitial(ctx, defaut);
  const contenuImage = accueil ? `<noscript>${media.html}</noscript>` : media.html;
  const zoomeDEmblee = defaut.interaction === 'unzoom' && !accueil ? ' zoomed' : '';

  const liste = projets
    .map((p, i) => {
      const actif = p === projet ? ' active" aria-current="true' : '';
      return `<a class="project-item${classeGroupe(projets, i)}${actif}" id="project-${p.slug}" href="${ctx.base}${p.slug}.html">${echapper(t(p, 'titre', langue))}</a>`;
    })
    .join('\n      ');

  const langues = ctx.langues
    .map((l) => {
      const href = `${ctx.prefixes[l]}${projet ? `${projet.slug}.html` : ''}`;
      const actif = l === langue ? ' class="active" aria-current="true"' : '';
      return `<a href="${href}" hreflang="${l}" lang="${l}"${actif} data-texte="${l.toUpperCase()}">${l.toUpperCase()}</a>`;
    })
    .join('\n      <span aria-hidden="true">/</span>\n      ');

  // Logo : titre principal (h1) de l'accueil ; sur les pages projets, le h1 est le titre du projet (masqué).
  const baliseLogo = accueil && ctx.typePage === 'accueil' ? 'h1' : 'p';
  const titreCache = projet
    ? `\n      <h1 class="visuellement-cache">${echapper(t(projet, 'titre', langue))}</h1>`
    : ctx.typePage === '404' ? `\n      <h1 class="visuellement-cache">${echapper(ctx.titre404)}</h1>` : '';
  const contact = `<a href="${site.contact_lien}" target="_blank" rel="noopener noreferrer">${echapper(site.contact_nom)}</a>
      <a href="mailto:${site.contact_email}">${site.contact_email}</a>`;
  const intro = echapper(t(site, 'intro', langue));

  // Données lues par site.js : projets, adresses des langues, bibliothèques 3D.
  const donnees = {
    langue,
    page: ctx.typePage,
    accueil: { onglet: ctx.typePage === '404' ? `${ctx.titre404} | ${site.nom_site}` : t(site, 'onglet', langue) },
    langues: ctx.prefixes,
    vendor: Object.fromEntries(Object.entries(ctx.versions.vendor).map(([k, v]) => [k, racine + v])),
    projets: projets.map((p) => donneesProjet(ctx, p)),
  };
  const json = JSON.stringify(donnees).replace(/</g, '\\u003c');

  // <head> : référencement propre à la page.
  let tete;
  if (projet) {
    const description = t(projet, 'description', langue);
    const fichierPartage = partageProjet(projet);
    const altPartage = projet.image ? texteAlt(ctx, projet, projet.image) : texteAlt(ctx, projet, projet.video ?? projet.video_zoomed ?? projet.model_3d);
    tete = head(ctx, {
      titre: ongletProjet(ctx, projet),
      titrePartage: t(projet, 'onglet', langue),
      description,
      descriptionPartage: description,
      partage: { chemin: fichierPartage, alt: altPartage },
      donnees: [oeuvre(ctx, projet, description)],
      fondMobile: media.fond,
    });
  } else {
    tete = head(ctx, {
      titre: ctx.typePage === '404' ? `${ctx.titre404} | ${site.nom_site}` : t(site, 'onglet', langue),
      titrePartage: t(site, 'onglet', langue),
      description: t(site, 'description', langue),
      descriptionPartage: t(site, 'description_partage', langue),
      motsCles: ctx.typePage === 'accueil' ? t(site, 'mots_cles', langue) : '',
      partage: { chemin: t(site, 'image_partage', langue), alt: t(site, 'image_partage_alt', langue) },
      fondMobile: media.fond,
      indexer: ctx.typePage !== '404',
    });
  }

  return `<!DOCTYPE html>
<html lang="${langue}">
${tete}
<body>

  <!-- Marges latérales (mobile uniquement) -->
  <div class="marge-gauche"></div>
  <div class="marge-droite"></div>

  <!-- En-tête : logo (ouvre le menu sur tablette et mobile), langues -->
  <header class="header" id="header">
    <${baliseLogo} class="logo" id="logoToggle">${echapper(site.logo)}</${baliseLogo}>
    <nav class="langues" aria-label="${t(site, 'libelle_langues', langue)}">
      ${langues}
    </nav>
  </header>

  <!-- Menu déroulant (tablette et mobile) -->
  <nav class="menu-content" id="menuContent" aria-label="${t(site, 'libelle_menu', langue)}">
    <div class="intro">${intro}</div>
    <div class="contact-info">
      ${contact}
    </div>
  </nav>

  <main class="container">

    <!-- Colonne gauche : présentation -->
    <aside class="sidebar-left">
      <div class="intro">${intro}</div>
    </aside>

    <!-- Colonne centrale : image du projet -->
    <section class="main-content${zoomeDEmblee}" aria-label="${t(site, 'libelle_galerie', langue)}">${titreCache}
      <div class="image-wrapper" id="imageWrapper">${contenuImage}</div>
    </section>

    <!-- Colonne droite : liste des projets -->
    <nav class="sidebar-right" id="projectsList" aria-label="${t(site, 'libelle_liste', langue)}">
      ${liste}
    </nav>

  </main>

  <!-- Pied de page (ordinateur) : contact -->
  <footer class="footer">
    ${contact}
  </footer>

  <script type="application/json" id="donnees">${json}</script>
  <script src="${racine}js/site.js?v=${ctx.versions.js}"></script>
</body>
</html>
`;
}
