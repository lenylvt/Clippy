import { clipExtensionFromMime } from '../clip-format';
import type { VideoGroup } from '../types';

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function renderClipCard(clip: VideoGroup['clips'][number]) {
  const shareName = `clippy-${clip.id}.${clip.extension ?? clipExtensionFromMime('video/mp4')}`;

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

export function renderGalleryBody(groups: VideoGroup[]) {
  if (groups.length === 0) {
    return `<p class="empty">Aucun clip pour le moment. Crée-en un depuis YouTube avec Clippy.</p>`;
  }

  return `<div class="groups">${groups.map((group, index) => renderVideoGroup(group, index)).join('')}</div>`;
}
