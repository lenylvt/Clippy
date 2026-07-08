export const GALLERY_STYLES = `
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
`;
