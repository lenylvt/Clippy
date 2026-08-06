/** @returns {string} */
function createEditorOverlayHtml() {
  return `
      <div class="clippy-shade" data-shade="top"></div>
      <div class="clippy-shade" data-shade="left"></div>
      <div class="clippy-shade" data-shade="right"></div>
      <div class="clippy-shade" data-shade="bottom"></div>

      <div class="clippy-video-frame" data-video-frame aria-hidden="true"></div>

      <div class="clippy-panel" data-panel role="dialog" aria-modal="true" aria-label="Éditeur Clippy" tabindex="-1">
        <div class="clippy-timeline" data-timeline>
          <div class="clippy-filmstrip" data-filmstrip aria-hidden="true"></div>
          <div class="clippy-track" data-track>
            <div class="clippy-regions" data-regions></div>
            <div
              class="clippy-playhead"
              data-playhead
              role="slider"
              tabindex="0"
              aria-label="Position de lecture"
              aria-valuemin="0"
              aria-valuemax="0"
              aria-valuenow="0"
            >
              <div class="clippy-playhead-knob"></div>
            </div>
          </div>
          <div class="clippy-clip-tooltip" data-clip-tooltip hidden role="tooltip">
            <div class="clippy-clip-tooltip-row"><span>Début</span><strong data-tip-start>0:00</strong></div>
            <div class="clippy-clip-tooltip-row"><span>Durée</span><strong data-tip-duration>0:00</strong></div>
            <div class="clippy-clip-tooltip-row"><span>Fin</span><strong data-tip-end>0:00</strong></div>
          </div>
        </div>

        <div class="clippy-toolbar">
          <button type="button" class="clippy-btn clippy-btn-ghost" data-action="close" aria-label="Annuler (Échap)">
            Annuler
          </button>
          <button type="button" class="clippy-btn clippy-btn-primary" data-action="save" aria-label="Clipper (Entrée)">
            Clipper <kbd class="clippy-kbd clippy-kbd-on-primary" aria-hidden="true">↵</kbd>
          </button>
        </div>
      </div>
    `;
}

globalThis.createEditorOverlayHtml = createEditorOverlayHtml;
