#!/usr/bin/env node
// build.mjs — Génère les pages HTML du site à partir de content/ et templates/.
//
//   node build.mjs
//
// Sans dépendance (Node 18 ou plus). Écrit l'accueil et une page par projet à la racine
// (index.html, mejanes-2025.html…), les mêmes pages en anglais dans en/, puis 404.html,
// sitemap.xml et robots.txt. Vérifie au passage : médias manquants, textes alternatifs et
// traductions manquants, slugs invalides ou en double, liens internes cassés.
// S'il y a des avertissements, ils sont listés à la fin et le code de sortie vaut 1.

import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { page, partageProjet, INTERACTIONS, CLES_MEDIAS } from './templates/page.mjs';
import { t, urlPublique } from './templates/commun.mjs';

const RACINE = path.dirname(fileURLToPath(import.meta.url));
const LANGUES = ['fr', 'en'];
const avertissements = [];
const avertir = (message) => avertissements.push(message);

// ---------------------------------------------------------------------------
// 1. Lecture des fichiers de contenu (.md avec en-tête YAML simplifié)
// ---------------------------------------------------------------------------

/** Valeur simple : "texte", 'texte', nombre, true/false, [a, b] ou texte brut. */
function valeur(brut) {
  const v = brut.trim();
  if (v.length >= 2 && (v[0] === '"' || v[0] === "'") && v.at(-1) === v[0]) return v.slice(1, -1).replace(/\\"/g, '"');
  if (/^-?(0|[1-9]\d*)(\.\d+)?$/.test(v)) return Number(v); // « 0650… » reste du texte
  if (v === 'true' || v === 'false') return v === 'true';
  if (v.startsWith('[') && v.endsWith(']')) {
    // liste sur une ligne, en respectant les guillemets : [a, "b, c"]
    const elements = [];
    let courant = '', guillemet = null;
    for (const c of v.slice(1, -1)) {
      if (guillemet) { courant += c; if (c === guillemet) guillemet = null; }
      else if (c === '"' || c === "'") { courant += c; guillemet = c; }
      else if (c === ',') { elements.push(courant); courant = ''; }
      else courant += c;
    }
    if (courant.trim()) elements.push(courant);
    return elements.map(valeur);
  }
  return v;
}

/**
 * En-tête YAML simplifié : « cle: valeur », listes « - … », objets imbriqués par indentation
 * de 2 espaces, commentaires sur une ligne commençant par #.
 */
function lireEnTete(texte, fichier) {
  const lignes = texte.split('\n')
    .map((l, n) => ({ n: n + 2, indent: l.search(/\S/), brut: l.trim() }))
    .filter((l) => l.brut && !l.brut.startsWith('#'));
  let i = 0;
  const erreur = (l, msg) => { throw new Error(`${fichier}, ligne ${l.n} : ${msg}`); };

  function bloc(indent) {
    if (i >= lignes.length) return null;
    return lignes[i].brut.startsWith('- ') || lignes[i].brut === '-' ? liste(indent) : objet(indent);
  }
  function objet(indent, obj = {}) {
    while (i < lignes.length && lignes[i].indent === indent && !lignes[i].brut.startsWith('-')) {
      const l = lignes[i];
      const m = l.brut.match(/^([\w-]+):(?:\s+(.*))?$/);
      if (!m) erreur(l, `« cle: valeur » attendu, trouvé « ${l.brut} »`);
      i++;
      if (m[2] !== undefined && m[2] !== '') obj[m[1]] = valeur(m[2]);
      else if (i < lignes.length && lignes[i].indent > indent) obj[m[1]] = bloc(lignes[i].indent);
      else obj[m[1]] = null;
    }
    if (i < lignes.length && lignes[i].indent > indent) erreur(lignes[i], 'indentation inattendue');
    return obj;
  }
  function liste(indent) {
    const arr = [];
    while (i < lignes.length && lignes[i].indent === indent && lignes[i].brut.startsWith('-')) {
      const l = lignes[i];
      const reste = l.brut.replace(/^-\s*/, '');
      const indentElement = indent + (l.brut.length - reste.length);
      if (/^[\w-]+:(\s|$)/.test(reste) && !/^https?:/.test(reste)) {
        // élément objet : « - cle: valeur » suivi des autres clés alignées
        lignes[i] = { ...l, indent: indentElement, brut: reste };
        arr.push(objet(indentElement));
      } else {
        i++;
        arr.push(valeur(reste));
      }
    }
    return arr;
  }
  const resultat = objet(lignes[0]?.indent ?? 0);
  if (i < lignes.length) erreur(lignes[i], 'ligne non comprise');
  return resultat;
}

/** Lit un fichier .md : en-tête entre deux lignes « --- » ; le slug est le nom du fichier. */
function lireContenu(fichier) {
  const texte = fs.readFileSync(fichier, 'utf8').replace(/\r\n/g, '\n');
  const m = texte.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error(`${fichier} : en-tête --- manquant`);
  const donnees = lireEnTete(m[1], path.relative(RACINE, fichier));
  donnees.slug = path.basename(fichier, '.md');
  return donnees;
}

const site = lireContenu(path.join(RACINE, 'content/site.md'));
const projets = fs.readdirSync(path.join(RACINE, 'content/projets'))
  .filter((f) => f.endsWith('.md'))
  .map((f) => lireContenu(path.join(RACINE, 'content/projets', f)))
  .sort((a, b) => (a.ordre ?? 999) - (b.ordre ?? 999));

// ---------------------------------------------------------------------------
// 2. Dimensions et crédits des médias (lus dans les fichiers, sans dépendance)
// ---------------------------------------------------------------------------

/** Crédit XMP (Créateur + Droits) d'un paquet XMP. */
function lireXmp(xmp) {
  const liste = (balise) => [...(xmp.match(new RegExp(`<dc:${balise}>([\\s\\S]*?)</dc:${balise}>`))?.[1] ?? '')
    .matchAll(/<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/g)].map((m) => m[1].trim());
  return { createurs: liste('creator'), droits: liste('rights')[0] ?? '' };
}

/** Largeur, hauteur et paquet XMP d'une image WebP, JPEG ou PNG. */
function lireImage(b) {
  let largeur = 0, hauteur = 0, xmp = '';
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    for (let o = 12; o + 8 <= b.length;) {
      const type = b.toString('ascii', o, o + 4), taille = b.readUInt32LE(o + 4), d = o + 8;
      if (type === 'VP8X') { largeur = b.readUIntLE(d + 4, 3) + 1; hauteur = b.readUIntLE(d + 7, 3) + 1; }
      else if (type === 'VP8 ' && !largeur) { largeur = b.readUInt16LE(d + 6) & 0x3fff; hauteur = b.readUInt16LE(d + 8) & 0x3fff; }
      else if (type === 'VP8L' && !largeur) { const bits = b.readUInt32LE(d + 1); largeur = (bits & 0x3fff) + 1; hauteur = ((bits >> 14) & 0x3fff) + 1; }
      else if (type === 'XMP ') xmp = b.toString('utf8', d, d + taille);
      o = d + taille + (taille & 1);
    }
  } else if (b.readUInt32BE(0) === 0x89504e47) {
    largeur = b.readUInt32BE(16); hauteur = b.readUInt32BE(20);
  } else if (b[0] === 0xff && b[1] === 0xd8) {
    for (let o = 2; o + 4 <= b.length && b[o] === 0xff;) {
      const marqueur = b[o + 1], taille = b.readUInt16BE(o + 2);
      if (marqueur === 0xe1 && b.toString('ascii', o + 4, o + 33) === 'http://ns.adobe.com/xap/1.0/\0') xmp = b.toString('utf8', o + 33, o + 2 + taille);
      if (marqueur >= 0xc0 && marqueur <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marqueur)) {
        hauteur = b.readUInt16BE(o + 5); largeur = b.readUInt16BE(o + 7); break;
      }
      o += 2 + taille;
    }
  }
  return { largeur, hauteur, xmp };
}

