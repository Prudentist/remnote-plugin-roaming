import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  usePlugin,
  renderWidget,
  useTrackerPlugin as useTracker,
  useLocalStorageState,
  AppEvents,
  useAPIEventListener,
  useOnMessageBroadcast,
  RNPlugin,
} from '@remnote/plugin-sdk';
import clsx from 'clsx';
import { SAnimatedNumbers } from './animated_number';
import ConfirmDialog from './confirm_dialog';
import { parseLevelConfig, calculateLevelProgress } from '../services/levelService';
import { drawRandomCandidate, syncAllRemIds } from '../services/roamEngine';

export function RoamingWidget() {
  const plugin = usePlugin();

  // Dialog, Container and UI states
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(260);
  const [dialogOpen, setDialogOpen] = useState<boolean>(false);
  const [dark, setDark] = useState<boolean>(() =>
    typeof document !== 'undefined' ? document.body.classList.contains('dark') : false
  );
  const [currentRemId, setCurrentRemId] = useState<string>('');
  const [isRoaming, setIsRoaming] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Measure container width for responsive minimalist narrow layout
  useEffect(() => {
    if (!containerRef.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect && entry.contentRect.width > 0) {
          setContainerWidth(entry.contentRect.width);
        }
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const isNarrow = containerWidth < 220;
  const isUltraNarrow = containerWidth < 140;

  // Persistent user state
  const [roamCount, setRoamCount] = useLocalStorageState<number>('roamcount', 0);
  const [roamedSetArr, setRoamedSetArr] = useLocalStorageState<string[]>('roamingset', []);
  const [blockSetArr, setBlockSetArr] = useLocalStorageState<string[]>('blockset', []);
  const [allRems, setAllRems] = useLocalStorageState<string[]>('allrems', []);

  // In-memory Sets for O(1) membership testing
  const blockedSet = useMemo(() => new Set(blockSetArr || []), [blockSetArr]);

  // Reactive plugin settings
  const isSimpleView = useTracker(
    async (rp: RNPlugin) => (await rp.settings.getSetting('roaming_mode')) as boolean
  ) ?? false;

  const levelCustom = useTracker(
    async (rp: RNPlugin) => (await rp.settings.getSetting('level_custom')) as string
  ) ?? '';

  const includeDocuments = useTracker(
    async (rp: RNPlugin) => (await rp.settings.getSetting('include_documents')) as boolean
  ) ?? false;

  // Derived level progression (pure calculation via useMemo)
  const levelConfig = useMemo(() => parseLevelConfig(levelCustom), [levelCustom]);
  const progress = useMemo(
    () => calculateLevelProgress(roamCount || 0, levelConfig),
    [roamCount, levelConfig]
  );

  // Dark mode listener
  useAPIEventListener(AppEvents.setDarkMode, undefined, async (data) => {
    if (data && typeof data.darkMode === 'boolean') {
      setDark(data.darkMode);
    }
  });

  useEffect(() => {
    if (typeof document !== 'undefined') {
      setDark(document.body.classList.contains('dark'));
    }
  }, []);

  // Synchronize Rem pool
  const handleSyncPool = useCallback(async () => {
    if (!plugin || isSyncing) return;
    setIsSyncing(true);
    try {
      const ids = await syncAllRemIds(plugin);
      await setAllRems(ids);
      await plugin.app.toast(`Synced ${ids.length} rems into roaming pool.`);
    } catch (err) {
      console.error('Failed to sync rem pool:', err);
      await plugin.app.toast('Failed to sync rem pool. Please try again.');
    } finally {
      setIsSyncing(false);
    }
  }, [plugin, isSyncing, setAllRems]);

  // Core Roam Action
  const handleRoam = useCallback(async () => {
    if (!plugin || isRoaming) return;
    setIsRoaming(true);

    try {
      let pool = allRems;
      if (!pool || pool.length === 0) {
        pool = await syncAllRemIds(plugin);
        await setAllRems(pool);
      }

      const result = await drawRandomCandidate(
        plugin,
        pool,
        blockedSet,
        { includeDocuments, autoBlockInvalid: true },
        40
      );

      // Batch commit any newly identified blocked/invalid IDs
      if (result.newBlockedIds.length > 0) {
        const merged = Array.from(new Set([...(blockSetArr || []), ...result.newBlockedIds]));
        await setBlockSetArr(merged);
      }

      if (result.remId) {
        const rem = await plugin.rem.findOne(result.remId);
        if (rem) {
          await plugin.window.openRem(rem);
          setCurrentRemId(rem._id);
          await setRoamCount((roamCount || 0) + 1);

          const nextRoamed = Array.from(new Set([...(roamedSetArr || []), rem._id]));
          await setRoamedSetArr(nextRoamed);
        }
      } else {
        await plugin.app.toast('No eligible Rem found. Updating pool cache...');
        await handleSyncPool();
      }
    } catch (err) {
      console.error('Error during roaming:', err);
      await plugin.app.toast('An error occurred while roaming.');
    } finally {
      setIsRoaming(false);
    }
  }, [
    plugin,
    isRoaming,
    allRems,
    blockedSet,
    includeDocuments,
    blockSetArr,
    roamCount,
    roamedSetArr,
    setBlockSetArr,
    setRoamCount,
    setRoamedSetArr,
    setAllRems,
    handleSyncPool,
  ]);

  // Handle Roam message broadcast from commands/hotkeys
  useOnMessageBroadcast((data: any) => {
    const msg = typeof data === 'object' && data !== null ? data.message : data;
    if (msg === 'roam') {
      handleRoam();
    }
  });

  // Block Current Rem
  const handleBlock = useCallback(async () => {
    if (currentRemId) {
      const nextBlocked = Array.from(new Set([...(blockSetArr || []), currentRemId]));
      await setBlockSetArr(nextBlocked);
      if (plugin) {
        await plugin.app.toast('Rem added to block list.');
      }
    }
    // Advance to next roam candidate immediately
    handleRoam();
  }, [currentRemId, blockSetArr, setBlockSetArr, plugin, handleRoam]);

  // Reset Statistics
  const handleResetConfirm = useCallback(async () => {
    setDialogOpen(false);
    await setRoamCount(0);
    await setRoamedSetArr([]);
    await setBlockSetArr([]);
    await setAllRems([]);
    setCurrentRemId('');
    if (plugin) {
      await plugin.app.toast('Roaming statistics successfully reset.');
    }
  }, [plugin, setRoamCount, setRoamedSetArr, setBlockSetArr, setAllRems]);

  // Render Simple View
  if (isSimpleView) {
    return (
      <div className="flex items-center gap-1 p-1">
        <button
          type="button"
          onClick={handleBlock}
          disabled={isRoaming}
          title="Block current rem and roam next"
          className={clsx(
            'px-2.5 py-1 text-xs font-semibold rounded-md border border-dashed transition-all active:scale-95',
            dark
              ? 'border-red-400/60 text-red-300 hover:bg-red-950/40'
              : 'border-red-400 text-red-600 hover:bg-red-50'
          )}
        >
          B
        </button>
        <button
          type="button"
          onClick={handleRoam}
          disabled={isRoaming}
          title="Roam to a random rem"
          className={clsx(
            'px-2.5 py-1 text-xs font-semibold rounded-md border border-dashed transition-all active:scale-95 flex items-center gap-1',
            dark
              ? 'border-indigo-400/60 text-indigo-300 hover:bg-indigo-950/40'
              : 'border-indigo-400 text-indigo-600 hover:bg-indigo-50',
            isRoaming && 'opacity-60 cursor-not-allowed'
          )}
        >
          {isRoaming ? (
            <svg
              className="animate-spin h-3.5 w-3.5 text-current"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
              />
            </svg>
          ) : (
            'R'
          )}
        </button>
      </div>
    );
  }

  // Render Full Dashboard View
  return (
    <div
      ref={containerRef}
      className={clsx(
        'w-full min-w-0 box-border overflow-hidden rounded-xl transition-all border shadow-sm',
        isNarrow ? 'p-2.5 gap-2 flex flex-col' : 'p-3 flex flex-col gap-2.5',
        dark
          ? 'bg-zinc-900/80 border-zinc-800 text-zinc-100'
          : 'bg-white/90 border-zinc-200/80 text-zinc-800'
      )}
    >
      {/* Reset Confirmation Dialog */}
      {dialogOpen && (
        <ConfirmDialog
          open={dialogOpen}
          onConfirm={handleResetConfirm}
          onClose={() => setDialogOpen(false)}
          dark={dark}
        />
      )}

      {/* Header / Stats Summary Bar */}
      <div className="flex items-center justify-between text-xs border-b pb-1.5 border-zinc-200/70 dark:border-zinc-800/70">
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          title="Reset statistics"
          className="p-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-red-500 dark:hover:text-red-400 transition-colors active:scale-95"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>

        {isNarrow ? (
          <span className="font-mono text-[10px] font-semibold tracking-wider text-indigo-600 dark:text-indigo-400 uppercase">
            {progress.currentTitle}
          </span>
        ) : (
          <div className="min-w-0 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 font-mono text-[10px] leading-tight">
            <span
              title="Blocked Rem count"
              className="text-red-600 dark:text-red-400 font-medium"
            >
              B:{blockSetArr?.length || 0}
            </span>
            <span
              title="Exp needed for next level"
              className="text-amber-600 dark:text-amber-400 font-medium"
            >
              N:{progress.expToNextLevel}
            </span>
            <span
              title="Current Level"
              className="text-yellow-600 dark:text-yellow-400 font-semibold"
            >
              L:{progress.currentLevel}
            </span>
            <span
              title="Total unique Rems roamed"
              className="text-emerald-600 dark:text-emerald-400 font-medium"
            >
              R:{roamedSetArr?.length || 0}
            </span>
            <span
              title="Total Rem count in pool"
              className="text-cyan-600 dark:text-cyan-400 font-medium"
            >
              T:{allRems?.length || 0}
            </span>
          </div>
        )}

        {/* Sync Pool Button */}
        <button
          type="button"
          onClick={handleSyncPool}
          disabled={isSyncing}
          title="Refresh / Sync Rem pool cache"
          className={clsx(
            'p-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors active:scale-95',
            isSyncing && 'cursor-not-allowed opacity-60'
          )}
        >
          <svg
            className={clsx('w-3.5 h-3.5', isSyncing && 'animate-spin text-indigo-600 dark:text-indigo-400')}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </button>
      </div>

      {/* Main Counter Display */}
      <div className="flex min-w-0 flex-col items-center justify-center my-0.5">
        <SAnimatedNumbers
          value={roamCount || 0}
          fontSize={isUltraNarrow ? 28 : isNarrow ? 36 : 52}
          dark={dark}
        />

        {/* Title & Level Info */}
        <div className="mt-1 flex flex-col items-center gap-1 w-full max-w-[140px]">
          {!isNarrow && (
            <div
              className={clsx(
                'font-mono text-xs font-bold tracking-wide uppercase px-2.5 py-0.5 rounded-full',
                dark
                  ? 'bg-indigo-950/70 text-indigo-300 border border-indigo-800/50'
                  : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
              )}
            >
              {progress.currentTitle}
            </div>
          )}

          {/* Level Progress Bar */}
          <div
            className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden"
            title={`${progress.progressPercent}% to next level`}
          >
            <div
              className="h-full bg-indigo-500 transition-all duration-500 rounded-full"
              style={{ width: `${progress.progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Narrow Minimalist Secondary Metrics */}
      {isNarrow && (
        <div className="grid grid-cols-2 gap-1 py-1 px-1.5 rounded-lg bg-zinc-100/60 dark:bg-zinc-800/40 text-[10px] font-mono text-zinc-600 dark:text-zinc-400 text-center">
          <div title="Current Level & Next Milestone">
            <span className="text-zinc-400 dark:text-zinc-500">Lv.</span>{progress.currentLevel}
            <span className="text-zinc-400 dark:text-zinc-500"> +{progress.expToNextLevel}</span>
          </div>
          <div title="Unique Rems roamed">
            <span className="text-zinc-400 dark:text-zinc-500">Roamed: </span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">{roamedSetArr?.length || 0}</span>
          </div>
        </div>
      )}

      {/* Action Controls */}
      <div className={clsx('flex min-w-0 pt-1', isNarrow ? 'flex-col gap-1.5' : 'items-center justify-between gap-2')}>
        {/* Primary Roam CTA */}
        <button
          type="button"
          onClick={handleRoam}
          disabled={isRoaming}
          className={clsx(
            'w-full py-2 px-3 text-xs font-semibold rounded-lg shadow-sm text-white transition-all active:scale-[0.98] flex items-center justify-center gap-1.5',
            dark
              ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-950/40'
              : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-100',
            isRoaming && 'opacity-70 cursor-not-allowed',
            !isNarrow && 'flex-[2]'
          )}
        >
          {isRoaming ? (
            <>
              <svg
                className="animate-spin h-3.5 w-3.5 text-white"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                />
              </svg>
              <span>Roam...</span>
            </>
          ) : (
            <>
              <svg
                className="w-3.5 h-3.5 shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span>Roam{isNarrow ? '' : ' Random'}</span>
            </>
          )}
        </button>

        {/* Secondary Block Action */}
        <button
          type="button"
          onClick={handleBlock}
          disabled={isRoaming || !currentRemId}
          title="Block current Rem from future roaming"
          className={clsx(
            'py-1.5 px-2 text-[11px] font-medium rounded-lg border border-dashed transition-all active:scale-[0.98] flex items-center justify-center gap-1',
            dark
              ? 'border-red-400/40 text-red-300 hover:bg-red-950/30'
              : 'border-red-400/60 text-red-600 hover:bg-red-50',
            (!currentRemId || isRoaming) && 'opacity-40 cursor-not-allowed',
            isNarrow ? 'w-full' : 'flex-1'
          )}
        >
          <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
            />
          </svg>
          <span>Block Rem</span>
        </button>
      </div>
    </div>
  );
}

renderWidget(RoamingWidget);
