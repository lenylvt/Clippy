/** Right-click unzip mock for macOS + Windows. */

export function UnzipContextMock({ className = '' }: { className?: string }) {
  return (
    <div className={['grid gap-4 sm:grid-cols-2', className].join(' ')} aria-hidden>
      <OsUnzip
        os="macOS"
        fileLabel="clippy-extension.zip"
        items={[
          { label: 'Ouvrir', highlight: true },
          { label: 'Ouvrir avec Aperçu' },
          { label: 'Déplacer vers la Corbeille' },
          { label: 'Informations' },
        ]}
        hint="Clic droit → Ouvrir"
      />
      <OsUnzip
        os="Windows"
        fileLabel="clippy-extension.zip"
        items={[
          { label: 'Extraire tout…', highlight: true },
          { label: 'Ouvrir' },
          { label: 'Couper' },
          { label: 'Propriétés' },
        ]}
        hint="Clic droit → Extraire tout…"
      />
    </div>
  );
}

function OsUnzip({
  os,
  fileLabel,
  items,
  hint,
}: {
  os: string;
  fileLabel: string;
  items: { label: string; highlight?: boolean }[];
  hint: string;
}) {
  return (
    <div className="rounded-xl bg-[#f1f3f4] p-3 ring ring-[#dadce0]">
      <div className="mb-2 text-[12px] font-medium text-[#5f6368]">{os}</div>
      <div className="relative rounded-lg bg-white p-3 ring ring-[#dadce0]">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-8 items-end justify-center rounded border border-[#dadce0] bg-[#f8f9fa] pb-1 text-[10px] font-semibold text-[#1a73e8]">
            ZIP
          </div>
          <div className="text-[13px] text-[#202124]">{fileLabel}</div>
        </div>

        {/* Context menu */}
        <div className="absolute top-10 left-8 z-10 min-w-[180px] rounded-md bg-white py-1 text-[13px] shadow-lg ring ring-[#dadce0]">
          {items.map((item) => (
            <div
              key={item.label}
              className={[
                'px-3 py-1.5',
                item.highlight
                  ? 'bg-[#e8f0fe] font-medium text-[#1967d2] ring-2 ring-inset ring-[#1a73e8]'
                  : 'text-[#202124]',
              ].join(' ')}
            >
              {item.label}
            </div>
          ))}
        </div>

        <div className="mt-24 text-[12px] text-[#5f6368]">{hint}</div>
      </div>
    </div>
  );
}