const cacheImages = new Map();
/**
 * Dimensions réelles, variante -1000 (srcset) et crédit XMP d'une image.
 * Signale : fichier manquant, dimensions illisibles, crédit XMP absent, variante -1000 absente
 * alors que l'original dépasse 1400 px de côté long.
 */
function infoImage(chemin) {
  if (cacheImages.has(chemin)) return cacheImages.get(chemin);
  const info = { largeur: 0, hauteur: 0, variante: null, largeurVariante: 0, credit: { createurs: [], droits: '' } };
  cacheImages.set(chemin, info);
  const complet = path.join(RACINE, chemin);
  if (!fs.existsSync(complet)) { avertir(`image manquante : ${chemin}`); return info; }
  const { largeur, hauteur, xmp } = lireImage(fs.readFileSync(complet));
  if (!largeur || !hauteur) avertir(`dimensions illisibles : ${chemin}`);
  Object.assign(info, { largeur, hauteur, credit: lireXmp(xmp) });
  if (!info.credit.createurs.length || !info.credit.droits) avertir(`crédit XMP (Créateur + Droits) manquant : ${chemin}`);
  const variante = chemin.replace(/(\.\w+)$/, '-1000$1');
  if (fs.existsSync(path.join(RACINE, variante))) {
    const v = lireImage(fs.readFileSync(path.join(RACINE, variante)));
    if (Math.max(v.largeur, v.hauteur) !== 1000) avertir(`variante -1000 qui ne fait pas 1000 px de côté long : ${variante}`);
    Object.assign(info, { variante, largeurVariante: v.largeur });
  } else if (chemin.startsWith('images/projets/') && Math.max(largeur, hauteur) > 1400) {
    avertir(`variante -1000 manquante (original de plus de 1400 px) : ${variante}`);
  }
  return info;
}

