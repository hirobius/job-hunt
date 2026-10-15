import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { SegmentedControl, Tabs, TabsList, TabsTrigger } from '@hirobius/design-system';
import TabsOverflowFade from './TabsOverflowFade';

// jsdom has no layout: give every element the box a 390px phone would.
function layout({
  scrollWidth,
  clientWidth,
  scrollLeft = 0,
}: {
  scrollWidth: number;
  clientWidth: number;
  scrollLeft?: number;
}) {
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(scrollWidth);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(clientWidth);
  vi.spyOn(HTMLElement.prototype, 'scrollLeft', 'get').mockReturnValue(scrollLeft);
}

const ui = (value = 'a') => (
  <Tabs value={value}>
    <TabsOverflowFade value={value}>
      <TabsList aria-label="Sections">
        <TabsTrigger value="a">Today</TabsTrigger>
        <TabsTrigger value="b">Templates</TabsTrigger>
      </TabsList>
    </TabsOverflowFade>
  </Tabs>
);
const wrapper = () => screen.getByRole('tablist').parentElement!;

afterEach(cleanup);

describe('TabsOverflowFade (HDS gap: tab overflow cue)', () => {
  it('fades the trailing edge while more tabs sit past it', () => {
    layout({ scrollWidth: 420, clientWidth: 358 });
    render(ui());
    expect(wrapper()).toHaveAttribute('data-overflow', 'end');
    expect(wrapper().style.maskImage).toMatch(/linear-gradient/);
  });

  it('fades the leading edge once scrolled, and both edges in the middle', () => {
    layout({ scrollWidth: 420, clientWidth: 358, scrollLeft: 62 });
    const { unmount } = render(ui());
    expect(wrapper()).toHaveAttribute('data-overflow', 'start');
    unmount();
    layout({ scrollWidth: 420, clientWidth: 358, scrollLeft: 30 });
    render(ui());
    expect(wrapper()).toHaveAttribute('data-overflow', 'both');
  });

  it('shows no fade when the tabs fit', () => {
    layout({ scrollWidth: 358, clientWidth: 358 });
    render(ui());
    expect(wrapper()).not.toHaveAttribute('data-overflow');
    expect(wrapper().style.maskImage).toBe('');
  });

  it('scrolls the selected tab into view', () => {
    layout({ scrollWidth: 420, clientWidth: 358 });
    const scrolled: string[] = [];
    HTMLElement.prototype.scrollIntoView = function (this: HTMLElement) {
      scrolled.push(this.textContent ?? '');
    };
    render(ui('b'));
    expect(scrolled).toContain('Templates');
  });

  it('cues a SegmentedControl that overflows, and scrolls its checked option into view', () => {
    layout({ scrollWidth: 420, clientWidth: 358 });
    const scrolled: string[] = [];
    HTMLElement.prototype.scrollIntoView = function (this: HTMLElement) {
      scrolled.push(this.textContent ?? '');
    };
    render(
      <TabsOverflowFade value="live">
        <SegmentedControl
          aria-label="Tools"
          value="live"
          onChange={() => {}}
          options={[
            { value: 'apply', label: 'Apply' },
            { value: 'live', label: 'Live' },
          ]}
        />
      </TabsOverflowFade>,
    );
    expect(screen.getByRole('radiogroup').parentElement!.parentElement).toHaveAttribute(
      'data-overflow',
      'end',
    );
    expect(scrolled).toContain('Live');
  });
});
