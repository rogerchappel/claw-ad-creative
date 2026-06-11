import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const skill = JSON.parse(
  readFileSync(path.join(root, 'skills/facebook-ad-creative/skill.json'), 'utf8')
);

const configExample = skill.metadata?.configExample ?? {};

const openclawConfig = {
  skills: {
    entries: {
      'facebook-ad-creative': {
        enabled: true,
        config: configExample
      }
    }
  },
  mcp: {
    servers: {
      fal: {
        url: 'https://mcp.fal.ai/mcp',
        headers: {
          Authorization: 'Bearer ${FAL_KEY}'
        }
      },
      'facebook-ads-library': {
        command: 'npx',
        args: ['-y', 'facebook-ads-library-mcp'],
        env: {
          ADS_LIBRARY_API_KEY: '${ADS_LIBRARY_API_KEY}'
        },
        disabled: true
      },
      higgsfield: {
        url: 'https://mcp.higgsfield.ai/mcp',
        disabled: true
      },
      'meta-ads': {
        url: 'https://mcp.facebook.com/ads',
        disabled: true,
        note: 'Enable only for ad ops/reporting agents with approval gates.'
      }
    }
  }
};

const crewcmdAssignment = {
  falSecretRef: { name: 'fal-api-key' },
  adsLibrarySecretRef: { name: 'ads-library-api-key' },
  higgsfieldSecretRef: { name: 'higgsfield-api-key' },
  metaSecretRef: { name: 'meta-ads-access-token' },
  adsLibraryProvider: 'browser-or-scraper',
  defaultMarket: 'AU',
  defaultBrand: 'Catalogue Viewer',
  canCreatePausedAds: false,
  canPublishAds: false,
  canChangeBudget: false
};

console.log('# OpenClaw runtime snippet');
console.log(JSON.stringify(openclawConfig, null, 2));
console.log('\n# CrewCMD skill assignment config');
console.log(JSON.stringify(crewcmdAssignment, null, 2));
