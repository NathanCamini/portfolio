import type { Mode, StageId } from './engine/stages';

/**
 * What the browser remembers between visits: the last mode played and how
 * far the campaign got (phase 1 won → you come back to the boss). Optional:
 * without storage (private mode) the game simply starts from phase 1.
 */
const MODE_KEY = 'volley-mode';
const CAMPAIGN_KEY = 'volley-campaign-stage';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode: progress lasts until the tab closes */
  }
}

export const savedMode = (): Mode => (read(MODE_KEY) === 'endless' ? 'endless' : 'campaign');
export const saveMode = (mode: Mode) => write(MODE_KEY, mode);

export type CampaignStage = Exclude<StageId, 'endless'>;
export const savedCampaignStage = (): CampaignStage => (read(CAMPAIGN_KEY) === 'boss' ? 'boss' : 'easy');
export const saveCampaignStage = (stage: CampaignStage) => write(CAMPAIGN_KEY, stage);
