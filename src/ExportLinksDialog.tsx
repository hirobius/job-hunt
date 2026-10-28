// Export links (2026-10-22): the saved jobs' posting links as a list to copy or download. The
// dialog's content; ExportLinksHost (mounted once in DataToolsProvider) loads it on the first open
// from the Pipeline's Jobs panel (on This view) or the Account menu (on All saved jobs). Scope and
// format are picked here; the text is exportLinks.buildLinkList.
import { useMemo, useRef, useState } from 'react';
import { Copy, Download } from 'lucide-react';
import {
  Button,
  Dialog,
  Icon,
  SegmentedControl,
  Stack,
  Text,
  Textarea,
  useToast,
} from '@hirobius/design-system';
import { useJobs } from './store';
import { usePipelineView, visibleJobs } from './pipelineView';
import { copyFilled } from './templateCopy';
import { download } from './download';
import { buildLinkList, linksFilename, type LinkFormat, type LinkScope } from './exportLinks';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default function ExportLinksDialog({ initialScope }: { initialScope: LinkScope }) {
  const jobs = useJobs();
  const view = usePipelineView();
  const { toast } = useToast();
  const [scope, setScope] = useState<LinkScope>(initialScope);
  const [format, setFormat] = useState<LinkFormat>('links');
  const previewRef = useRef<HTMLTextAreaElement>(null);

  const inView = useMemo(() => visibleJobs(jobs, view), [jobs, view]);
  const list = useMemo(
    () => buildLinkList(scope === 'view' ? inView : jobs, format),
    [scope, inView, jobs, format],
  );
  // "2 links", then why any job is missing: "2 links. 1 job has no link, so it's left out."
  const links = plural(list.count, 'link', 'links');
  const summary =
    list.skipped === 0
      ? links
      : `${links}. ${plural(list.skipped, 'job has', 'jobs have')} no link, so ${list.skipped === 1 ? "it's" : "they're"} left out.`;

  const copy = async () => {
    const r = await copyFilled(list.text);
    if (r.ok) {
      toast({ title: `Copied ${plural(list.count, 'link', 'links')}`, tone: 'success' });
      return;
    }
    // Blocked: select the whole list so a keyboard copy takes it.
    const el = previewRef.current;
    el?.focus();
    el?.setSelectionRange(0, el.value.length);
    toast({ title: 'Not copied', description: r.reason, tone: 'warning' });
  };

  return (
    // The message dialogs' chrome (rjb-dialog: 16px gutter at 390, the body scrolls).
    <Dialog.Content className="rjb-dialog">
      <Dialog.Header>
        <Dialog.Title>Export links</Dialog.Title>
        <Dialog.Description>
          Your saved jobs' posting links, to copy or download.
        </Dialog.Description>
      </Dialog.Header>
      <div className="rjb-dialog-body">
        <Stack gap="normal">
          <SegmentedControl
            label="Jobs"
            fullWidth
            value={scope}
            onChange={(v) => setScope(v as LinkScope)}
            options={[
              { value: 'view', label: `This view (${inView.length})` },
              { value: 'all', label: `All saved jobs (${jobs.length})` },
            ]}
          />
          <SegmentedControl
            label="Format"
            fullWidth
            value={format}
            onChange={(v) => setFormat(v as LinkFormat)}
            options={[
              { value: 'links', label: 'Links only' },
              { value: 'titled', label: 'With title and company' },
            ]}
          />
          <Stack gap="tight">
            <Textarea
              ref={previewRef}
              label="Preview"
              readOnly
              rows={6}
              resize="none"
              value={list.text}
              placeholder="No links to export"
            />
            <Text variant="caption" tone="secondary">
              {summary}
            </Text>
          </Stack>
        </Stack>
      </div>
      <Dialog.Footer>
        <Button
          variant="secondary"
          iconLeft={<Icon icon={Download} />}
          disabled={list.count === 0}
          onClick={() => download(linksFilename(new Date()), list.text, 'text/plain')}
        >
          Download .txt
        </Button>
        <Button
          variant="primary"
          iconLeft={<Icon icon={Copy} />}
          disabled={list.count === 0}
          onClick={copy}
        >
          Copy
        </Button>
      </Dialog.Footer>
    </Dialog.Content>
  );
}
