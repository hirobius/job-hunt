// Find's detail Description (2026-11-13): the posting's FULL text with its structure. The body comes
// from feed/postingBody.ts (the source's HTML where its board has one, never a cut) and is turned into
// React elements from the allow-listed tree of feed/richText.ts: no innerHTML anywhere. Headings sit
// under the Description panel's h2 (h3 for the source's h1/h2, h4 below), all-caps ones in sentence
// case; links are http(s) only and open in a new tab (HDS InlineLink sets target=_blank, rel=noopener noreferrer for an http(s) href). List cards keep their excerpts.
import { Fragment, useMemo, type ReactNode } from 'react';
import { InlineLink, Skeleton, Stack, Text } from '@hirobius/design-system';
import { usePostingBody } from './feed/postingBody';
import {
  htmlToBlocks,
  isHtml,
  textToBlocks,
  type RichBlock,
  type RichInline,
} from './feed/richText';
import type { Posting } from './feed/types';
import './PostingDescription.css';

function Inline({ nodes }: { nodes: RichInline[] }) {
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.t) {
          case 'text':
            return <Fragment key={i}>{n.text}</Fragment>;
          case 'br':
            return <br key={i} />;
          case 'strong':
            return (
              <strong key={i}>
                <Inline nodes={n.children} />
              </strong>
            );
          case 'em':
            return (
              <em key={i}>
                <Inline nodes={n.children} />
              </em>
            );
          case 'a':
            return (
              <InlineLink key={i} href={n.href}>
                <Inline nodes={n.children} />
              </InlineLink>
            );
        }
      })}
    </>
  );
}

function Blocks({ blocks }: { blocks: RichBlock[] }): ReactNode {
  return blocks.map((b, i) => {
    if (b.t === 'h')
      return (
        <Text key={i} variant={b.level === 3 ? 'body' : 'ui'} weight="bold" as={`h${b.level}`}>
          {b.text}
        </Text>
      );
    if (b.t === 'p')
      return (
        <Text key={i} variant="body" as="p" tone="secondary">
          <Inline nodes={b.children} />
        </Text>
      );
    const List = b.t;
    return (
      <List key={i} className="rjb-desc-list">
        {b.items.map((item, j) => (
          <li key={j}>
            <Text variant="body" as="div" tone="secondary">
              <Stack gap="px4">
                <Blocks blocks={item} />
              </Stack>
            </Text>
          </li>
        ))}
      </List>
    );
  });
}

/** The posting's whole description, structured, or a Skeleton while the full body is read. */
export default function PostingDescription({
  posting,
}: {
  posting: Pick<Posting, 'id' | 'url' | 'text' | 'company'>;
}) {
  const { body, loading } = usePostingBody(posting);
  const blocks = useMemo(() => {
    if (!body) return [];
    const keep = posting.company ? [posting.company] : [];
    if ('html' in body) return htmlToBlocks(body.html, keep);
    return isHtml(body.text) ? htmlToBlocks(body.text, keep) : textToBlocks(body.text, keep);
  }, [body, posting.company]);
  if (blocks.length)
    return (
      <Stack gap="px12" className="rjb-desc" data-rjb-description>
        <Blocks blocks={blocks} />
      </Stack>
    );
  return loading ? (
    <Stack gap="px8" aria-busy="true">
      <Skeleton variant="text" width="90%" />
      <Skeleton variant="text" width="80%" />
      <Skeleton variant="text" width="60%" />
    </Stack>
  ) : (
    <Text variant="caption" as="p" tone="secondary">
      This source gives no description. Open the posting to read it.
    </Text>
  );
}
