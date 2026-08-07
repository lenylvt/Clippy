import { describe, expect, it } from 'vitest';
import { chromeProps, visualFamily } from '../src/chromeProps';

describe('chromeProps delta highlights', () => {
  it('chrome-empty has no developer-mode highlight', () => {
    expect(chromeProps('chrome-empty', 'install', '1.0.0')).toMatchObject({
      developerMode: false,
      highlightDeveloperMode: false,
      showClippy: false,
    });
  });

  it('install chrome-dev-on only adds developer-mode highlight', () => {
    const empty = chromeProps('chrome-empty', 'install', '1.0.0');
    const next = chromeProps('chrome-dev-on', 'install', '1.0.0');
    expect(next).toMatchObject({
      developerMode: true,
      highlightDeveloperMode: true,
      showClippy: false,
    });
    expect(next.highlightLoadUnpacked).toBeUndefined();
    expect(next.highlightRemove).toBeUndefined();
    expect(empty.highlightDeveloperMode).toBe(false);
  });

  it('keeps chrome family across empty → dev-on → load', () => {
    expect(visualFamily('chrome-empty')).toBe('chrome');
    expect(visualFamily('chrome-dev-on')).toBe('chrome');
    expect(visualFamily('load')).toBe('chrome');
    expect(visualFamily('download')).toBe('download');
  });

  it('load step highlights Load unpacked only', () => {
    expect(chromeProps('load', 'install', '1.0.0')).toMatchObject({
      developerMode: true,
      highlightLoadUnpacked: true,
      showClippy: false,
    });
  });

  it('download stays its own visual family (zip card)', () => {
    expect(visualFamily('download')).toBe('download');
    expect(visualFamily('download')).not.toBe('chrome');
  });
});
