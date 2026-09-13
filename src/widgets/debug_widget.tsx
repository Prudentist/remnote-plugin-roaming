import React, { useState } from 'react';
import {
  AppEvents,
  RemViewer,
  renderWidget,
  RichTextInterface,
  useAPIEventListener,
  useOnMessageBroadcast,
  usePlugin,
} from '@remnote/plugin-sdk';

function richText2log(text?: RichTextInterface) {
  if (!text) return 'empty';
  const values = Array.from(text.values());
  return values
    .map((item) => {
      switch (item.i) {
        case undefined:
          return String(item);
        case 's':
          return `(s, ${item.delimiterCharacterForSerialization})`;
        case 'm':
        case 'n':
        case 'x':
          return `(${item.i}, ${item.text})`;
        default:
          return `(${item.i},)`;
      }
    })
    .join(' | ');
}

export function DebugWidget() {
  const [remId, setRemId] = useState<string>('');
  const [logs, setLogs] = useState<string[]>([]);
  const [info, setInfo] = useState<Map<string, any>>(new Map());
  const plugin = usePlugin();

  useOnMessageBroadcast('log', (message) => {
    if (typeof message === 'string') {
      setLogs((prev) => [...prev, message]);
    }
  });

  useAPIEventListener(AppEvents.FocusedRemChange, undefined, async (args) => {
    const nextRemId = args.nextRemId;
    setRemId(nextRemId);

    const rem = await plugin.rem.findOne(nextRemId);
    const newInfo = new Map<string, any>();
    if (rem) {
      newInfo.set('isPowerupEnum', await rem.isPowerupEnum());
      newInfo.set('isPowerupProperty', await rem.isPowerupProperty());
      newInfo.set('isPowerup', await rem.isPowerup());
      newInfo.set('isPowerupPropertyListItem', await rem.isPowerupPropertyListItem());
      newInfo.set('isPowerupSlot', await rem.isPowerupSlot());
      newInfo.set('isSlot', await rem.isSlot());
      newInfo.set('isDocument', await rem.isDocument());

      const parent = await rem.getParentRem();
      newInfo.set('parent-isPowerupSlot', await parent?.isPowerupSlot());
      newInfo.set('hasPowerup:f', await rem.hasPowerup('f'));
      newInfo.set('hasPowerup:z', await rem.hasPowerup('z'));
      newInfo.set('hasPowerup:b', await rem.hasPowerup('b'));
      newInfo.set('parent-hasPowerup:f', await parent?.hasPowerup('f'));
      newInfo.set('parent-hasPowerup:z', await parent?.hasPowerup('z'));

      const grandParent = await parent?.getParentRem();
      newInfo.set('parent-parent-hasPowerup:f', await grandParent?.hasPowerup('f'));

      newInfo.set('richtext', richText2log(rem.text));
    }
    setInfo(newInfo);
  });

  return (
    <div className="flex flex-col p-2 text-xs font-mono">
      {remId && <RemViewer remId={remId} width="100%" />}
      {info.size > 0 && (
        <ul className="mt-2 space-y-1">
          {Array.from(info.entries()).map(([key, val], i) => (
            <li key={i} className="border-b py-0.5">
              <span className="font-semibold">{key}</span>: {JSON.stringify(val)}
            </li>
          ))}
        </ul>
      )}
      {logs.length > 0 && (
        <div className="mt-3">
          <div className="font-bold">Logs:</div>
          <ul className="space-y-0.5">
            {logs.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

renderWidget(DebugWidget);
