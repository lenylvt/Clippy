import type { VideoGroup } from './types';

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function renderClipCard(clip: VideoGroup['clips'][number]) {
  const shareName = `clippy-${clip.id}.mp4`;

  return `
    <article class="clip-card" data-clip-id="${escapeHtml(clip.id)}">
      <video class="clip-video" src="${escapeHtml(clip.url)}" controls playsinline preload="metadata"></video>
      <div class="clip-toolbar">
        <button type="button" class="share-btn" data-share-url="${escapeHtml(clip.url)}" data-share-name="${escapeHtml(shareName)}">
          Partager
        </button>
        <button type="button" class="delete-btn" data-clip-id="${escapeHtml(clip.id)}" aria-label="Supprimer">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm1 6h2v9h-2V9Zm4 0h2v9h-2V9ZM7 9h2v9H7V9Z" fill="currentColor"/>
          </svg>
        </button>
      </div>
    </article>
  `;
}

function renderVideoGroup(group: VideoGroup, index: number) {
  const count = group.clips.length;
  const label = count === 1 ? '1 clip' : `${count} clips`;

  return `
    <details class="video-group" ${index === 0 ? 'open' : ''}>
      <summary class="video-summary">
        <span class="video-title">${escapeHtml(group.videoTitle)}</span>
        <span class="video-count">${label}</span>
      </summary>
      <div class="video-body">
        <div class="clip-grid">
          ${group.clips.map((clip) => renderClipCard(clip)).join('')}
        </div>
      </div>
    </details>
  `;
}

