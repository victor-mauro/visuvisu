#!/usr/bin/env python3
"""
sync-media.py — Sauvegarde locale des medias Cloudinary de Visu Visu.

Lit projects.json, telecharge chaque media (image / video) depuis Cloudinary
dans _media-local/projets/<id>/, puis (re)genere _media-local/MEDIA-MAP.md,
la table de correspondance projet <-> fichier local <-> URL Cloudinary.

Usage : depuis la racine du repo visuvisu,
    python3 sync-media.py

Idempotent : un fichier deja telecharge n'est pas re-telecharge.
Aucune dependance a installer (bibliotheque standard Python 3 uniquement).
Le dossier _media-local/ est ignore par git (voir .gitignore) : rien n'est pousse.
"""

import json
import os
import sys
import urllib.request
from urllib.parse import urlparse

REPO_ROOT = os.path.dirname(os.path.abspath(__file__))
PROJECTS_JSON = os.path.join(REPO_ROOT, "projects.json")
MEDIA_DIR = os.path.join(REPO_ROOT, "_media-local")
PROJETS_DIR = os.path.join(MEDIA_DIR, "projets")
MAP_FILE = os.path.join(MEDIA_DIR, "MEDIA-MAP.md")

# Champs de projects.json susceptibles de contenir une URL de media
MEDIA_FIELDS = ["image", "image_hover", "image_zoomed", "video", "video_zoomed"]


def filename_from_url(url):
    """Nom de fichier = dernier segment de l'URL Cloudinary."""
    return os.path.basename(urlparse(url).path)


def download(url, dest):
    req = urllib.request.Request(url, headers={"User-Agent": "visuvisu-media-sync"})
    with urllib.request.urlopen(req, timeout=120) as r, open(dest, "wb") as f:
        f.write(r.read())


def main():
    if not os.path.exists(PROJECTS_JSON):
        print("ERREUR : projects.json introuvable.")
        print("Lance ce script depuis la racine du repo visuvisu (la ou se trouve projects.json).")
        sys.exit(1)

    with open(PROJECTS_JSON, encoding="utf-8") as f:
        data = json.load(f)

    projects = data.get("projects", [])
    os.makedirs(PROJETS_DIR, exist_ok=True)

    downloaded = skipped = errors = 0
    lines = [
        "# MEDIA-MAP - Visu Visu",
        "Correspondance projets <-> medias locaux <-> URLs Cloudinary.",
        "Sauvegarde des medias servis en ligne. Genere par sync-media.py - NON pousse sur GitHub.",
        "",
    ]

    for p in projects:
        pid = p.get("id", "sans_id")
        title = p.get("title", "")
        proj_dir = os.path.join(PROJETS_DIR, pid)
        os.makedirs(proj_dir, exist_ok=True)

        lines.append(f"## {pid} - {title}")
        for field in MEDIA_FIELDS:
            url = p.get(field)
            if not url:
                continue
            dest = os.path.join(proj_dir, filename_from_url(url))
            rel = os.path.relpath(dest, REPO_ROOT)
            if os.path.exists(dest):
                skipped += 1
                status = "deja present"
            else:
                try:
                    download(url, dest)
                    downloaded += 1
                    status = "telecharge"
                except Exception as e:  # noqa: BLE001
                    errors += 1
                    status = f"ERREUR ({e})"
            print(f"[{status}] {pid} - {field} -> {rel}")
            lines.append(f"- {field:12s} | {rel}")
            lines.append(f"               | {url}")
        lines.append("")

    with open(MAP_FILE, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")

    print()
    print(f"Termine : {downloaded} telecharge(s), {skipped} deja present(s), {errors} erreur(s).")
    print(f"Table de correspondance : {os.path.relpath(MAP_FILE, REPO_ROOT)}")


if __name__ == "__main__":
    main()
