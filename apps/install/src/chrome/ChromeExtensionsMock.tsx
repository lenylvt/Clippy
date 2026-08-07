/** Chrome Extensions page mock — visual only, matches chrome://extensions. */

export type ChromeMockProps = {
  developerMode: boolean;
  highlightLoadUnpacked?: boolean;
  highlightDeveloperMode?: boolean;
  highlightRemove?: boolean;
  showClippy?: boolean;
  clippyVersion?: string;
  clippyOn?: boolean;
  highlightReload?: boolean;
  emptyLabel?: string;
  className?: string;
};

function ChromeSwitch({ on, disabled }: { on: boolean; disabled?: boolean }) {
  return (
    <span
      className={[
        'relative inline-block h-[14px] w-[36px] shrink-0 rounded-full',
        on ? 'bg-[#aecbfa]' : 'bg-[#bdc1c6]',
        disabled ? 'opacity-50' : '',
      ].join(' ')}
      aria-hidden
    >
      <span
        className={[
          'chrome-switch-thumb absolute top-[-3px] h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.4)]',
          on ? 'translate-x-4 bg-[#1a73e8]' : 'translate-x-0',
        ].join(' ')}
      />
    </span>
  );
}

function OutlineBtn({
  children,
  highlight,
}: {
  children: string;
  highlight?: boolean;
}) {
  if (highlight) {
    return (
      <span className="animate-highlight inline-flex h-8 items-center rounded border border-[#1a73e8] bg-[#e8f0fe] px-3 text-[13px] font-medium text-[#1a73e8] ring-2 ring-[#1a73e8] ring-offset-2">
        {children}
      </span>
    );
  }
  return (
    <span className="inline-flex h-8 items-center rounded border border-[#1a73e8] bg-white px-3 text-[13px] font-medium text-[#1a73e8]">
      {children}
    </span>
  );
}

function DevModeControl({
  on,
  highlight,
}: {
  on: boolean;
  highlight?: boolean;
}) {
  const inner = (
    <>
      Developer mode
      <ChromeSwitch on={on} />
    </>
  );

  if (highlight) {
    return (
      <div
        key="dev-hl"
        className="animate-highlight flex shrink-0 items-center gap-2 rounded-md bg-[#e8f0fe] px-2 py-1.5 text-[13px] ring-2 ring-[#1a73e8] ring-offset-2"
      >
        {inner}
      </div>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-2 rounded-md px-2 py-1.5 text-[13px]">
      {inner}
    </div>
  );
}

export function ChromeExtensionsMock({
  developerMode,
  highlightLoadUnpacked,
  highlightDeveloperMode,
  highlightRemove,
  showClippy = true,
  clippyVersion = '0.2.6',
  clippyOn = true,
  highlightReload = false,
  emptyLabel = 'No extensions',
  className = '',
}: ChromeMockProps) {
  return (
    <div
      className={[
        'overflow-hidden rounded-xl bg-white text-left text-[#202124] ring ring-[#dadce0]',
        'font-[Roboto,system-ui,sans-serif] select-none',
        className,
      ].join(' ')}
      aria-hidden
    >
      <div className="flex h-14 items-center gap-4 border-b border-[#dadce0] px-4">
        <div className="shrink-0 text-[18px] font-normal">Extensions</div>
        <div className="mx-auto flex h-9 w-full max-w-md items-center gap-2 rounded-full bg-[#e8eaed] px-3 text-[13px] text-[#5f6368]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
          </svg>
          Search extensions
        </div>
        <DevModeControl on={developerMode} highlight={highlightDeveloperMode} />
      </div>

      <div className="flex min-h-[260px]">
        <aside className="w-[200px] shrink-0 border-r border-[#dadce0] p-3">
          <div className="flex items-center gap-3 rounded-full bg-[#e8f0fe] px-3 py-2 text-[13px] font-medium text-[#1967d2]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5a2.5 2.5 0 0 0-5 0V5H4c-1.1 0-1.99.9-1.99 2v3.8H3.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7s2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5a2.5 2.5 0 0 0 0-5z" />
            </svg>
            My extensions
          </div>
          <div className="mt-1 flex items-center gap-3 rounded-full px-3 py-2 text-[13px] text-[#3c4043]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M20 5H4c-1.1 0-1.99.9-1.99 2L2 17c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm-9 3h2v2h-2V8zm0 3h2v2h-2v-2zM8 8h2v2H8V8zm0 3h2v2H8v-2zm-1 2H5v-2h2v2zm0-3H5V8h2v2zm9 7H8v-2h8v2zm0-4h-2v-2h2v2zm0-3h-2V8h2v2zm3 3h-2v-2h2v2zm0-3h-2V8h2v2z" />
            </svg>
            Keyboard shortcuts
          </div>
        </aside>

        <div className="min-w-0 flex-1 px-5 py-4">
          {developerMode ? (
            <div className="mb-4 flex flex-wrap gap-2">
              <OutlineBtn highlight={highlightLoadUnpacked}>Load unpacked</OutlineBtn>
              <OutlineBtn>Pack extension</OutlineBtn>
              <OutlineBtn>Update</OutlineBtn>
            </div>
          ) : null}

          <div className="mb-3 text-[16px] font-normal">All Extensions</div>

          {showClippy ? (
            <div className="animate-enter max-w-xl rounded-lg bg-white p-4 ring ring-[#dadce0]">
              <div className="flex gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[#f1f3f4] text-lg font-semibold text-[#5f6368]">
                  C
                </div>
                <div className="min-w-0 flex-1">
                  <div className="grid gap-0.5">
                    <div className="text-[14px] font-medium">
                      Clippy{' '}
                      <span className="font-normal text-[#5f6368]">{clippyVersion}</span>
                    </div>
                    <p className="text-[13px] text-[#3c4043]">
                      Clippe rapidement des passages YouTube
                    </p>
                  </div>
                  <div className="mt-2 space-y-0.5 text-[12px] text-[#5f6368]">
                    <div>ID: mdlffepdgjacjmgjjhjigieingacjpfn</div>
                    <div>
                      Inspect views: <span className="text-[#1a73e8]">service worker</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2">
                <OutlineBtn>Details</OutlineBtn>
                <OutlineBtn highlight={highlightRemove}>Remove</OutlineBtn>
                <span className="flex-1" />
                {highlightReload ? (
                  <span className="animate-highlight inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#e8f0fe] text-[#1a73e8] ring-2 ring-[#1a73e8]">
                    ↻
                  </span>
                ) : developerMode ? (
                  <span className="inline-flex h-7 w-7 items-center justify-center text-[#5f6368]">
                    ↻
                  </span>
                ) : null}
                <ChromeSwitch on={clippyOn} />
              </div>
            </div>
          ) : (
            <div className="flex min-h-[120px] items-center justify-center rounded-lg bg-[#f8f9fa] text-[13px] text-[#5f6368] ring ring-[#dadce0]">
              {emptyLabel}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
