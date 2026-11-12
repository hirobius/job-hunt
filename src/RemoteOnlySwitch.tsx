// Apply's Remote only switch (Adrian 2026-11-09; #614): the lg list column's one visible filter.
// The phone's All jobs sheet shows the same filter as a chip (#543). Per device.
import { Toggle } from '@hirobius/design-system';
import { setPipelineView, usePipelineView } from './pipelineView';

export default function RemoteOnlySwitch() {
  const { remoteOnly } = usePipelineView();
  return (
    <Toggle
      label="Remote only"
      checked={!!remoteOnly}
      onChange={(on) => setPipelineView({ remoteOnly: on })}
    />
  );
}
