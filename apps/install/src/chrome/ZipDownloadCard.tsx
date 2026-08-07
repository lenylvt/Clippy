import { LinkButton, Text } from '@cloudflare/kumo';
import { DownloadSimpleIcon } from '@phosphor-icons/react';

type ZipDownloadCardProps = {
  version: string;
  zipUrl: string;
  className?: string;
};

export function ZipDownloadCard({
  version,
  zipUrl,
  className = '',
}: ZipDownloadCardProps) {
  return (
    <div
      className={[
        'flex items-center gap-4 rounded-xl bg-kumo-base px-4 py-3 ring ring-kumo-line',
        className,
      ].join(' ')}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex h-12 w-10 shrink-0 items-end justify-center rounded border border-kumo-hairline bg-kumo-background pb-1 text-xs font-semibold text-kumo-accent">
          ZIP
        </div>
        <div className="grid min-w-0 gap-0.5">
          <Text bold className="truncate">
            clippy-extension.zip
          </Text>
          <Text variant="secondary" size="sm">
            Version {version}
          </Text>
        </div>
      </div>
      <LinkButton
        href={zipUrl}
        variant="primary"
        icon={DownloadSimpleIcon}
        className="shrink-0"
      >
        Télécharger
      </LinkButton>
    </div>
  );
}
