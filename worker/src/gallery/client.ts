export const GALLERY_CLIENT_SCRIPT = `
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
`;
