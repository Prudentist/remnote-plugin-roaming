import assert from 'assert';
import { parseLevelConfig, calculateLevelProgress } from '../src/services/levelService';
import { isValidRoamCandidate } from '../src/services/roamEngine';
import { BuiltInPowerupCodes, Rem } from '@remnote/plugin-sdk';

function runLevelServiceTests() {
  console.log('Testing levelService...');

  // Test 1: Default config parsing
  const defaultLevels = parseLevelConfig();
  assert(defaultLevels.length > 0, 'Default levels should not be empty');
  assert.strictEqual(defaultLevels[0].threshold, 0);
  assert.strictEqual(defaultLevels[0].title, 'NoName');

  // Test 2: Custom config with unordered and whitespace lines
  const customStr = `
    100::Gold
    0::Bronze
    10::Silver
    invalid::Skip
    
  `;
  const parsed = parseLevelConfig(customStr);
  assert.strictEqual(parsed.length, 3);
  assert.strictEqual(parsed[0].threshold, 0);
  assert.strictEqual(parsed[0].title, 'Bronze');
  assert.strictEqual(parsed[1].threshold, 10);
  assert.strictEqual(parsed[1].title, 'Silver');
  assert.strictEqual(parsed[2].threshold, 100);
  assert.strictEqual(parsed[2].title, 'Gold');

  // Test 3: Progress calculations
  const p0 = calculateLevelProgress(0, parsed);
  assert.strictEqual(p0.currentLevel, 0);
  assert.strictEqual(p0.currentTitle, 'Bronze');
  assert.strictEqual(p0.expToNextLevel, 10);
  assert.strictEqual(p0.progressPercent, 0);

  const p5 = calculateLevelProgress(5, parsed);
  assert.strictEqual(p5.currentLevel, 0);
  assert.strictEqual(p5.currentTitle, 'Bronze');
  assert.strictEqual(p5.expToNextLevel, 5);
  assert.strictEqual(p5.progressPercent, 50);

  const p10 = calculateLevelProgress(10, parsed);
  assert.strictEqual(p10.currentLevel, 1);
  assert.strictEqual(p10.currentTitle, 'Silver');
  assert.strictEqual(p10.expToNextLevel, 90);
  assert.strictEqual(p10.progressPercent, 0);

  const p150 = calculateLevelProgress(150, parsed);
  assert.strictEqual(p150.currentLevel, 2);
  assert.strictEqual(p150.currentTitle, 'Gold');
  assert.strictEqual(p150.expToNextLevel, 0);
  assert.strictEqual(p150.progressPercent, 100);

  console.log('✓ levelService tests passed!');
}

async function runRoamEngineTests() {
  console.log('Testing roamEngine...');

  const createMockRem = (overrides: Partial<Rem> = {}): Rem => {
    return {
      _id: 'rem_1',
      text: ['Valid content'],
      type: 'none',
      isDocument: async () => false,
      isPowerup: async () => false,
      isSlot: async () => false,
      isPowerupSlot: async () => false,
      isPowerupEnum: async () => false,
      isPowerupProperty: async () => false,
      isPowerupPropertyListItem: async () => false,
      hasPowerup: async () => false,
      getParentRem: async () => undefined,
      ...overrides,
    } as unknown as Rem;
  };

  const blockSet = new Set<string>(['blocked_1']);

  // Test 1: Blocked Rem rejection
  const blockedRem = createMockRem({ _id: 'blocked_1' });
  assert.strictEqual(await isValidRoamCandidate(blockedRem, blockSet), false);

  // Test 2: Empty text Rem rejection
  const emptyTextRem = createMockRem({ text: [] });
  assert.strictEqual(await isValidRoamCandidate(emptyTextRem, blockSet), false);

  const whitespaceRem = createMockRem({ text: ['   '] });
  assert.strictEqual(await isValidRoamCandidate(whitespaceRem, blockSet), false);

  // Test 3: Valid normal Rem
  const validRem = createMockRem();
  assert.strictEqual(await isValidRoamCandidate(validRem, blockSet), true);

  // Test 4: Root Rem (getParentRem() === undefined) MUST be valid (testing ?? false bug fix!)
  const rootRem = createMockRem({
    _id: 'root_rem',
    getParentRem: async () => undefined,
  });
  assert.strictEqual(
    await isValidRoamCandidate(rootRem, blockSet),
    true,
    'Root Rem without parent must be VALID! (Regression test for ?? true bug)'
  );

  // Test 5: Document filtering
  const docRem = createMockRem({
    isDocument: async () => true,
  });
  assert.strictEqual(
    await isValidRoamCandidate(docRem, blockSet, { includeDocuments: false }),
    false,
    'Document should be rejected when includeDocuments is false'
  );
  assert.strictEqual(
    await isValidRoamCandidate(docRem, blockSet, { includeDocuments: true }),
    true,
    'Document should be accepted when includeDocuments is true'
  );

  // Test 6: Powerup Rem rejection
  const powerupRem = createMockRem({
    isPowerup: async () => true,
  });
  assert.strictEqual(await isValidRoamCandidate(powerupRem, blockSet), false);

  // Test 7: Uploaded file rejection
  const fileRem = createMockRem({
    hasPowerup: async (code) => code === BuiltInPowerupCodes.UploadedFile,
  });
  assert.strictEqual(await isValidRoamCandidate(fileRem, blockSet), false);

  // Test 8: Rem under powerup slot parent rejection
  const childUnderPowerup = createMockRem({
    getParentRem: async () =>
      createMockRem({
        isPowerupSlot: async () => true,
      }),
  });
  assert.strictEqual(await isValidRoamCandidate(childUnderPowerup, blockSet), false);

  console.log('✓ roamEngine tests passed!');
}

async function main() {
  runLevelServiceTests();
  await runRoamEngineTests();
  console.log('All automated tests completed successfully!');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
