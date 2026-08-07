export type Flow = 'install' | 'update';

export type StepVisualKind =
  | 'download'
  | 'unzip'
  | 'chrome-empty'
  | 'chrome-dev-on'
  | 'remove'
  | 'load'
  | 'picker'
  | 'done';

export type ChromeMockProps = {
  developerMode: boolean;
  highlightLoadUnpacked?: boolean;
  highlightDeveloperMode?: boolean;
  highlightRemove?: boolean;
  showClippy?: boolean;
  clippyVersion?: string;
  clippyOn?: boolean;
  emptyLabel?: string;
};

export const CHROME_VISUALS = new Set<StepVisualKind>([
  'chrome-empty',
  'chrome-dev-on',
  'remove',
  'load',
  'done',
]);

/** Maps wizard step → Chrome mock props (shell stays; only new highlights flip). */
export function chromeProps(
  kind: StepVisualKind,
  flow: Flow,
  version: string,
): ChromeMockProps {
  switch (kind) {
    case 'chrome-empty':
      return {
        developerMode: false,
        highlightDeveloperMode: false,
        showClippy: false,
        emptyLabel: 'No extensions',
      };
    case 'chrome-dev-on':
      return {
        developerMode: true,
        highlightDeveloperMode: flow === 'install',
        showClippy: flow === 'update',
        clippyOn: flow === 'update',
        clippyVersion: version,
        emptyLabel: 'No extensions',
      };
    case 'remove':
      return {
        developerMode: true,
        showClippy: true,
        clippyOn: true,
        highlightRemove: true,
        clippyVersion: version,
      };
    case 'load':
      return {
        developerMode: true,
        highlightLoadUnpacked: true,
        showClippy: false,
        emptyLabel: 'No extensions',
      };
    case 'done':
    default:
      return {
        developerMode: true,
        showClippy: true,
        clippyOn: true,
        clippyVersion: version,
      };
  }
}

export function visualFamily(kind: StepVisualKind): string {
  return CHROME_VISUALS.has(kind) ? 'chrome' : kind;
}
