import { chromium } from 'playwright';

const dir = '/tmp/claude-0/-home-user-job-hunt/1b8ef437-3319-5a08-9388-ece51f4104b9/scratchpad';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

// Clear any stored expand state, land on Trades tab
await page.goto('http://localhost:4173/#/apprenticeships', { waitUntil: 'networkidle' });
await page.evaluate(() => { localStorage.removeItem('rjb_appr_expanded'); localStorage.removeItem('rjb_appr_collapsed'); });
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(700);

// No jump-chip row: count Tag-like chips in the header area is hard; instead assert the
// Expand all control exists and sections are collapsed (Reveal closed → tiles not visible).
const expandAll = await page.getByRole('button', { name: /expand all/i }).count();
console.log('Expand all button present:', expandAll > 0);

// A curated section header should be visible (e.g. contains "(" count), but its tiles hidden.
await page.screenshot({ path: `${dir}/nav-collapsed-mobile.png`, fullPage: true });

// Click Expand all → tiles appear
if (expandAll) {
  await page.getByRole('button', { name: /expand all/i }).click();
  await page.waitForTimeout(600);
  const collapseAll = await page.getByRole('button', { name: /collapse all/i }).count();
  console.log('Toggles to Collapse all:', collapseAll > 0);
  await page.screenshot({ path: `${dir}/nav-expanded-mobile.png`, fullPage: true });
}

// Desktop shot too
await page.setViewportSize({ width: 1280, height: 900 });
await page.evaluate(() => localStorage.removeItem('rjb_appr_expanded'));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(500);
await page.screenshot({ path: `${dir}/nav-collapsed-desktop.png`, fullPage: true });

console.log('CONSOLE ERRORS:', errors.filter((e) => !/TUNNEL|404|Fontshare|font/i.test(e)));
await browser.close();
