export interface LevelConfig {
  threshold: number;
  title: string;
}

export interface LevelProgress {
  currentLevel: number;
  currentTitle: string;
  nextLevelThreshold: number;
  expToNextLevel: number;
  progressPercent: number;
}

export interface RoamFilterOptions {
  includeDocuments?: boolean;
  autoBlockInvalid?: boolean;
}

export interface RoamCandidateResult {
  remId?: string;
  newBlockedIds: string[];
}