export function renderGalleryPage(groups: VideoGroup[]) {
  const body =
    groups.length === 0
      ? `<p class="empty">Aucun clip pour le moment. Crée-en un depuis YouTube avec Clippy.</p>`
      : `<div class="groups">${groups.map((group, index) => renderVideoGroup(group, index)).join('')}</div>`;

  return `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Clippy — Mes clips</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
      }

      * { box-sizing: border-box; }

      body {
        margin: 0;
        min-height: 100vh;
        background: oklch(0.14 0.012 260);
        color: oklch(0.94 0.01 260);
        -webkit-font-smoothing: antialiased;
      }

      .page {
        width: min(920px, 100%);
        margin: 0 auto;
        padding: 28px 18px 48px;
      }

      .header {
        margin-bottom: 28px;
      }

      .title {
        margin: 0;
        font-size: clamp(1.6rem, 4vw, 2rem);
        text-wrap: balance;
      }

      .empty {
        padding: 28px;
        border-radius: 14px;
        background: oklch(0.18 0.012 260);
        border: 1px solid oklch(0.28 0.02 260);
        text-wrap: pretty;
      }

      .groups {
        display: grid;
        gap: 14px;
      }

      .video-group {
        border-radius: 14px;
        background: oklch(0.17 0.012 260);
        border: 1px solid oklch(0.28 0.02 260);
        overflow: hidden;
      }

      .video-summary {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 16px 18px;
        cursor: pointer;
        list-style: none;
        user-select: none;
      }

      .video-summary::-webkit-details-marker { display: none; }

      .video-title {
        font-weight: 650;
        text-wrap: balance;
      }

      .video-count {
        flex-shrink: 0;
        padding: 4px 10px;
        border-radius: 999px;
        background: oklch(0.22 0.02 260);
        color: oklch(0.78 0.02 260);
        font-size: 0.82rem;
        font-variant-numeric: tabular-nums;
      }

      .video-body {
        padding: 0 18px 18px;
        display: grid;
        gap: 14px;
      }

      .clip-grid {
        display: grid;
        gap: 14px;
      }

      .clip-card {
        display: grid;
        gap: 10px;
        padding: 12px;
        border-radius: 12px;
        background: oklch(0.13 0.012 260);
        border: 1px solid oklch(0.24 0.02 260);
      }

      .clip-video {
        width: 100%;
        border-radius: 8px;
        background: oklch(0.08 0.01 260);
        outline: 1px solid oklch(1 0 0 / 0.1);
      }

      .share-btn {
        flex: 1;
        min-width: 0;
        padding: 12px 16px;
        border: none;
        border-radius: 10px;
        background: oklch(0.82 0.16 95);
        color: oklch(0.18 0.04 95);
        font: inherit;
        font-weight: 650;
        cursor: pointer;
        user-select: none;
        transition: transform 140ms ease, opacity 140ms ease;
      }

      .clip-toolbar {
        display: flex;
        align-items: stretch;
        gap: 10px;
      }

      .delete-btn {
        flex-shrink: 0;
        width: 44px;
        height: 44px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        border: 1px solid oklch(0.38 0.08 25 / 0.5);
        border-radius: 10px;
        background: oklch(0.18 0.03 25);
        color: oklch(0.78 0.14 25);
        cursor: pointer;
        user-select: none;
        transition: transform 140ms ease, background 140ms ease, opacity 140ms ease;
      }

      .delete-btn:hover {
        background: oklch(0.22 0.05 25);
      }

      .share-btn:active,
      .delete-btn:active { transform: scale(0.97); }

      .share-btn:disabled,
      .delete-btn:disabled { opacity: 0.55; cursor: wait; }

      .share-hint {
        position: fixed;
        inset: 0 0 auto 0;
        z-index: 1000;
        padding: 18px 20px;
        background: oklch(0.2 0.04 95 / 0.96);
        border-bottom: 2px solid oklch(0.82 0.16 95);
        color: oklch(0.98 0.02 95);
        text-align: center;
        font-size: 1.05rem;
        font-weight: 700;
        transform: translateY(-100%);
        opacity: 0;
        filter: blur(6px);
        transition:
          transform 220ms ease,
          opacity 220ms ease,
          filter 220ms ease;
        pointer-events: none;
      }

      .share-hint.is-visible {
        transform: translateY(0);
        opacity: 1;
        filter: blur(0);
      }
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
    <script type="module">
      const hint = document.getElementById('share-hint');

      function showShareHint() {
        hint.hidden = false;
        requestAnimationFrame(() => hint.classList.add('is-visible'));
      }

      function hideShareHint() {
        hint.classList.remove('is-visible');
        window.setTimeout(() => {
          hint.hidden = true;
        }, 220);
      }

      function shareFilename(blob, fallback) {
        const ext = blob.type.toLowerCase().includes('mp4') ? 'mp4' : 'webm';
        return fallback.replace(/\\.(webm|mp4)$/i, \`.\${ext}\`);
      }

      async function shareClip(url, filename, button) {
        if (!navigator.share) {
          window.open(url, '_blank', 'noopener,noreferrer');
          return;
        }

        const defaultLabel = button.textContent;
        button.disabled = true;
        button.textContent = 'Préparation…';

        try {
          const response = await fetch(url);
          if (!response.ok) throw new Error('fetch_failed');
          const blob = await response.blob();
          const shareName = shareFilename(blob, filename);
          showShareHint();
          const file = new File([blob], shareName, { type: blob.type || 'video/mp4' });
          await navigator.share({ files: [file], title: 'Clip Clippy' });
        } catch (error) {
          if (error?.name !== 'AbortError') {
            window.open(url, '_blank', 'noopener,noreferrer');
          }
        } finally {
          hideShareHint();
          button.disabled = false;
          button.textContent = defaultLabel;
        }
      }

      async function deleteClip(id, button) {
        if (!window.confirm('Supprimer ce clip ?')) return;

        const card = button.closest('.clip-card');
        button.disabled = true;

        try {
          const response = await fetch(\`/api/clips/\${id}\`, { method: 'DELETE' });
          if (!response.ok) throw new Error('delete_failed');
          const group = card?.closest('.video-group');
          card?.remove();
          if (group && !group.querySelector('.clip-card')) {
            group.remove();
          }
          if (!document.querySelector('.clip-card')) {
            const groups = document.querySelector('.groups');
            if (groups) {
              groups.outerHTML = '<p class="empty">Aucun clip pour le moment. Crée-en un depuis YouTube avec Clippy.</p>';
            }
          }
        } catch {
          button.disabled = false;
          window.alert('Suppression impossible');
        }
      }

      document.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;

        const deleteButton = target.closest('[data-clip-id].delete-btn');
        if (deleteButton instanceof HTMLButtonElement && deleteButton.dataset.clipId) {
          deleteClip(deleteButton.dataset.clipId, deleteButton);
          return;
        }

        const shareButton = target.closest('[data-share-url]');
        if (!(shareButton instanceof HTMLButtonElement)) return;
        const url = shareButton.dataset.shareUrl;
        const name = shareButton.dataset.shareName ?? 'clip.mp4';
        if (!url) return;
        shareClip(url, name, shareButton);
      });
    </script>
  </body>
</html>`;
}
