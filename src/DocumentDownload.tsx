// Download one Document Version as a PDF or a Word file (#229). Built in the browser by
// docExport.ts; nothing leaves the device.
import { Download } from 'lucide-react';
import { Button, Icon, Menu } from '@hirobius/design-system';
import { downloadDocument } from './docExport';
import type { Document, Version } from './documents';
import type { Job } from './types';

export function DocumentDownload({
  doc,
  version,
  job,
  size = 'sm',
}: {
  doc: Document;
  version: Version;
  /** The Job it belongs to: names the file after its company. */
  job?: Job;
  size?: 'sm' | 'md';
}) {
  const n = Math.max(1, doc.versions.findIndex((v) => v.id === version.id) + 1);
  return (
    <Menu>
      <Menu.Trigger asChild>
        <Button
          size={size}
          variant="tertiary"
          iconLeft={<Icon icon={Download} />}
          aria-label={`Download version ${n}`}
        >
          Download
        </Button>
      </Menu.Trigger>
      <Menu.Content align="end">
        <Menu.Item onSelect={() => downloadDocument(doc, version, job, 'pdf')}>
          Download PDF
        </Menu.Item>
        <Menu.Item onSelect={() => downloadDocument(doc, version, job, 'docx')}>
          Download Word
        </Menu.Item>
      </Menu.Content>
    </Menu>
  );
}
