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

const tools = () => (
  <TabsOverflowFade value="apply">
    <SegmentedControl
      aria-label="Tools"
      value="apply"
      onChange={() => {}}
      options={[
        { value: 'apply', label: 'Apply' },
        { value: 'live', label: 'Live' },
      ]}
    />
  </TabsOverflowFade>
);
const toolsFade = () => screen.getByRole('radiogroup').parentElement!.parentElement!;

describe('TabsOverflowFade (HDS gap: tab overflow cue)', () => {
  it('leaves the TabsList fade to HDS (0.26.1, hds#723): no second mask on the wrapper', () => {
    layout({ scrollWidth: 420, clientWidth: 358 });
    render(ui());
    expect(screen.getByRole('tablist')).toHaveAttribute('data-overflow', 'end');
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

  it('fades a SegmentedControl that overflows (HDS has no cue there yet), and scrolls its checked option into view', () => {
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
    const fade = screen.getByRole('radiogroup').parentElement!.parentElement!;
    expect(fade).toHaveAttribute('data-overflow', 'end');
    expect(fade.style.maskImage).toMatch(/linear-gradient/);
    expect(scrolled).toContain('Live');
  });

  it('fades the leading edge of a SegmentedControl once scrolled, both in the middle, none when it fits', () => {
    layout({ scrollWidth: 420, clientWidth: 358, scrollLeft: 62 });
    const first = render(tools());
    expect(toolsFade()).toHaveAttribute('data-overflow', 'start');
    first.unmount();
    layout({ scrollWidth: 420, clientWidth: 358, scrollLeft: 30 });
    const second = render(tools());
    expect(toolsFade()).toHaveAttribute('data-overflow', 'both');
    second.unmount();
    layout({ scrollWidth: 358, clientWidth: 358 });
    render(tools());
    expect(toolsFade()).not.toHaveAttribute('data-overflow');
    expect(toolsFade().style.maskImage).toBe('');
  });
});