const cacheVideos = new Map();
/** Durée (ISO 8601) et dimensions d'une vidéo MP4, lues dans les boîtes mvhd et tkhd. */
function infoVideo(chemin) {
  if (cacheVideos.has(chemin)) return cacheVideos.get(chemin);
  const info = { duree: '', largeur: 0, hauteur: 0 };
  cacheVideos.set(chemin, info);
  const complet = path.join(RACINE, chemin);
  if (!fs.existsSync(complet)) { avertir(`vidéo manquante : ${chemin}`); return info; }
  const b = fs.readFileSync(complet);
  const parcourir = (debut, fin) => {
    for (let o = debut; o + 8 <= fin;) {
      let taille = b.readUInt32BE(o);
      const type = b.toString('ascii', o + 4, o + 8);
      if (taille === 1) taille = Number(b.readBigUInt64BE(o + 8));
      if (taille < 8) break;
      if (type === 'moov' || type === 'trak') parcourir(o + 8, o + taille);
      else if (type === 'mvhd') {
        const v1 = b[o + 8] === 1;
        const echelle = b.readUInt32BE(o + (v1 ? 28 : 20));
        const duree = v1 ? Number(b.readBigUInt64BE(o + 32)) : b.readUInt32BE(o + 24);
        if (echelle) info.duree = `PT${Math.round(duree / echelle)}S`;
      } else if (type === 'tkhd' && !info.largeur) {
        info.largeur = b.readUInt32BE(o + taille - 8) >>> 16;
        info.hauteur = b.readUInt32BE(o + taille - 4) >>> 16;
      }
      o += taille;
    }
  };
  parcourir(0, b.length);
  return info;
}

// ---------------------------------------------------------------------------
// 3. Vérification du contenu
// ---------------------------------------------------------------------------

