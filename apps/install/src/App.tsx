import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import {
  Button,
  ClipboardText,
  LayerCard,
  Meter,
  Text,
} from '@cloudflare/kumo';
import { ArrowLeftIcon } from '@phosphor-icons/react';
import { ChromeExtensionsMock } from './chrome/ChromeExtensionsMock';
import { MacFolderPickerMock } from './chrome/MacFolderPickerMock';
import { UnzipContextMock } from './chrome/UnzipContextMock';
import { ZipDownloadCard } from './chrome/ZipDownloadCard';
import { ResizeCard } from './ResizeCard';
import {
  chromeProps,
  visualFamily,
  type Flow,
  type StepVisualKind,
} from './chromeProps';

type ExtensionInfo = {
  version: string;
  zipUrl: string;
  installUrl: string;
};

type Step = {
  title: string;
  body: string;
  visual: StepVisualKind;
  showDownload?: boolean;
  showCopyExtensions?: boolean;
};

const INSTALL_STEPS: Step[] = [
  {
    title: 'Télécharge Clippy',
    body: 'Clique sur le bouton. Un fichier zip arrive dans Téléchargements.',
    visual: 'download',
    showDownload: true,
  },
  {
    title: 'Dézippe le fichier',
    body: 'Clic droit sur le zip, puis Ouvrir (Mac) ou Extraire tout… (Windows).',
    visual: 'unzip',
  },
  {
    title: 'Ouvre la page Extensions',
    body: 'Copie le lien, colle-le dans Chrome, puis appuie sur Entrée.',
    visual: 'chrome-empty',
    showCopyExtensions: true,
  },
  {
    title: 'Allume Developer mode',
    body: 'En haut à droite, clique sur le switch jusqu’à ce qu’il soit bleu.',
    visual: 'chrome-dev-on',
    showCopyExtensions: true,
  },
  {
    title: 'Clique Load unpacked',
    body: 'Clique sur Load unpacked (Charger l’extension non empaquetée).',
    visual: 'load',
    showCopyExtensions: true,
  },
  {
    title: 'Choisis le dossier',
    body: 'Sélectionne le dossier clippy-extension (avec manifest.json), puis Select.',
    visual: 'picker',
  },
  {
    title: 'C’est prêt',
    body: 'Clippy apparaît dans la liste. Tu peux fermer cette page.',
    visual: 'done',
  },
];

const UPDATE_STEPS: Step[] = [
  {
    title: 'Télécharge la nouvelle version',
    body: 'Clique sur le bouton pour télécharger le zip.',
    visual: 'download',
    showDownload: true,
  },
  {
    title: 'Dézippe le fichier',
    body: 'Clic droit sur le zip, puis Ouvrir (Mac) ou Extraire tout… (Windows).',
    visual: 'unzip',
  },
  {
    title: 'Ouvre la page Extensions',
    body: 'Copie le lien, colle-le dans Chrome, puis Entrée.',
    visual: 'chrome-dev-on',
    showCopyExtensions: true,
  },
  {
    title: 'Supprime l’ancienne extension',
    body: 'Sur la carte Clippy, clique Remove.',
    visual: 'remove',
    showCopyExtensions: true,
  },
  {
    title: 'Clique Load unpacked',
    body: 'Clique sur Load unpacked.',
    visual: 'load',
    showCopyExtensions: true,
  },
  {
    title: 'Choisis le nouveau dossier',
    body: 'Sélectionne le dossier clippy-extension dézippé (avec manifest.json), puis Select.',
    visual: 'picker',
  },
  {
    title: 'C’est à jour',
    body: 'Clippy réapparaît avec la nouvelle version.',
    visual: 'done',
  },
];

