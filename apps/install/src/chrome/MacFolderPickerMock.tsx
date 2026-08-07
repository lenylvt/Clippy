/** macOS folder picker mock — select clippy-extension directory. */

export function MacFolderPickerMock({ className = '' }: { className?: string }) {
  return (
    <div
      className={[
        'overflow-hidden rounded-xl border border-[#c6c6c6] bg-[#ececec] text-left shadow-md',
        'font-[system-ui,-apple-system,sans-serif] text-[#1d1d1f] select-none',
        className,
      ].join(' ')}
      aria-hidden
    >
      <div className="flex items-center gap-2 border-b border-[#d0d0d0] bg-[#f6f6f6] px-3 py-2">
        <div className="flex gap-1.5">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <span className="h-3 w-3 rounded-full bg-[#28c840]" />
        </div>
        <div className="flex-1 text-center text-[13px] font-semibold">
          Select the extension directory.
        </div>
      </div>

      <div className="flex min-h-[220px]">
        <aside className="w-[140px] shrink-0 border-r border-[#d8d8d8] bg-[#f3f3f3] p-2 text-[12px]">
          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#6e6e73]">
            Favorites
          </div>
          <div className="rounded-md bg-[#dcdcdc] px-2 py-1 font-medium">Downloads</div>
          <div className="px-2 py-1 text-[#3a3a3c]">Desktop</div>
          <div className="px-2 py-1 text-[#3a3a3c]">Documents</div>
        </aside>

        <div className="flex min-w-0 flex-1">
          <div className="w-1/2 border-r border-[#d8d8d8] bg-white p-1">
            <div className="rounded bg-[#0a84ff] px-2 py-1 text-[13px] font-medium text-white">
              📁 clippy-extension
            </div>
          </div>
          <div className="w-1/2 bg-white p-1 text-[13px]">
            {[
              ['folder', 'background'],
              ['folder', 'content'],
              ['folder', 'icons'],
              ['folder', 'lib'],
              ['file', 'manifest.json'],
              ['folder', 'options'],
            ].map(([kind, name]) => (
              <div key={name} className="flex items-center gap-2 px-2 py-0.5">
                <span>{kind === 'folder' ? '📁' : '📄'}</span>
                <span className={name === 'manifest.json' ? 'font-medium' : ''}>{name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-[#d0d0d0] bg-[#f6f6f6] px-3 py-2.5">
        <span className="inline-flex h-7 items-center rounded-md border border-[#c6c6c6] bg-white px-3 text-[13px]">
          Cancel
        </span>
        <span className="inline-flex h-7 items-center rounded-md bg-[#0a84ff] px-3 text-[13px] font-medium text-white ring-2 ring-[#0a84ff] ring-offset-2">
          Select
        </span>
      </div>
    </div>
  );
}
