/** @returns {string} */
function createEditorOverlayHtml() {
  return `
      <div class="clippy-shade" data-shade="top" data-action="close"></div>
      <div class="clippy-shade" data-shade="left" data-action="close"></div>
      <div class="clippy-shade" data-shade="right" data-action="close"></div>
      <div class="clippy-shade" data-shade="bottom" data-action="close"></div>

      <div class="clippy-video-frame" data-video-frame aria-hidden="true"></div>

      <div class="clippy-frame-preview" data-frame-preview hidden>
        <canvas data-preview-canvas width="160" height="90"></canvas>
        <div class="clippy-frame-preview-time" data-preview-time></div>
      </div>

      <div class="clippy-panel" data-panel role="dialog" aria-label="Clippy">
        <div class="clippy-panel-meta">
          <span class="clippy-meta-chip" data-meta-start>0:00</span>
          <span class="clippy-meta-duration" data-meta-duration>0:00</span>
          <span class="clippy-meta-chip" data-meta-end>0:00</span>
        </div>

        <div class="clippy-timeline" data-timeline>
          <div class="clippy-filmstrip" data-filmstrip aria-hidden="true"></div>
          <div class="clippy-track" data-track>
            <div class="clippy-region" data-region>
              <div class="clippy-handle clippy-handle-left" data-handle="left" tabindex="0" aria-label="Début"></div>
              <div class="clippy-handle clippy-handle-right" data-handle="right" tabindex="0" aria-label="Fin"></div>
            </div>
            <div class="clippy-playhead" data-playhead aria-label="Position">
              <div class="clippy-playhead-knob"></div>
            </div>
          </div>
        </div>

        <div class="clippy-toolbar">
          <button type="button" class="clippy-btn clippy-btn-ghost" data-action="close">
            Annuler <kbd class="clippy-kbd">Esc</kbd>
          </button>
          <button type="button" class="clippy-btn clippy-btn-primary" data-action="save">
            Clipper <kbd class="clippy-kbd clippy-kbd-on-primary">↵</kbd>
          </button>
        </div>
      </div>
    `;
}

globalThis.createEditorOverlayHtml = createEditorOverlayHtml;
