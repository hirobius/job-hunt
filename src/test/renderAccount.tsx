// Renders the account seam (providers + the header's account menu) the way App does, for tests
// that drive sync and data tools through the menu.
import { render } from '@testing-library/react';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@hirobius/design-system';
import { ColorModeProvider } from '../ColorMode';
import CloudSyncProvider from '../account/CloudSyncProvider';
import DataToolsProvider from '../account/DataToolsProvider';
import AccountMenu from '../account/AccountMenu';

export const renderAccount = () =>
  render(
    <ColorModeProvider>
      <ToastProvider>
        <CloudSyncProvider>
          <DataToolsProvider>
            <AccountMenu />
          </DataToolsProvider>
        </CloudSyncProvider>
      </ToastProvider>
    </ColorModeProvider>,
  );

/** Open the account menu and return it. */
export async function openAccount() {
  await userEvent.click(screen.getByRole('button', { name: /^Account/ }));
  return screen.findByRole('menu');
}

/** Open the account menu and choose an item by name. */
export async function chooseAccountItem(name: string | RegExp) {
  const menu = await openAccount();
  await userEvent.click(within(menu).getByRole('menuitem', { name }));
}

/** A sign-in on a device that holds data asks before adding it to the account (the merge guard,
 *  security audit): answer Add, as a person signing in to their own account would. */
export async function addDeviceDataIfAsked() {
  const add = screen.queryByRole('button', { name: 'Add to account' });
  if (add) await userEvent.click(add);
}
