import { renderGalleryBody } from './gallery/render';
import { GALLERY_CLIENT_SCRIPT } from './gallery/client';
import { GALLERY_STYLES } from './gallery/styles';
import type { VideoGroup } from './types';

export function renderGalleryPage(groups: VideoGroup[]) {
  const body = renderGalleryBody(groups);

  return `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Clippy — Mes clips</title>
    <style>${GALLERY_STYLES}
    </style>
  </head>
  <body class="antialiased">
    <div id="share-hint" class="share-hint" hidden>Appuyer sur enregistrer la vidéo</div>
    <main class="page">
      <header class="header">
        <h1 class="title">Mes clips</h1>
      </header>
      ${body}
    </main>
    <script type="module">${GALLERY_CLIENT_SCRIPT}
    </script>
  </body>
</html>`;
}
