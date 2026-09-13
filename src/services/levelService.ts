import { LevelConfig, LevelProgress } from '../types';

export const DEFAULT_LEVELS_STRING = `0::NoName
1::Underdog
10::Rookie
100::SmartKid
1000::Professional
2000::BountyHunter
4000::SmartAss
10000::Hurricane
12000::SuperStar
14000::Jack
16000::King
20000::Ace
50000::NoName`;

/**
 * Parses user custom level string into structured LevelConfig array.
 * Format per line: "<threshold>::<title>"
 */
export function parseLevelConfig(rawConfig?: string): LevelConfig[] {
  const content = rawConfig && rawConfig.trim().length > 0 ? rawConfig : DEFAULT_LEVELS_STRING;

  const parsed: LevelConfig[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const parts = trimmed.split('::');
    if (parts.length >= 2) {
      const threshold = Number.parseInt(parts[0].trim(), 10);
      const title = parts.slice(1).join('::').trim();
      if (!Number.isNaN(threshold) && title.length > 0) {
        parsed.push({ threshold, title });
      }
    }
  }

  if (parsed.length === 0) {
    return [{ threshold: 0, title: 'NoName' }];
  }

  // Sort ascending by threshold
  parsed.sort((a, b) => a.threshold - b.threshold);
  return parsed;
}

/**
 * Calculates current level, title, remaining exp, and progress to next level.
 */
export function calculateLevelProgress(
  roamCount: number,
  levels: LevelConfig[]
): LevelProgress {
  if (levels.length === 0) {
    return {
      currentLevel: 0,
      currentTitle: 'NoName',
      nextLevelThreshold: 0,
      expToNextLevel: 0,
      progressPercent: 100,
    };
  }

  const safeCount = Math.max(0, roamCount);

  // Find current level index (the last level where threshold <= safeCount)
  let currentIndex = 0;
  for (let i = 0; i < levels.length; i++) {
    if (safeCount >= levels[i].threshold) {
      currentIndex = i;
    } else {
      break;
    }
  }

  const current = levels[currentIndex];
  const nextIndex = currentIndex + 1;

  if (nextIndex >= levels.length) {
    // Max level achieved
    return {
      currentLevel: currentIndex,
      currentTitle: current.title,
      nextLevelThreshold: current.threshold,
      expToNextLevel: 0,
      progressPercent: 100,
    };
  }

  const next = levels[nextIndex];
  const expToNextLevel = Math.max(0, next.threshold - safeCount);
  const span = Math.max(1, next.threshold - current.threshold);
  const currentSpanProgress = safeCount - current.threshold;
  const progressPercent = Math.min(100, Math.max(0, Math.round((currentSpanProgress / span) * 100)));

  return {
    currentLevel: currentIndex,
    currentTitle: current.title,
    nextLevelThreshold: next.threshold,
    expToNextLevel,
    progressPercent,
  };
}
