import { BuiltInPowerupCodes, Rem, RNPlugin } from '@remnote/plugin-sdk';
import { RoamCandidateResult, RoamFilterOptions } from '../types';

/**
 * Checks if a Rem's rich text contains readable, meaningful text content.
 */
function hasMeaningfulText(rem: Rem): boolean {
  if (!rem.text || rem.text.length === 0) {
    return false;
  }

  return rem.text.some((part) => {
    if (typeof part === 'string') {
      return part.trim().length > 0;
    }
    if (part && typeof part === 'object') {
      // Exclude pure plugin embeds or standalone quotes
      if (part.i === 'p' || part.i === 'q') {
        return false;
      }
      if ('text' in part && typeof (part as { text?: string }).text === 'string') {
        return ((part as { text: string }).text || '').trim().length > 0;
      }
    }
    return false;
  });
}

/**
 * Multi-stage short-circuit candidate check.
 * Evaluates cheap in-memory checks first before making any asynchronous IPC calls.
 */
export async function isValidRoamCandidate(
  rem: Rem | undefined,
  blockedSet: Set<string>,
  options: RoamFilterOptions = {}
): Promise<boolean> {
  // Stage 1: Fast synchronous checks
  if (!rem || !rem._id) {
    return false;
  }

  if (blockedSet.has(rem._id)) {
    return false;
  }

  if (!hasMeaningfulText(rem)) {
    return false;
  }

  // Stage 2: Document check (exclude by default unless configured)
  if (!options.includeDocuments) {
    const isDoc = await rem.isDocument();
    if (isDoc) {
      return false;
    }
  }

  // Stage 3: Shallow async checks on candidate Rem
  // If isPowerup is true, bail immediately without checking individual powerup slots
  if (await rem.isPowerup()) {
    return false;
  }

  if (await rem.isSlot()) {
    return false;
  }

  if (await rem.isPowerupSlot()) {
    return false;
  }

  if (await rem.isPowerupEnum()) {
    return false;
  }

  if (await rem.isPowerupProperty()) {
    return false;
  }

  if (await rem.isPowerupPropertyListItem()) {
    return false;
  }

  // Check specific system powerup codes (UploadedFile, Link, Website)
  if (
    (await rem.hasPowerup(BuiltInPowerupCodes.UploadedFile)) ||
    (await rem.hasPowerup(BuiltInPowerupCodes.Link)) ||
    (await rem.hasPowerup(BuiltInPowerupCodes.Website))
  ) {
    return false;
  }

  // Stage 4: Hierarchy check (fetch parent only once)
  const parent = await rem.getParentRem();
  if (parent) {
    if (await parent.isPowerupSlot()) {
      return false;
    }
    if (
      (await parent.hasPowerup(BuiltInPowerupCodes.UploadedFile)) ||
      (await parent.hasPowerup(BuiltInPowerupCodes.Website))
    ) {
      return false;
    }

    const grandParent = await parent.getParentRem();
    if (grandParent) {
      if (await grandParent.hasPowerup(BuiltInPowerupCodes.UploadedFile)) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Draws a random valid Rem from the candidate pool with batch sampling.
 */
export async function drawRandomCandidate(
  plugin: RNPlugin,
  pool: string[],
  blockedSet: Set<string>,
  options: RoamFilterOptions = { autoBlockInvalid: true },
  maxTries: number = 30
): Promise<RoamCandidateResult> {
  const newBlockedIds: string[] = [];

  if (!pool || pool.length === 0) {
    return { remId: undefined, newBlockedIds };
  }

  // Filter out known blocked IDs before sampling
  const eligiblePool = pool.filter((id) => !blockedSet.has(id));
  if (eligiblePool.length === 0) {
    return { remId: undefined, newBlockedIds };
  }

  const attempts = Math.min(maxTries, eligiblePool.length);
  const triedIndices = new Set<number>();

  for (let i = 0; i < attempts; i++) {
    let randomIndex = Math.floor(Math.random() * eligiblePool.length);
    let attemptsToFindUntried = 0;
    while (triedIndices.has(randomIndex) && attemptsToFindUntried < 10) {
      randomIndex = Math.floor(Math.random() * eligiblePool.length);
      attemptsToFindUntried++;
    }
    triedIndices.add(randomIndex);

    const candidateId = eligiblePool[randomIndex];
    const rem = await plugin.rem.findOne(candidateId);

    const valid = await isValidRoamCandidate(rem, blockedSet, options);
    if (valid && rem) {
      return { remId: rem._id, newBlockedIds };
    }

    if (candidateId && options.autoBlockInvalid) {
      newBlockedIds.push(candidateId);
      blockedSet.add(candidateId);
    }
  }

  return { remId: undefined, newBlockedIds };
}

/**
 * Synchronizes and caches all Rem IDs in the current knowledge base.
 */
export async function syncAllRemIds(plugin: RNPlugin): Promise<string[]> {
  const allRems = await plugin.rem.getAll();
  return allRems.map((r) => r._id);
}
