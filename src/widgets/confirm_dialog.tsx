import React, { useEffect } from 'react';
import clsx from 'clsx';

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  dark?: boolean;
  title?: string;
  message?: string;
}

export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  dark = false,
  title = 'Reset Statistics',
  message = 'Are you sure you want to reset your roaming statistics? This action cannot be undone.',
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="p-3 w-full rounded-lg border border-red-200 dark:border-red-900/50 bg-white dark:bg-gray-800 shadow-lg text-center"
    >
      <div className="flex flex-col items-center">
        <div className="p-2 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full mb-2">
          <svg
            aria-hidden="true"
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>

        <h3 className={clsx('text-sm font-semibold mb-1', dark ? 'text-gray-100' : 'text-gray-800')}>
          {title}
        </h3>
        <p className={clsx('text-xs mb-3', dark ? 'text-gray-400' : 'text-gray-500')}>
          {message}
        </p>

        <div className="flex justify-center gap-2 w-full">
          <button
            type="button"
            onClick={onConfirm}
            className="px-3 py-1.5 text-xs font-medium rounded-md text-white bg-red-600 hover:bg-red-700 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            Yes, Reset
          </button>
          <button
            type="button"
            onClick={onClose}
            className={clsx(
              'px-3 py-1.5 text-xs font-medium rounded-md border transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400',
              dark
                ? 'bg-gray-700 text-gray-200 border-gray-600 hover:bg-gray-600'
                : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200'
            )}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}