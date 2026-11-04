export const RUNTIME_PRESETS = [30, 40, 50, 60] as const;

export const DWELL_PRESETS = {
  short: {id: 'short', label: '26–35초', min: 26, max: 35},
  balanced: {id: 'balanced', label: '36–45초', min: 36, max: 45},
  long: {id: 'long', label: '46–60초', min: 46, max: 60},
  immersive: {id: 'immersive', label: '61–75초', min: 61, max: 75},
} as const;

export const VISUAL_LIMITS = {
  characters: 4,
  locations: 6,
  objects: 5,
} as const;

export const INTRO_DURATION_SECONDS = 60;
export const INTRO_CLIP_RANGE = {min: 8, max: 12} as const;

export const GAP_PRESETS = {
  comma: 0.18,
  sentence: 0.38,
  paragraph: 0.72,
  speaker: 0.52,
  emotion: 0.62,
  scene: 1.05,
} as const;

export const VISUAL_STYLE = {
  name: '성인용 반실사 조선시대 삽화풍',
  prompt:
    'mature semi-realistic Joseon-era digital illustration, realistic Korean faces and proportions, restrained ink contours, tactile painterly brushwork, natural hanbok folds, period-accurate warm practical light, clear emotional storytelling, subject separated from subdued background, no text',
  negative:
    'modern objects, idol makeup, cosmetic surgery look, glossy romance webtoon, Chinese fantasy costume, anime exaggeration, typography, watermark',
} as const;
