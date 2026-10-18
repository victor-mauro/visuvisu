// Éléments communs à toutes les pages : petits outils, <head> (référencement, aperçus de partage,
// données structurées). La mise en page elle-même est dans page.mjs.

// --- Petits outils ---------------------------------------------------------

/** Échappe le texte pour l'insérer dans du HTML. */
export function echapper(texte = '') {
  return String(texte).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Texte traduit : t(objet, 'titre', 'en') lit objet.titre_en (repli sur _fr, puis sur la clé sans suffixe). */
export function t(objet, cle, langue) {
  return objet[`${cle}_${langue}`] ?? objet[`${cle}_fr`] ?? objet[cle] ?? '';
}

/** Liste de noms : « A et B » / « A and B ». */
export function noms(liste, langue) {
  const et = langue === 'en' ? ' and ' : ' et ';
  return liste.length < 2 ? liste.join('') : `${liste.slice(0, -1).join(', ')}${et}${liste.at(-1)}`;
}

// --- Adresses -----------------------------------------------------------------

/** Adresse publique d'une page (canonical, hreflang, sitemap.xml) : fichier = 'index.html' ou '<slug>.html'. */
export function urlPublique(site, langue, fichier) {
  const dossier = langue === 'fr' ? '/' : `/${langue}/`;
  return `${site.url}${dossier}${fichier === 'index.html' ? '' : fichier}`;
}

/** Identifiants des données structurées, partagés par toutes les pages. */
export const ids = (site) => ({
  studio: `${site.url}/#studio`,
  auteur: `${site.url}/#victor-mauro`,
  site: `${site.url}/#site`,
});

const LOCALES = { fr: 'fr_FR', en: 'en_GB' }; // langue des aperçus de partage (og:locale)

// --- Données structurées (JSON-LD) -----------------------------------------------

/**
 * Le studio (ProfessionalService) et son fondateur (Person) sur toutes les pages, le site (WebSite)
 * sur l'accueil, plus ce que la page ajoute (une œuvre CreativeWork sur chaque page projet).
 */
function donneesStructurees(ctx, autres) {
  const { site, langue } = ctx;
  const s = site.studio;
  const id = ids(site);
  const studio = {
    '@type': 'ProfessionalService',
    '@id': id.studio,
    name: site.nom_site,
    alternateName: s.nom_alternatif,
    description: t(s, 'description', langue),
    url: `${site.url}/`,
    image: `${site.url}/${t(site, 'image_partage', langue)}`,
    logo: `${site.url}/images/interface/favicon.png`,
    telephone: s.telephone,
    email: site.contact_email,
    priceRange: s.gamme_prix,
    openingHours: s.horaires,
    address: {
      '@type': 'PostalAddress',
      addressLocality: s.adresse.ville,
      addressRegion: s.adresse.region,
      postalCode: s.adresse.code_postal,
      addressCountry: s.adresse.pays,
    },
    geo: { '@type': 'GeoCoordinates', latitude: s.latitude, longitude: s.longitude },
    areaServed: s.zones.map((nom, i) => ({ '@type': i === 0 ? 'City' : 'Country', name: nom })),
    knowsAbout: t(s, 'domaines', langue),
    founder: { '@id': id.auteur },
    sameAs: s.profils,
  };
  const auteur = {
    '@type': 'Person',
    '@id': id.auteur,
    name: site.contact_nom,
    url: site.contact_lien,
    email: site.contact_email,
    sameAs: s.profils,
    worksFor: { '@id': id.studio },
  };
  const graphe = [studio, auteur];
  if (ctx.typePage === 'accueil') {
    graphe.push({
      '@type': 'WebSite',
      '@id': id.site,
      name: site.nom_site,
      url: `${site.url}/`,
      description: t(site, 'description', langue),
      inLanguage: langue,
      publisher: { '@id': id.studio },
    });
  }
  graphe.push(...autres);
  const json = JSON.stringify({ '@context': 'https://schema.org', '@graph': graphe }, null, 2).replace(/</g, '\\u003c');
  return `<script type="application/ld+json">\n${json}\n  </script>`;
}

// --- <head> -------------------------------------------------------------------

/**
 * <head> : titre de l'onglet, description, langues, aperçu de partage, données structurées,
 * feuille de style. Rien de tout cela ne s'affiche dans la page.
 * partage : { chemin, alt } image 1200 × 630 de l'aperçu (WhatsApp, LinkedIn, iMessage…).
 * fondMobile : image affichée en fond sur mobile quand JavaScript est désactivé.
 */
export function head(ctx, { titre, titrePartage, description, descriptionPartage, partage, motsCles, donnees = [], fondMobile, indexer = true }) {
  const { site, langue, racine, versions } = ctx;
  const url = urlPublique(site, langue, ctx.fichier);
  const alternatives = ctx.langues
    .map((l) => `<link rel="alternate" hreflang="${l}" href="${urlPublique(site, l, ctx.fichier)}">`)
    .concat(`<link rel="alternate" hreflang="x-default" href="${urlPublique(site, 'fr', ctx.fichier)}">`)
    .join('\n  ');
  const { largeur, hauteur } = ctx.infoImage(partage.chemin);
  const imgUrl = `${site.url}/${partage.chemin}`;
  const localesAutres = ctx.langues
    .filter((l) => l !== langue)
    .map((l) => `\n  <meta property="og:locale:alternate" content="${LOCALES[l]}">`)
    .join('');
  const s = site.studio;
  // Sans JavaScript, sur mobile, l'image (transparente) est remplacée par le même fond qu'avec JavaScript.
  const noscript = fondMobile
    ? `\n  <noscript><style>@media (max-width: 479px) { .image-wrapper { background-image: url("${racine}${fondMobile}"); } }</style></noscript>`
    : '';
  // Modules de la vue 3D (three.js pour Spark) : chargés seulement à l'affichage d'un Gaussian splat.
  // (une adresse relative d'import map doit commencer par ./, ../ ou /)
  const r = racine || './';
  const importMap = JSON.stringify({ imports: { three: `${r}${versions.three}`, 'three/addons/': `${r}js/vendor/three/addons/` } });
  return `<head>
  <meta charset="utf-8">
  <title>${echapper(titre)}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${echapper(description)}">${motsCles ? `\n  <meta name="keywords" content="${echapper(motsCles)}">` : ''}
  <meta name="author" content="${echapper(s.nom_alternatif)}">
  <meta name="robots" content="${indexer ? 'index, follow' : 'noindex, follow'}">
  <meta name="geo.region" content="FR-13">
  <meta name="geo.placename" content="${echapper(s.adresse.ville)}">
  <meta name="geo.position" content="${s.latitude};${s.longitude}">
  <meta name="ICBM" content="${s.latitude}, ${s.longitude}">
${indexer ? `  <link rel="canonical" href="${url}">\n  ${alternatives}\n` : ''}
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${echapper(site.nom_site)}">
  <meta property="og:locale" content="${LOCALES[langue]}">${localesAutres}
  <meta property="og:url" content="${url}">
  <meta property="og:title" content="${echapper(titrePartage)}">
  <meta property="og:description" content="${echapper(descriptionPartage)}">
  <meta property="og:image" content="${imgUrl}">
  <meta property="og:image:width" content="${largeur}">
  <meta property="og:image:height" content="${hauteur}">
  <meta property="og:image:alt" content="${echapper(partage.alt)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${echapper(titrePartage)}">
  <meta name="twitter:description" content="${echapper(descriptionPartage)}">
  <meta name="twitter:image" content="${imgUrl}">
  <meta name="twitter:image:alt" content="${echapper(partage.alt)}">

  <link rel="icon" type="image/png" sizes="32x32" href="${racine}images/interface/favicon.png?v=${versions.icone}">
  <link rel="stylesheet" href="${racine}css/site.css?v=${versions.css}">
  <script type="importmap">${importMap}</script>${noscript}

  ${donneesStructurees(ctx, donnees)}
</head>`;
}