const RESERVES = ['index', '404', 'sitemap', 'robots'];
const vus = new Map();
const ordres = new Map();
for (const p of projets) {
  const nom = `content/projets/${p.slug}.md`;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.slug)) avertir(`${nom} : slug invalide (minuscules, chiffres et tirets seulement)`);
  if (RESERVES.includes(p.slug.toLowerCase())) avertir(`${nom} : slug réservé`);
  const cle = p.slug.toLowerCase();
  if (vus.has(cle)) avertir(`slug en double : ${p.slug} (${vus.get(cle)} et ${nom})`);
  vus.set(cle, nom);
  if (typeof p.ordre !== 'number') avertir(`${nom} : « ordre » manquant`);
  else if (ordres.has(p.ordre)) avertir(`${nom} : ordre ${p.ordre} déjà pris par ${ordres.get(p.ordre)}`);
  else ordres.set(p.ordre, nom);
  if (typeof p.annee !== 'number') avertir(`${nom} : « annee » manquante`);
  for (const champ of ['titre', 'onglet', 'description']) {
    for (const l of LANGUES) if (!p[`${champ}_${l}`]) avertir(`${nom} : « ${champ}_${l} » manquant`);
  }
  if (!INTERACTIONS.includes(p.interaction)) avertir(`${nom} : interaction inconnue « ${p.interaction} » (${INTERACTIONS.join(', ')})`);
  if (p.interaction === '3d' && !p.model_3d) avertir(`${nom} : interaction 3d sans « model_3d »`);
  if (p.interaction === '3d' && !p.image) avertir(`${nom} : projet 3d sans « image » (aperçu, référencement, partage)`);
  if (!CLES_MEDIAS.some((c) => p[c])) avertir(`${nom} : aucun média`);
  // Nommage des médias : <slug>-NN.ext, le slug sans son suffixe -2, -3… (seconde vue d'un même projet)
  const base = p.slug.replace(/-\d+$/, '');
  for (const c of CLES_MEDIAS) {
    if (!p[c]) continue;
    const fichier = path.basename(p[c]);
    if (![p.slug, base].some((s) => new RegExp(`^${s}-\\d{2}\\.\\w+$`).test(fichier))) {
      avertir(`${nom} : « ${p[c]} » ne suit pas le nommage ${base}-NN.${fichier.split('.').pop()}`);
    }
    if (!fs.existsSync(path.join(RACINE, p[c]))) avertir(`${nom} : fichier manquant « ${p[c]} » (${c})`);
    else if (c.startsWith('image')) infoImage(p[c]);
    else if (c.startsWith('video')) infoVideo(p[c]);
  }
  const partage = partageProjet(p);
  const { largeur, hauteur } = infoImage(partage);
  if (largeur && (largeur !== 1200 || hauteur !== 630)) avertir(`${partage} : image de partage de ${largeur} × ${hauteur} px au lieu de 1200 × 630`);
}
for (const l of LANGUES) {
  const chemin = t(site, 'image_partage', l);
  const { largeur, hauteur } = infoImage(chemin);
  if (largeur && (largeur !== 1200 || hauteur !== 630)) avertir(`${chemin} : image de partage de ${largeur} × ${hauteur} px au lieu de 1200 × 630`);
}

// ---------------------------------------------------------------------------
// 4. Génération des pages
// ---------------------------------------------------------------------------

function ecrire(relatif, contenu) {
  const complet = path.join(RACINE, relatif);
  fs.mkdirSync(path.dirname(complet), { recursive: true });
  fs.writeFileSync(complet, contenu);
  return relatif;
}