async function loadExtensionInfo(): Promise<ExtensionInfo> {
  const origin = window.location.origin;
  try {
    const res = await fetch(`${origin}/api/extension`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error('bad_status');
    const data = (await res.json()) as Partial<ExtensionInfo> & { ok?: boolean };
    return {
      version: data.version || '0.0.0',
      zipUrl: data.zipUrl || `${origin}/extension.zip`,
      installUrl: data.installUrl || `${origin}/install/`,
    };
  } catch {
    return {
      version: '0.0.0',
      zipUrl: `${origin}/extension.zip`,
      installUrl: `${origin}/install/`,
    };
  }
}

function Fresh({
  stagger = 0,
  children,
  className = '',
}: {
  stagger?: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={['animate-enter', className].join(' ')}
      style={{ '--stagger': stagger } as CSSProperties}
    >
      {children}
    </div>
  );
}

function StaggerTitle({ title }: { title: string }) {
  const words = title.split(' ');
  return (
    <Text variant="heading2" as="h2">
      {words.map((word, i) => (
        <span
          key={`${title}-${word}-${i}`}
          className="animate-enter-title-word"
          style={{ '--stagger': i } as CSSProperties}
        >
          {word}
          {i < words.length - 1 ? '\u00A0' : ''}
        </span>
      ))}
    </Text>
  );
}

function StepVisual({
  kind,
  version,
  flow,
  zipUrl,
}: {
  kind: StepVisualKind;
  version: string;
  flow: Flow;
  zipUrl?: string;
}) {
  if (kind === 'download') {
    if (!zipUrl) return null;
    return (
      <Fresh key="download">
        <ZipDownloadCard version={version} zipUrl={zipUrl} />
      </Fresh>
    );
  }
  if (kind === 'unzip') {
    return (
      <Fresh key="unzip">
        <UnzipContextMock />
      </Fresh>
    );
  }
  if (kind === 'picker') {
    return (
      <Fresh key="picker">
        <MacFolderPickerMock />
      </Fresh>
    );
  }
  // Shared Chrome shell — props update in place; only new highlights animate
  return <ChromeExtensionsMock {...chromeProps(kind, flow, version)} />;
}

export function App() {
  const [info, setInfo] = useState<ExtensionInfo | null>(null);
  const [flow, setFlow] = useState<Flow | null>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    void loadExtensionInfo().then(setInfo);
  }, []);

  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    if (hash === 'update') setFlow('update');
    if (hash === 'install') setFlow('install');
  }, []);

  const steps = useMemo(
    () => (flow === 'update' ? UPDATE_STEPS : INSTALL_STEPS),
    [flow],
  );
  const step = flow ? steps[index] : null;
  const version = info?.version ?? '…';
  const progress = flow ? Math.round(((index + 1) / steps.length) * 100) : 0;

  // Resize only when the visual *family* changes (not chrome→chrome micro-updates)
  const resizeKey = flow
    ? `${flow}-${step ? visualFamily(step.visual) : 'choice'}`
    : 'choice';

  function start(next: Flow) {
    setFlow(next);
    setIndex(0);
    const hash = next === 'update' ? '#update' : '#install';
    window.history.replaceState(null, '', `${window.location.pathname}${hash}`);
  }

  function backToChoice() {
    setFlow(null);
    setIndex(0);
    window.history.replaceState(null, '', window.location.pathname);
  }

  function goNext() {
    if (!flow || !step) return;
    if (index >= steps.length - 1) {
      backToChoice();
      return;
    }
    setIndex((i) => i + 1);
  }

  function goBack() {
    if (index === 0) {
      backToChoice();
      return;
    }
    setIndex((i) => i - 1);
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-8">
      <div className="w-full max-w-3xl">
        <div className="mb-8 grid justify-items-center gap-1.5 text-center">
          <div className="animate-enter" style={{ '--stagger': 0 } as CSSProperties}>
            <Text variant="heading1" as="h1">
              Clippy
            </Text>
          </div>
          <div className="animate-enter" style={{ '--stagger': 1 } as CSSProperties}>
            <Text variant="secondary">
              Installer l’extension Chrome · v{version}
            </Text>
          </div>
        </div>

        {!flow ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="animate-enter" style={{ '--stagger': 2 } as CSSProperties}>
              <LayerCard>
                <LayerCard.Secondary>Première fois</LayerCard.Secondary>
                <LayerCard.Primary className="grid gap-4 px-5 py-4">
                  <div className="grid gap-1.5">
                    <Text bold>Je n’ai pas encore Clippy</Text>
                    <Text variant="secondary">
                      Installation complète, étape par étape.
                    </Text>
                  </div>
                  <Button variant="primary" onClick={() => start('install')}>
                    Commencer l’installation
                  </Button>
                </LayerCard.Primary>
              </LayerCard>
            </div>

            <div className="animate-enter" style={{ '--stagger': 3 } as CSSProperties}>
              <LayerCard>
                <LayerCard.Secondary>Déjà installé</LayerCard.Secondary>
                <LayerCard.Primary className="grid gap-4 px-5 py-4">
                  <div className="grid gap-1.5">
                    <Text bold>J’ai déjà Clippy</Text>
                    <Text variant="secondary">
                      Mise à jour vers la dernière version.
                    </Text>
                  </div>
                  <Button variant="secondary" onClick={() => start('update')}>
                    Mettre à jour
                  </Button>
                </LayerCard.Primary>
              </LayerCard>
            </div>
          </div>
        ) : step ? (
          <ResizeCard stepKey={resizeKey} className="w-full">
            <LayerCard className="overflow-hidden">
              <LayerCard.Secondary>
                <div className="flex w-full items-center justify-between gap-3">
                  <Text size="sm" variant="secondary">
                    Étape {index + 1} / {steps.length}
                  </Text>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={ArrowLeftIcon}
                    onClick={goBack}
                  >
                    {index === 0 ? 'Changer' : 'Retour'}
                  </Button>
                </div>
              </LayerCard.Secondary>
              <LayerCard.Primary className="grid gap-6 px-5 py-4">
                <Meter
                  label="Progression"
                  value={progress}
                  customValue={`${index + 1} / ${steps.length}`}
                />

                <div key={step.title} className="grid gap-1.5">
                  <Fresh>
                    <StaggerTitle title={step.title} />
                  </Fresh>
                  <Fresh stagger={1}>
                    <Text variant="secondary">{step.body}</Text>
                  </Fresh>
                </div>

                {step.showCopyExtensions ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Text variant="secondary" size="sm">
                      Lien à coller :
                    </Text>
                    <ClipboardText
                      text="chrome://extensions"
                      size="base"
                      tooltip={{
                        text: 'Copier',
                        copiedText: 'Copié !',
                        side: 'top',
                      }}
                    />
                  </div>
                ) : null}

                <StepVisual
                  kind={step.visual}
                  version={version}
                  flow={flow}
                  zipUrl={info?.zipUrl}
                />

                <div className="flex justify-end">
                  <Button variant="primary" onClick={goNext}>
                    {index >= steps.length - 1 ? 'Terminé' : 'Suivant'}
                  </Button>
                </div>
              </LayerCard.Primary>
            </LayerCard>
          </ResizeCard>
        ) : null}
      </div>
    </div>
  );
}
