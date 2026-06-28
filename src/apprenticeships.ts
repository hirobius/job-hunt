// Curated apprenticeship / earn-while-you-learn programs for the Apprenticeships tab.
// Cross-field for now (these pathways span IT, data, and the trades); could become
// pillar-aware later. Reuses the Discover Group/Tile shape.
import { type Group, type Tile } from './jobsData';

const t = (name: string, meta: string, url: string): Tile => ({ name, meta, url });

export const APPRENTICESHIP_GROUPS: Group[] = [
  {
    id: 'appr-tech',
    label: 'Tech apprenticeships',
    tiles: [
      t(
        'Apprenti',
        'Registered tech apprenticeships · take the assessment',
        'https://apprenticareers.org/career-seeker/',
      ),
      t(
        'Multiverse',
        'Apprenticeships in software, data & AI',
        'https://www.multiverse.io/en-US/apprenticeships',
      ),
      t('Year Up United', 'Free training + paid internship', 'https://www.yearup.org/'),
      t(
        'Per Scholas',
        'Free tech training + employer placement',
        'https://perscholas.org/courses/',
      ),
      t(
        'LaunchCode',
        'Free coding education + paid apprenticeships',
        'https://www.launchcode.org/',
      ),
      t(
        'Creating IT Futures',
        'CompTIA nonprofit · IT-Ready program',
        'https://www.creatingitfutures.org/',
      ),
    ],
  },
  {
    id: 'appr-registered',
    label: 'Registered / government',
    tiles: [
      t(
        'Apprenticeship.gov',
        'Official U.S. registered-apprenticeship finder',
        'https://www.apprenticeship.gov/apprenticeship-job-finder',
      ),
      t(
        'CareerOneStop Finder',
        'DoL apprenticeship search by trade + state',
        'https://www.careeronestop.org/Toolkit/Training/find-apprenticeships.aspx',
      ),
      t(
        'WA State Apprenticeship',
        'Washington L&I registered programs',
        'https://lni.wa.gov/licensing-permits/apprenticeship/become-an-apprentice',
      ),
    ],
  },
  {
    id: 'appr-veteran',
    label: 'Veteran pathways',
    tiles: [
      t(
        'DoD SkillBridge',
        'Industry training in your last 180 days of service',
        'https://skillbridge.osd.mil/locations.htm',
      ),
      t(
        'VA VET TEC',
        'VA-funded high-tech training (no GI Bill used)',
        'https://www.va.gov/education/about-gi-bill-benefits/how-to-use-benefits/vettec-high-tech-program/',
      ),
      t(
        'Microsoft MSSA',
        'Software & Systems Academy for service members',
        'https://military.microsoft.com/programs/microsoft-software-systems-academy/',
      ),
      t(
        'Hiring Our Heroes',
        'Fellowships + apprenticeships for vets & spouses',
        'https://www.hiringourheroes.org/career-services/fellowships/',
      ),
      t(
        'Onward to Opportunity',
        'Free IVMF training + certification',
        'https://ivmf.syracuse.edu/programs/career-training/',
      ),
    ],
  },
];