// Empreinte des fichiers ajoutée à leur adresse (site.js?v=…) : après chaque mise en ligne,
// les navigateurs rechargent les nouveaux fichiers au lieu de garder l'ancienne version.
const empreinte = (f) => {
  if (!fs.existsSync(path.join(RACINE, f))) { avertir(`fichier manquant : ${f}`); return '0'; }
  return crypto.createHash('md5').update(fs.readFileSync(path.join(RACINE, f))).digest('hex').slice(0, 8);
};
const avecEmpreinte = (f) => `${f}?v=${empreinte(f)}`;
// Bibliothèques 3D auto-hébergées (js/vendor/), chargées par site.js seulement pour un projet 3d.
const vendor = {
  modelViewer: avecEmpreinte('js/vendor/model-viewer/model-viewer.min.js'),
  draco: 'js/vendor/draco/',
  basis: 'js/vendor/basis/',
  three: avecEmpreinte('js/vendor/three/three.module.js'),
  orbit: 'js/vendor/three/addons/controls/OrbitControls.js',
  spark: avecEmpreinte('js/vendor/spark/spark.module.min.js'),
};
for (const f of ['draco/draco_decoder.js', 'draco/draco_decoder.wasm', 'draco/draco_wasm_wrapper.js', 'basis/basis_transcoder.js',
  'basis/basis_transcoder.wasm', 'three/three.core.js', 'three/addons/controls/OrbitControls.js', 'three/addons/postprocessing/Pass.js']) {
  if (!fs.existsSync(path.join(RACINE, 'js/vendor', f))) avertir(`fichier manquant : js/vendor/${f}`);
}
const versions = {
  css: empreinte('css/site.css'),
  js: empreinte('js/site.js'),
  icone: empreinte('images/interface/favicon.png'),
  three: vendor.three,
  vendor,
};

const ecrites = [];
for (const langue of LANGUES) {
  const dossier = langue === 'fr' ? '' : `${langue}/`;
  const ctx = (fichier, typePage) => ({
    site, projets, langue, langues: LANGUES, fichier, typePage, versions, infoImage, infoVideo, avertir,
    racine: langue === 'fr' ? '' : '../',
    base: '',
    // Adresse du dossier de chaque langue depuis cette page (liens FR / EN).
    prefixes: langue === 'fr' ? { fr: './', en: 'en/' } : { fr: '../', en: './' },
  });
  ecrites.push(ecrire(`${dossier}index.html`, page(ctx('index.html', 'accueil'), null)));
  for (const p of projets) ecrites.push(ecrire(`${dossier}${p.slug}.html`, page(ctx(`${p.slug}.html`, 'projet'), p)));
}
// 404 : servie par GitHub Pages à n'importe quelle adresse, d'où des chemins absolus (/css/…).
ecrites.push(ecrire('404.html', page({
  site, projets, langue: 'fr', langues: LANGUES, fichier: '404.html', typePage: '404', versions, infoImage, infoVideo, avertir,
  racine: '/', base: '/', prefixes: { fr: '/', en: '/en/' }, titre404: 'Page introuvable',
}, null)));

// Pages .html qui ne correspondent plus à aucun projet (projet renommé ou supprimé) : à effacer à la main.
for (const dossier of ['', 'en/']) {
  for (const f of fs.readdirSync(path.join(RACINE, dossier || '.'))) {
    if (f.endsWith('.html') && !ecrites.includes(`${dossier}${f}`)) avertir(`page orpheline (aucun projet ne la génère) : ${dossier}${f}`);
  }
}

// ---------------------------------------------------------------------------
// 5. sitemap.xml (pages, langues, images et vidéos) et robots.txt
// ---------------------------------------------------------------------------

