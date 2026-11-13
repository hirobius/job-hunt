import { describe, expect, it } from 'vitest';
import { htmlToBlocks, sentenceCase, textToBlocks, type RichBlock } from './richText';

const json = (b: RichBlock[]) => JSON.stringify(b);

describe('htmlToBlocks: the allow-list', () => {
  it('drops script, style, iframe and img with their content', () => {
    const b = htmlToBlocks(
      '<p>Hi<script>alert(1)</script><style>p{}</style><iframe src="https://x.test"></iframe><img src=x onerror="alert(1)"></p>',
    );
    expect(b).toEqual([{ t: 'p', children: [{ t: 'text', text: 'Hi' }] }]);
  });

  it.each([
    '<a href="javascript:alert(1)">x</a>',
    '<a href=" javascript:alert(1)">x</a>',
    '<a href="data:text/html,<script>alert(1)</script>">x</a>',
    '<a href="vbscript:x">x</a>',
    '<a href="/relative">x</a>',
  ])('keeps no href but http(s): %s', (html) => {
    expect(json(htmlToBlocks(html))).not.toMatch(/"t":"a"/);
    expect(json(htmlToBlocks(html))).toContain('"text":"x"');
  });

  it('keeps an http(s) link and nothing else of it', () => {
    const b = htmlToBlocks(
      '<p><a href="https://ramp.com/x" onclick="steal()" style="color:red" class="c" target="_self">Ramp</a></p>',
    );
    expect(b).toEqual([
      {
        t: 'p',
        children: [{ t: 'a', href: 'https://ramp.com/x', children: [{ t: 'text', text: 'Ramp' }] }],
      },
    ]);
  });

  it('carries no attribute: on* handlers, style and class never reach the tree', () => {
    const s = json(
      htmlToBlocks(
        '<p onmouseover="x()" style="a" class="b"><strong onclick="y()">Bold</strong> <em>it</em></p><svg onload="z()"><text>no</text></svg>',
      ),
    );
    expect(s).not.toMatch(/onmouseover|onclick|onload|style|class|"no"/);
    expect(s).toContain('"t":"strong"');
    expect(s).toContain('"t":"em"');
  });

  it('nests lists inside list items', () => {
    const b = htmlToBlocks(
      '<ul><li>One<ul><li>One a</li></ul></li><li>Two</li></ul><ol><li>First</li></ol>',
    );
    expect(b).toEqual([
      {
        t: 'ul',
        items: [
          [
            { t: 'p', children: [{ t: 'text', text: 'One' }] },
            { t: 'ul', items: [[{ t: 'p', children: [{ t: 'text', text: 'One a' }] }]] },
          ],
          [{ t: 'p', children: [{ t: 'text', text: 'Two' }] }],
        ],
      },
      { t: 'ol', items: [[{ t: 'p', children: [{ t: 'text', text: 'First' }] }]] },
    ]);
  });

  it('maps headings under the page (h1/h2 → 3, h3 to h6 → 4) in sentence case', () => {
    const b = htmlToBlocks('<h1>ABOUT RAMP</h1><h3>What you will do</h3><h6>THE UX TEAM</h6>', [
      'Ramp',
    ]);
    expect(b).toEqual([
      { t: 'h', level: 3, text: 'About Ramp' },
      { t: 'h', level: 4, text: 'What you will do' },
      { t: 'h', level: 4, text: 'The UX team' },
    ]);
  });

  it('reads an all-caps bold line standing alone as a heading (Ashby writes them so)', () => {
    const b = htmlToBlocks(
      '<p><strong>ABOUT THE ROLE</strong></p><p>We are <b>HIRING</b> now.</p>',
    );
    expect(b[0]).toEqual({ t: 'h', level: 4, text: 'About the role' });
    expect(b[1].t).toBe('p');
  });

  it('keeps paragraphs apart and a lone break as a break', () => {
    const b = htmlToBlocks('<div>One<br>line two</div><div>Three</div>');
    expect(b).toHaveLength(2);
    expect(json(b)).toContain('"t":"br"');
  });
});

describe('sentenceCase', () => {
  it.each([
    ['ABOUT RAMP', ['Ramp'], 'About Ramp'],
    ["WHAT YOU'LL DO", [], "What you'll do"],
    ['UX AT RAMP', ['Ramp'], 'UX at Ramp'],
    ['BENEFITS IN THE US AND EU', [], 'Benefits in the US and EU'],
    ['API PLATFORM', [], 'API platform'],
    ['401K MATCH', [], '401K match'],
    ['Already Mixed Case', [], 'Already Mixed Case'],
  ])('%s → %s', (line, keep, want) => expect(sentenceCase(line, keep)).toBe(want));
});

describe('textToBlocks: plain-text fallback', () => {
  it('splits paragraphs, finds bullets and caps headings', () => {
    const b = textToBlocks(
      'ABOUT THE ROLE\nYou will build things.\n\n- Tokens\n• Docs\n1. First\n2. Second\nAfter.',
    );
    expect(b).toEqual([
      { t: 'h', level: 4, text: 'About the role' },
      { t: 'p', children: [{ t: 'text', text: 'You will build things.' }] },
      {
        t: 'ul',
        items: [
          [{ t: 'p', children: [{ t: 'text', text: 'Tokens' }] }],
          [{ t: 'p', children: [{ t: 'text', text: 'Docs' }] }],
        ],
      },
      {
        t: 'ol',
        items: [
          [{ t: 'p', children: [{ t: 'text', text: 'First' }] }],
          [{ t: 'p', children: [{ t: 'text', text: 'Second' }] }],
        ],
      },
      { t: 'p', children: [{ t: 'text', text: 'After.' }] },
    ]);
  });
});
