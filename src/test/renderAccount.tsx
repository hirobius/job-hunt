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
import { DELETE_MY_DATA, SIGN_OUT_UNSYNCED } from '../cloudMessages';

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

/** Open the Account menu's Data dialog (#550) and return it. */
export async function openData() {
  const menu = await openAccount();
  await userEvent.click(within(menu).getByRole('menuitem', { name: 'Data' }));
  return screen.findByRole('dialog', { name: 'Data' });
}

/** Open the Data dialog and press one of its actions by name. */
export async function chooseDataAction(name: string | RegExp) {
  const dialog = await openData();
  await userEvent.click(within(dialog).getByRole('button', { name }));
}

/** A sign-in on a device that holds data asks before adding it to the account (the merge guard,
 *  security audit): answer Add, as a person signing in to their own account would. */
export async function addDeviceDataIfAsked() {
  const add = screen.queryByRole('button', { name: 'Add to account' });
  if (add) await userEvent.click(add);
}

/** Sign-out with changes the cloud does not hold asks first (an HDS confirm, 2026-11-15): answer
 *  it. Fails when it never shows. */
export async function answerSignOutAsk(signOut: boolean) {
  const ask = await screen.findByRole('alertdialog', { name: SIGN_OUT_UNSYNCED.title });
  await userEvent.click(
    within(ask).getByRole('button', {
      name: signOut ? SIGN_OUT_UNSYNCED.confirm : SIGN_OUT_UNSYNCED.cancel,
    }),
  );
}

/** Delete my data asks first (an HDS confirm, #793): answer it. Fails when it never shows. */
export async function answerDeleteAsk(yes: boolean) {
  const ask = await screen.findByRole('alertdialog', { name: DELETE_MY_DATA.title });
  await userEvent.click(
    within(ask).getByRole('button', { name: yes ? DELETE_MY_DATA.confirm : DELETE_MY_DATA.cancel }),
  );
}

/** Whether sign-out's "lose recent changes?" confirm is on screen. */
export const signOutAsked = () =>
  screen.queryByRole('alertdialog', { name: SIGN_OUT_UNSYNCED.title }) !== null;