const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const entrees = [];
for (const projet of [null, ...projets]) {
  const fichier = projet ? `${projet.slug}.html` : 'index.html';
  const medias = projet ? [...new Set(CLES_MEDIAS.map((c) => projet[c]).filter(Boolean))] : [];
  for (const langue of LANGUES) {
    const lignes = [`    <loc>${xml(urlPublique(site, langue, fichier))}</loc>`];
    for (const l of [...LANGUES, 'x-default']) {
      lignes.push(`    <xhtml:link rel="alternate" hreflang="${l}" href="${xml(urlPublique(site, l === 'x-default' ? 'fr' : l, fichier))}"/>`);
    }
    for (const f of medias) {
      if (/\.webp$|\.jpe?g$|\.png$/i.test(f)) {
        lignes.push(`    <image:image>\n      <image:loc>${xml(`${site.url}/${f}`)}</image:loc>\n    </image:image>`);
      } else if (/\.mp4$/i.test(f)) {
        const alt = (projet.alt ?? []).find((a) => a.fichier === f);
        lignes.push(`    <video:video>
      <video:thumbnail_loc>${xml(`${site.url}/${projet.image ?? partageProjet(projet)}`)}</video:thumbnail_loc>
      <video:title>${xml(t(projet, 'titre', langue))}</video:title>
      <video:description>${xml(alt ? t(alt, 'texte', langue) : t(projet, 'description', langue))}</video:description>
      <video:content_loc>${xml(`${site.url}/${f}`)}</video:content_loc>
    </video:video>`);
      }
    }
    entrees.push(`  <url>\n${lignes.join('\n')}\n  </url>`);
  }
}
ecrire('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
${entrees.join('\n')}
</urlset>
`);
ecrire('robots.txt', `User-agent: *
Disallow: /content/
Disallow: /templates/
Disallow: /build.mjs

Sitemap: ${site.url}/sitemap.xml
`);

// ---------------------------------------------------------------------------
// 6. Vérification des liens et ressources internes de chaque page générée
// ---------------------------------------------------------------------------

for (const relatif of ecrites) {
  const html = fs.readFileSync(path.join(RACINE, relatif), 'utf8');
  const urls = [];
  for (const [, attr, valeurs] of html.matchAll(/\s(href|src|srcset|poster)="([^"]+)"/g)) {
    urls.push(...(attr === 'srcset' ? valeurs.split(',').map((s) => s.trim().split(/\s+/)[0]) : [valeurs]));
  }
  // Adresses lues par site.js (données JSON, bibliothèques 3D) et noscript.
  const donnees = JSON.parse(html.match(/<script type="application\/json" id="donnees">([\s\S]*?)<\/script>/)[1]);
  for (const p of donnees.projets) {
    urls.push(p.url, ...CLES_MEDIAS.map((c) => p[c]).filter(Boolean));
    for (const m of Object.values(p.medias)) if (m.srcset) urls.push(...m.srcset.split(',').map((s) => s.trim().split(/\s+/)[0]));
  }
  urls.push(...Object.values(donnees.vendor), ...Object.values(donnees.langues));
  for (const [, u] of html.matchAll(/url\("([^"]+)"\)/g)) urls.push(u);
  for (const url of urls) {
    if (/^(https?:|mailto:|tel:|#|data:)/.test(url)) continue;
    const chemin = url.split(/[?#]/)[0];
    const cible = chemin.startsWith('/') ? path.join(RACINE, chemin) : path.join(RACINE, path.dirname(relatif), chemin);
    // Dossier : sa page index.html (accueils), ou le dossier lui-même (décodeurs 3D de js/vendor/).
    const existe = chemin.endsWith('/')
      ? fs.existsSync(path.join(cible, 'index.html')) || (chemin.includes('js/vendor/') && fs.existsSync(cible))
      : fs.existsSync(cible);
    if (!existe) avertir(`${relatif} : lien cassé « ${url} »`);
  }
}

console.log(`${ecrites.length} pages générées (${projets.length} projets × ${LANGUES.length} langues, accueils, 404), plus sitemap.xml et robots.txt.`);
const uniques = [...new Set(avertissements)];
if (uniques.length) {
  console.log(`\n${uniques.length} avertissement(s) :`);
  for (const a of uniques) console.log(`  - ${a}`);
  process.exitCode = 1;
}
