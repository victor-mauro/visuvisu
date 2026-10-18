/* ==========================================================================
   Visu Visu — script unique du site
   --------------------------------------------------------------------------
   Les pages sont générées par build.mjs : liste des projets (vrais liens) et
   image du projet sont déjà dans le HTML. Ce script ajoute les interactions :
     1. Configuration et état
     2. Médias          : balises <img> / <video> du projet courant
     3. Préchargement   : médias des projets suivants, puis de tous les autres
     4. Menu mobile     : le logo ouvre / ferme le menu (≤ 991 px)
     5. Navigation      : un clic sur la liste change de projet sans recharger
                          la page (history.pushState), Précédent / Suivant
     6. Sélection et affichage du projet (ordinateur / mobile)
     7. Zoom            : au survol, l'image couvre tout le cadre
     8. Unzoom          : l'image couvre le cadre, le survol la montre entière
     9. Toggle          : au survol, l'image alternative
    10. Toucher mobile  : un toucher bascule zoom / unzoom / toggle (≤ 479 px)
    11. Vue 3D          : .glb / .gltf (model-viewer) ou Gaussian splat (Spark)
    12. Redimensionnement, langues, démarrage
   ========================================================================== */
(() => {
  'use strict';

  /* 1. CONFIGURATION ET ÉTAT ------------------------------------------------- */

  const CONFIG = {
    // PRÉCHARGEMENT EN ARRIÈRE-PLAN
    // 'conservative' : Précharge 3 projets suivants (recommandé)
    // 'aggressive' : Précharge 5 projets suivants
    // 'all' : Précharge tous les projets
    preloadStrategy: 'conservative',
  };

  // Données écrites par build.mjs dans la page : projets (mêmes clés que l'ancien
  // projects.json, plus url, onglet et medias), adresses des langues, bibliothèques 3D.
  const donnees = JSON.parse(document.getElementById('donnees').textContent);
  const projects = donnees.projets;

  let currentProject = null;
  let isZoomed = false;
  let isUnzoomed = false;
  let preloadQueue = [];
  let isPreloading = false;
  let preloadedUrls = new Set();
  let mobileInteractionActive = false; // État du tap toggle mobile
  let surAccueil = donnees.page !== 'projet'; // l'adresse est celle de l'accueil (projet tiré au hasard)

  const wrapper = document.getElementById('imageWrapper');
  const container = document.querySelector('.main-content');


  /* 2. MÉDIAS -----------------------------------------------------------------
     Texte alternatif propre à chaque image ; srcset + sizes quand une variante -1000
     existe (le navigateur choisit la taille utile). Sur mobile, l'image est
     transparente et affichée en fond : on garde l'original, comme le fond. */

  const echapper = (texte = '') => String(texte).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

  // Informations d'un média (alt, srcset, sizes), quel que soit le projet qui l'affiche
  const infosMedias = {};
  projects.forEach(p => Object.keys(p.medias).forEach(url => {
    if (!infosMedias[url]) infosMedias[url] = p.medias[url];
  }));
  const infoMedia = (url) => (currentProject && currentProject.medias[url]) || infosMedias[url] || {};

  function isVideoUrl(url) {
    return url.toLowerCase().match(/\.(mp4|webm|ogg|mov)$/);
  }

  // id : 'mainImage' sur ordinateur ; classe : 'main-image', 'main-image zoomable'…
  function mediaHTML(url, { id = '', classe = 'main-image', mobile = false } = {}) {
    const info = infoMedia(url);
    const attrId = id ? ` id="${id}"` : '';
    if (isVideoUrl(url)) {
      return `<video src="${url}"${attrId} class="${classe}" preload="auto" autoplay loop muted playsinline aria-label="${echapper(info.alt)}"></video>`;
    }
    if (mobile) {
      return `<img src="${url}" class="${classe}" alt="${echapper(info.alt)}" style="opacity: 0;">`;
    }
    const srcset = info.srcset ? ` srcset="${info.srcset}" sizes="${info.sizes}"` : '';
    return `<img src="${url}"${srcset}${attrId} class="${classe}" alt="${echapper(info.alt)}">`;
  }

  // Change l'image affichée sans recréer la balise (toggle) : src et srcset ensemble
  function changerSource(media, url) {
    if (media.tagName === 'IMG') {
      const info = infoMedia(url);
      if (info.srcset) {
        media.sizes = info.sizes;
        media.srcset = info.srcset;
      } else {
        media.removeAttribute('srcset');
        media.removeAttribute('sizes');
      }
      media.alt = info.alt || '';
    }
    media.src = url;
  }


  /* 3. PRÉCHARGEMENT EN ARRIÈRE-PLAN ----------------------------------------- */

  const CLES_PRECHARGEMENT = ['image', 'image_hover', 'image_zoomed', 'video', 'video_hover', 'video_zoomed'];

  function extractAllImageUrls() {
    const urls = [];

    projects.forEach(project => {
      CLES_PRECHARGEMENT.forEach(key => {
        if (project[key]) {
          urls.push(project[key]);
        }
      });
    });

    return urls;
  }

  function preloadImage(url) {
    return new Promise((resolve) => {
      if (preloadedUrls.has(url)) {
        resolve();
        return;
      }

      // Détecter si c'est une vidéo ou une image
      if (isVideoUrl(url)) {
        // Précharger vidéo
        const video = document.createElement('video');
        video.preload = 'auto';
        video.muted = true;
        video.playsInline = true;

        video.onloadeddata = () => {
          preloadedUrls.add(url);
          resolve();
        };
        video.onerror = () => {
          resolve();
        };

        video.src = url;
      } else {
        // Précharger image : même srcset / sizes que l'affichage, donc le même fichier
        const img = new Image();
        img.onload = () => {
          preloadedUrls.add(url);
          resolve();
        };
        img.onerror = () => {
          resolve();
        };
        const info = infosMedias[url] || {};
        if (info.srcset && window.innerWidth > 479) {
          img.sizes = info.sizes;
          img.srcset = info.srcset;
        }
        img.src = url;
      }
    });
  }

  async function preloadImagesInBackground() {
    if (isPreloading || preloadQueue.length === 0) return;

    isPreloading = true;

    let batchSize = 1;
    let delay = 100;

    if (CONFIG.preloadStrategy === 'aggressive') {
      batchSize = 3;
      delay = 50;
    } else if (CONFIG.preloadStrategy === 'all') {
      batchSize = 5;
      delay = 0;
    }

    while (preloadQueue.length > 0) {
      const batch = preloadQueue.splice(0, batchSize);
      await Promise.all(batch.map(url => preloadImage(url)));

      if (delay > 0 && preloadQueue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    isPreloading = false;
    console.log('✅ Préchargement terminé');
  }

  function startPreloading() {
    const allUrls = extractAllImageUrls();

    if (allUrls.length === 0) return;

    const currentIndex = projects.findIndex(p => p.id === currentProject?.id);
    const priorityCount = CONFIG.preloadStrategy === 'aggressive' ? 5 : 3;

    const priorityUrls = [];
    for (let i = 1; i <= priorityCount && currentIndex + i < projects.length; i++) {
      const project = projects[currentIndex + i];
      CLES_PRECHARGEMENT.forEach(key => {
        if (project[key]) {
          const url = project[key];
          if (!preloadedUrls.has(url)) {
            priorityUrls.push(url);
          }
        }
      });
    }

    const remainingUrls = allUrls.filter(url =>
      !preloadedUrls.has(url) && !priorityUrls.includes(url)
    );

    preloadQueue = [...priorityUrls, ...remainingUrls];

    console.log(`🚀 Préchargement : ${preloadQueue.length} images`);

    preloadImagesInBackground();
  }


  /* 4. MENU MOBILE ------------------------------------------------------------ */

  function initMenu() {
    const logoToggle = document.getElementById('logoToggle');
    const menuContent = document.getElementById('menuContent');

    logoToggle.addEventListener('click', () => {
      if (window.innerWidth <= 991) {
        menuContent.classList.toggle('open');
      }
    });

    menuContent.addEventListener('click', (e) => {
      if (e.target.tagName === 'A') {
        menuContent.classList.remove('open');
      }
    });
  }


  /* 5. NAVIGATION SANS RECHARGEMENT -------------------------------------------
     Chaque ligne de la liste est un lien vers la page du projet (utile sans
     JavaScript et pour Google). Un clic simple affiche le projet sur place et
     met l'adresse à jour ; Ctrl / Cmd + clic ouvre toujours un nouvel onglet. */

  // Titre de l'onglet, titre (masqué) de la page et liens FR / EN du projet affiché
  function majPage() {
    document.title = surAccueil ? donnees.accueil.onglet : currentProject.onglet;
    const titre = container.querySelector('h1');
    if (titre && !surAccueil) titre.textContent = currentProject.titre;
    document.querySelectorAll('.langues a').forEach(a => {
      a.href = donnees.langues[a.hreflang] + (surAccueil ? '' : currentProject.url.split('/').pop());
    });
  }

  function initNavigation() {
    document.getElementById('projectsList').addEventListener('click', (e) => {
      const lien = e.target.closest('a.project-item');
      if (!lien || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      const projet = projects.find(p => `project-${p.id}` === lien.id);
      if (!projet) return;
      selectProject(projet.id);
      if (surAccueil || new URL(lien.href).pathname !== location.pathname) {
        history.pushState({ id: projet.id }, '', projet.url);
      }
      surAccueil = false;
      majPage();
    });

    window.addEventListener('popstate', (e) => {
      if (!e.state || !e.state.id) return;
      surAccueil = !!e.state.accueil;
      selectProject(e.state.id);
      majPage();
      const activeItem = document.querySelector('.project-item.active');
      if (activeItem) activeItem.scrollIntoView({ block: 'nearest' });
    });
  }


  /* 6. SÉLECTION ET AFFICHAGE DU PROJET ----------------------------------------- */

  function selectProject(id) {
    currentProject = projects.find(p => p.id === id);
    if (!currentProject) return;

    isZoomed = false;
    isUnzoomed = false;

    document.querySelectorAll('.project-item').forEach(el => {
      const actif = el.id === `project-${id}`;
      el.classList.toggle('active', actif);
      if (actif) el.setAttribute('aria-current', 'true');
      else el.removeAttribute('aria-current');
    });

    displayImage();

    if (!isPreloading && preloadQueue.length > 0) {
      startPreloading();
    }
  }

  function displayImage() {
    const isMobile = window.innerWidth <= 479;

    // Vue 3D en cours (projet précédent) : arrêtée sauf si elle reste affichée
    const avec3D = isMobile ? !!currentProject.model_3d : currentProject.interaction === '3d';
    if (!avec3D) arreterVue3D();

    if (isMobile) {
      // Sur mobile : afficher le média PAR DÉFAUT selon l'interaction
      const videoUrl = currentProject.video;
      const imageUrl = currentProject.image;
      const model3dUrl = currentProject.model_3d;

      wrapper.style.backgroundImage = 'none';
      mobileInteractionActive = false; // Reset de l'état

      if (model3dUrl) {
        // Support du viewer 3D sur mobile
        afficherVue3D();
      } else if (currentProject.interaction === 'unzoom') {
        // Pour UNZOOM : afficher le média ZOOMÉ par défaut
        const zoomedVideoUrl = currentProject.video_zoomed;
        const zoomedImageUrl = currentProject.image_zoomed;

        if (zoomedVideoUrl) {
          wrapper.innerHTML = mediaHTML(zoomedVideoUrl);
        } else if (zoomedImageUrl) {
          wrapper.style.backgroundImage = `url(${zoomedImageUrl})`;
          wrapper.innerHTML = mediaHTML(zoomedImageUrl, { mobile: true });
        } else if (videoUrl) {
          // Fallback : utiliser le média normal
          wrapper.innerHTML = mediaHTML(videoUrl);
        } else if (imageUrl) {
          wrapper.style.backgroundImage = `url(${imageUrl})`;
          wrapper.innerHTML = mediaHTML(imageUrl, { mobile: true });
        }
      } else if (videoUrl) {
        // Pour ZOOM et TOGGLE : afficher le média normal
        wrapper.innerHTML = mediaHTML(videoUrl);
      } else if (imageUrl) {
        wrapper.style.backgroundImage = `url(${imageUrl})`;
        wrapper.innerHTML = mediaHTML(imageUrl, { mobile: true });
      }

      // Ajouter le tap toggle si interaction présente (sauf 3D)
      const hasInteraction = currentProject.interaction &&
                             currentProject.interaction !== '3d' &&
                             (currentProject.interaction === 'zoom' ||
                              currentProject.interaction === 'unzoom' ||
                              currentProject.interaction === 'toggle');

      if (hasInteraction) {
        // Retirer les anciens listeners
        wrapper.removeEventListener('click', toggleMobileInteraction);
        // Ajouter le nouveau
        wrapper.addEventListener('click', toggleMobileInteraction);
      }
    } else {
      wrapper.style.backgroundImage = 'none';

      if (currentProject.interaction === 'zoom') {
        if (currentProject.video) {
          wrapper.innerHTML = mediaHTML(currentProject.video, { id: 'mainImage', classe: 'main-image zoomable' });
        } else if (currentProject.image) {
          wrapper.innerHTML = mediaHTML(currentProject.image, { id: 'mainImage', classe: 'main-image zoomable' });
        }

      } else if (currentProject.interaction === 'unzoom') {
        const zoomedUrl = currentProject.video_zoomed || currentProject.image_zoomed ||
                          currentProject.video || currentProject.image;
        if (zoomedUrl) {
          wrapper.innerHTML = mediaHTML(zoomedUrl, { id: 'mainImage', classe: 'main-image zoomed' });
        }
        initUnzoomBehavior();

      } else if (currentProject.interaction === 'toggle') {
        wrapper.innerHTML = mediaHTML(currentProject.video || currentProject.image, { id: 'mainImage' });

      } else if (currentProject.interaction === '3d') {
        afficherVue3D();

      } else {
        const mediaUrl = currentProject.video || currentProject.image;
        wrapper.innerHTML = mediaHTML(mediaUrl, { id: 'mainImage' });
      }
    }
  }


  /* 7. ZOOM ------------------------------------------------------------------------
     Au survol : la marge du cadre disparaît et l'image (ou la vidéo zoomée) le couvre. */

  function activateZoom() {
    if (!currentProject || currentProject.interaction !== 'zoom') return;
    if (window.innerWidth <= 479) return;
    if (isZoomed) return;

    const oldMedia = document.getElementById('mainImage');
    if (!oldMedia) return;

    isZoomed = true;
    container.classList.add('zoomed');

    // Déterminer quel média DOIT être affiché au zoom (priorité)
    let targetIsVideo, targetUrl;

    if (currentProject.video_zoomed) {
      targetIsVideo = true;
      targetUrl = currentProject.video_zoomed;
    } else if (currentProject.image_zoomed) {
      targetIsVideo = false;
      targetUrl = currentProject.image_zoomed;
    } else if (currentProject.video) {
      targetIsVideo = true;
      targetUrl = currentProject.video;
    } else {
      targetIsVideo = false;
      targetUrl = currentProject.image;
    }

    // Comparer avec le média ACTUEL
    const currentIsVideo = oldMedia.tagName === 'VIDEO';
    const currentUrl = currentIsVideo ? currentProject.video : currentProject.image;

    // Si même type ET même URL → Optimisation : juste CSS
    if (currentIsVideo === targetIsVideo && currentUrl === targetUrl) {
      oldMedia.classList.add('zoomed');
    } else {
      // Types ou URLs différents → Recréer l'élément
      wrapper.innerHTML = mediaHTML(targetUrl, { id: 'mainImage', classe: 'main-image zoomed' });
    }
  }

  function deactivateZoom() {
    if (!isZoomed) return;

    const media = document.getElementById('mainImage');

    isZoomed = false;
    container.classList.remove('zoomed');

    if (!media) return;

    // Le média cible est le média PAR DÉFAUT
    let targetIsVideo, targetUrl;

    if (currentProject.video) {
      targetIsVideo = true;
      targetUrl = currentProject.video;
    } else if (currentProject.image) {
      targetIsVideo = false;
      targetUrl = currentProject.image;
    } else if (currentProject.video_zoomed) {
      targetIsVideo = true;
      targetUrl = currentProject.video_zoomed;
    } else {
      targetIsVideo = false;
      targetUrl = currentProject.image_zoomed;
    }

    // Comparer avec le média ACTUEL
    const currentIsVideo = media.tagName === 'VIDEO';
    const currentUrl = currentIsVideo
      ? (currentProject.video_zoomed || currentProject.video)
      : (currentProject.image_zoomed || currentProject.image);

    // Si même type ET même URL → Optimisation : juste CSS
    if (currentIsVideo === targetIsVideo && currentUrl === targetUrl) {
      media.classList.remove('zoomed');
      media.classList.add('zoomable');
    } else {
      // Types ou URLs différents → Recréer l'élément
      wrapper.innerHTML = mediaHTML(targetUrl, { id: 'mainImage', classe: 'main-image zoomable' });
    }
  }


  /* 8. UNZOOM ------------------------------------------------------------------------
     Par défaut l'image couvre le cadre ; au survol, elle apparaît entière. */

  function initUnzoomBehavior() {
    container.classList.add('zoomed');
  }

  function activateUnzoom() {
    if (!currentProject || currentProject.interaction !== 'unzoom') return;
    if (window.innerWidth <= 479) return;
    if (isUnzoomed) return;

    const oldMedia = document.getElementById('mainImage');
    if (!oldMedia) return;

    isUnzoomed = true;
    container.classList.remove('zoomed');
    container.classList.add('unzoomed');

    // Pour unzoom : afficher le média NORMAL au hover
    let targetIsVideo, targetUrl;

    if (currentProject.video) {
      targetIsVideo = true;
      targetUrl = currentProject.video;
    } else if (currentProject.image) {
      targetIsVideo = false;
      targetUrl = currentProject.image;
    } else if (currentProject.video_zoomed) {
      targetIsVideo = true;
      targetUrl = currentProject.video_zoomed;
    } else {
      targetIsVideo = false;
      targetUrl = currentProject.image_zoomed;
    }

    // Comparer avec le média ACTUEL (qui est zoomé)
    const currentIsVideo = oldMedia.tagName === 'VIDEO';
    const currentUrl = currentIsVideo
      ? (currentProject.video_zoomed || currentProject.video)
      : (currentProject.image_zoomed || currentProject.image);

    // Si même type ET même URL → Optimisation : juste CSS
    if (currentIsVideo === targetIsVideo && currentUrl === targetUrl) {
      oldMedia.classList.remove('zoomed');
      oldMedia.classList.add('unzoomed');
    } else {
      // Types ou URLs différents → Recréer l'élément
      wrapper.innerHTML = mediaHTML(targetUrl, { id: 'mainImage', classe: 'main-image unzoomed' });
    }
  }

  function deactivateUnzoom() {
    if (!isUnzoomed) return;

    const media = document.getElementById('mainImage');

    isUnzoomed = false;
    container.classList.remove('unzoomed');
    container.classList.add('zoomed');

    if (!media) return;

    // Pour unzoom : revenir au média ZOOMÉ (affiché par défaut)
    let targetIsVideo, targetUrl;

    if (currentProject.video_zoomed) {
      targetIsVideo = true;
      targetUrl = currentProject.video_zoomed;
    } else if (currentProject.image_zoomed) {
      targetIsVideo = false;
      targetUrl = currentProject.image_zoomed;
    } else if (currentProject.video) {
      targetIsVideo = true;
      targetUrl = currentProject.video;
    } else {
      targetIsVideo = false;
      targetUrl = currentProject.image;
    }

    // Comparer avec le média ACTUEL (qui est normal/unzoomed)
    const currentIsVideo = media.tagName === 'VIDEO';
    const currentUrl = currentIsVideo
      ? (currentProject.video || currentProject.video_zoomed)
      : (currentProject.image || currentProject.image_zoomed);

    // Si même type ET même URL → Optimisation : juste CSS
    if (currentIsVideo === targetIsVideo && currentUrl === targetUrl) {
      media.classList.remove('unzoomed');
      media.classList.add('zoomed');
    } else {
      // Types ou URLs différents → Recréer l'élément
      wrapper.innerHTML = mediaHTML(targetUrl, { id: 'mainImage', classe: 'main-image zoomed' });
      initUnzoomBehavior();
    }
  }


  /* 9. TOGGLE ---------------------------------------------------------------------- */

  function showHoverMedia() {
    if (!currentProject || currentProject.interaction !== 'toggle') return;
    if (window.innerWidth <= 479) return;

    const media = document.getElementById('mainImage');
    if (!media) return;

    if (media.tagName === 'VIDEO' && currentProject.video_hover) {
      changerSource(media, currentProject.video_hover);
    } else if (media.tagName === 'IMG' && currentProject.image_hover) {
      changerSource(media, currentProject.image_hover);
    }
  }

  function showDefaultMedia() {
    if (!currentProject || currentProject.interaction !== 'toggle') return;

    const media = document.getElementById('mainImage');
    if (!media) return;

    if (media.tagName === 'VIDEO' && currentProject.video) {
      changerSource(media, currentProject.video);
    } else if (media.tagName === 'IMG' && currentProject.image) {
      changerSource(media, currentProject.image);
    }
  }

  // Survol de l'image : chaque fonction ne réagit qu'à l'interaction de son projet
  function initSurvol() {
    wrapper.addEventListener('mouseenter', () => {
      activateZoom();
      activateUnzoom();
      showHoverMedia();
    });
    wrapper.addEventListener('mouseleave', () => {
      deactivateZoom();
      deactivateUnzoom();
      showDefaultMedia();
    });
  }


  /* 10. TOUCHER MOBILE (≤ 479 px) ---------------------------------------------------
     Un toucher affiche le média alternatif (zoomé, normal ou de survol), un second
     toucher revient au média par défaut. */

  function toggleMobileInteraction() {
    if (!currentProject || window.innerWidth > 479) return;

    const interaction = currentProject.interaction;
    if (!interaction || interaction === '3d') return; // 3D garde son comportement par défaut

    if (!mobileInteractionActive) {
      // ACTIVER : Afficher le média alternatif
      mobileInteractionActive = true;

      if (interaction === 'zoom') {
        // Afficher le média zoomé
        const currentVideo = currentProject.video;
        const currentImage = currentProject.image;

        // Vérifier si même URL (pas besoin de recréer)
        if (currentProject.video_zoomed && currentProject.video_zoomed === currentVideo) {
          // Même vidéo, ne rien faire (déjà affichée)
          mobileInteractionActive = false;
          return;
        }
        if (currentProject.image_zoomed && currentProject.image_zoomed === currentImage) {
          // Même image, ne rien faire (déjà affichée)
          mobileInteractionActive = false;
          return;
        }

        if (currentProject.video_zoomed) {
          wrapper.innerHTML = mediaHTML(currentProject.video_zoomed);
        } else if (currentProject.image_zoomed) {
          wrapper.innerHTML = mediaHTML(currentProject.image_zoomed, { mobile: true });
          wrapper.style.backgroundImage = `url(${currentProject.image_zoomed})`;
        } else {
          // Pas de média zoomé spécifique, ne rien faire
          mobileInteractionActive = false;
          return;
        }
      } else if (interaction === 'unzoom') {
        // Afficher le média normal (dézoomé)
        // Vérifier si même URL (pas besoin de recréer)
        if (currentProject.video && currentProject.video === currentProject.video_zoomed) {
          // Même vidéo, ne rien faire
          mobileInteractionActive = false;
          return;
        }
        if (currentProject.image && currentProject.image === currentProject.image_zoomed) {
          // Même image, ne rien faire
          mobileInteractionActive = false;
          return;
        }

        if (currentProject.video) {
          wrapper.innerHTML = mediaHTML(currentProject.video);
        } else if (currentProject.image) {
          wrapper.innerHTML = mediaHTML(currentProject.image, { mobile: true });
          wrapper.style.backgroundImage = `url(${currentProject.image})`;
        }
      } else if (interaction === 'toggle') {
        // Afficher le média hover
        // Vérifier si même URL (pas besoin de recréer)
        if (currentProject.video_hover && currentProject.video_hover === currentProject.video) {
          // Même vidéo, ne rien faire
          mobileInteractionActive = false;
          return;
        }
        if (currentProject.image_hover && currentProject.image_hover === currentProject.image) {
          // Même image, ne rien faire
          mobileInteractionActive = false;
          return;
        }

        if (currentProject.video_hover) {
          wrapper.innerHTML = mediaHTML(currentProject.video_hover);
        } else if (currentProject.image_hover) {
          wrapper.innerHTML = mediaHTML(currentProject.image_hover, { mobile: true });
          wrapper.style.backgroundImage = `url(${currentProject.image_hover})`;
        }
      }

      // Réattacher l'event listener
      wrapper.removeEventListener('click', toggleMobileInteraction);
      setTimeout(() => {
        wrapper.addEventListener('click', toggleMobileInteraction);
      }, 100);

    } else {
      // DÉSACTIVER : Retour au média par défaut
      mobileInteractionActive = false;
      displayImage(); // Réafficher le média par défaut
    }
  }


  /* 11. VUE 3D ------------------------------------------------------------------------
     model_3d en .glb / .gltf : model-viewer (rotation à la souris ou au doigt, AR sur
     mobile). En .spz / .ply / .splat / .ksplat / .sog : Gaussian splat avec Spark et
     three.js. Bibliothèques auto-hébergées dans js/vendor/, chargées au premier projet 3D ;
     l'image du projet sert d'aperçu pendant le chargement. */

  let vue3D = null; // { url, element, arreter() }

  function arreterVue3D() {
    if (vue3D) vue3D.arreter();
    vue3D = null;
  }

  let modelViewerCharge = false;
  function chargerModelViewer() {
    if (modelViewerCharge) return;
    modelViewerCharge = true;
    // Décodeurs Draco et KTX2 servis par le site (sinon model-viewer les demande à un CDN)
    window.ModelViewerElement = Object.assign(window.ModelViewerElement || {}, {
      dracoDecoderLocation: new URL(donnees.vendor.draco, document.baseURI).href,
      ktx2TranscoderLocation: new URL(donnees.vendor.basis, document.baseURI).href,
    });
    const script = document.createElement('script');
    script.type = 'module';
    script.src = donnees.vendor.modelViewer;
    document.head.appendChild(script);
  }

  let spark = null;
  function chargerSpark() {
    if (!spark) {
      // Adresses complètes : import() ne lit pas « js/… » comme un chemin relatif
      const adresse = (chemin) => new URL(chemin, document.baseURI).href;
      spark = Promise.all([
        import(adresse(donnees.vendor.three)),
        import(adresse(donnees.vendor.spark)),
        import(adresse(donnees.vendor.orbit)),
      ]).then(([THREE, Spark, Orbit]) => ({ THREE, Spark, OrbitControls: Orbit.OrbitControls }));
    }
    return spark;
  }

  function afficherVue3D() {
    const url = currentProject.model_3d;
    if (!url) return;
    // Même modèle déjà affiché ou en cours de chargement (redimensionnement) : on le garde
    if (vue3D && vue3D.url === url && (wrapper.contains(vue3D.element) || vue3D.enChargement)) return;
    arreterVue3D();
    const alt = echapper(infoMedia(url).alt);

    if (/\.(glb|gltf)$/i.test(url)) {
      chargerModelViewer();
      const poster = currentProject.image ? ` poster="${currentProject.image}"` : '';
      wrapper.innerHTML = `<model-viewer src="${url}" alt="${alt}"${poster} camera-controls touch-action="pan-y" auto-rotate shadow-intensity="1" ar></model-viewer>`;
      vue3D = { url, element: wrapper.firstElementChild, arreter() {} };
      return;
    }

    // Gaussian splat : l'aperçu reste affiché jusqu'à la première image du rendu
    wrapper.innerHTML = currentProject.image ? mediaHTML(currentProject.image, { id: 'mainImage' }) : '';
    const canvas = document.createElement('canvas');
    canvas.className = 'vue-splat';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', infoMedia(url).alt || '');
    const vue = { url, element: canvas, enChargement: true, arrete: false, arreter() { this.arrete = true; if (this.nettoyer) this.nettoyer(); } };
    vue3D = vue;

    chargerSpark().then(({ THREE, Spark, OrbitControls }) => {
      if (vue.arrete) return;
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xf1f1f1);
      const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 1000);
      scene.add(new Spark.SparkRenderer({ renderer }));
      const splat = new Spark.SplatMesh({ url });
      splat.quaternion.set(1, 0, 0, 0); // la plupart des fichiers ont l'axe Y vers le bas
      scene.add(splat);
      const controls = new OrbitControls(camera, canvas);
      controls.enableDamping = true;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 1;

      const ajuster = () => {
        const l = wrapper.clientWidth, h = wrapper.clientHeight;
        if (!l || !h) return;
        renderer.setSize(l, h, false);
        camera.aspect = l / h;
        camera.updateProjectionMatrix();
      };
      const observateur = new ResizeObserver(ajuster);

      splat.initialized.then(() => {
        if (vue.arrete) return;
        // Cadrage : la caméra recule jusqu'à voir tout le splat
        const boite = splat.getBoundingBox(true).applyMatrix4(splat.matrixWorld);
        const centre = boite.getCenter(new THREE.Vector3());
        const rayon = boite.getSize(new THREE.Vector3()).length() / 2 || 1;
        controls.target.copy(centre);
        camera.position.copy(centre).add(new THREE.Vector3(0, rayon * 0.3, rayon * 1.8));
        camera.near = rayon / 100;
        camera.far = rayon * 100;
        vue.enChargement = false;
        wrapper.innerHTML = '';
        wrapper.appendChild(canvas);
        observateur.observe(wrapper);
        ajuster();
        renderer.setAnimationLoop(() => {
          controls.update();
          renderer.render(scene, camera);
        });
      });

      vue.nettoyer = () => {
        observateur.disconnect();
        renderer.setAnimationLoop(null);
        controls.dispose();
        splat.dispose();
        renderer.dispose();
      };
      if (vue.arrete) vue.nettoyer();
    }).catch(err => {
      vue.enChargement = false;
      console.error('Vue 3D :', err);
    });
  }


  /* 12. REDIMENSIONNEMENT, LANGUES, DÉMARRAGE ------------------------------------------ */

  window.addEventListener('resize', () => {
    if (currentProject) displayImage();

    if (window.innerWidth > 991) {
      document.getElementById('menuContent').classList.remove('open');
    }

    // Réinitialiser l'état mobile si on quitte le mode mobile
    if (window.innerWidth > 479) {
      mobileInteractionActive = false;
      wrapper.removeEventListener('click', toggleMobileInteraction);
    }
  });

  // Passage FR / EN depuis l'accueil : l'autre langue affiche le même projet
  // (au lieu d'en tirer un autre au hasard).
  const CLE_LANGUE = 'visuvisu-projet';
  document.querySelectorAll('.langues a').forEach(a => a.addEventListener('click', () => {
    try { sessionStorage.setItem(CLE_LANGUE, currentProject.id); } catch (e) { /* stockage indisponible */ }
  }));

  // Projet affiché à l'arrivée : celui de la page ; sur l'accueil, tiré au hasard
  // (sauf retour arrière ou changement de langue, qui gardent le même).
  function projetInitial() {
    let transmis = null;
    try {
      transmis = sessionStorage.getItem(CLE_LANGUE);
      sessionStorage.removeItem(CLE_LANGUE);
    } catch (e) { /* stockage indisponible */ }
    const actif = document.querySelector('.project-item.active');
    if (!surAccueil && actif) return projects.find(p => `project-${p.id}` === actif.id);
    const navigation = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
    const retour = navigation && navigation.type === 'back_forward' && history.state && history.state.id;
    const choisi = projects.find(p => p.id === (transmis || retour));
    return choisi || projects[Math.floor(Math.random() * projects.length)];
  }

  initMenu();
  initNavigation();
  initSurvol();

  if (projects.length > 0) {
    const initial = projetInitial();
    selectProject(initial.id);
    history.replaceState({ id: initial.id, accueil: surAccueil }, '');
    majPage();

    // Auto-scroll vers le projet sélectionné au chargement initial (instantané)
    setTimeout(() => {
      const activeItem = document.querySelector('.project-item.active');
      if (activeItem) {
        activeItem.scrollIntoView({ behavior: 'instant', block: 'center' });
      }
    }, 100);
  }

  setTimeout(() => {
    startPreloading();
  }, 500);
})();
