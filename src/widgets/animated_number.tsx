import React from 'react';
import { Transition, animated } from 'react-spring';
import clsx from 'clsx';

const separators = [',', '.'];

interface AnimatedItem {
  value: string;
  x: number;
  y: number;
  key: string;
}

export interface SAnimatedNumbersProps {
  value: number | string;
  fontSize?: number;
  dark?: boolean;
}

/**
 * Renders an animated JS locale formatted number string
 */
export function SAnimatedNumbers({ value, fontSize = 48, dark = false }: SAnimatedNumbersProps) {
  const numValue = typeof value === 'number' ? value : Number.parseInt(String(value), 10) || 0;
  const valueStr = numValue.toLocaleString();
  const valueStrArray = valueStr.split('');

  // Give every character an explicit box. The previous fixed offset was
  // narrower than the rendered monospace glyphs, which made two-digit values
  // overlap in the sidebar.
  const fontWidth = fontSize * 0.62;
  const separatorWidth = fontSize * 0.36;

  const { items, totalWidth } = valueStrArray.reduce(
    (acc, val, i) => {
      const precedingItem: AnimatedItem | undefined = acc.items[i - 1];
      const currentItem: AnimatedItem = {
        value: val,
        x: 0,
        y: fontSize,
        key: `${i}-${val}`,
      };

      if (precedingItem) {
        currentItem.x = precedingItem.x +
          (separators.includes(precedingItem.value) ? separatorWidth : fontWidth);
      }

      acc.items.push(currentItem);
      acc.totalWidth = Math.max(
        acc.totalWidth,
        currentItem.x + (separators.includes(val) ? separatorWidth : fontWidth)
      );

      return acc;
    },
    {
      items: [] as AnimatedItem[],
      totalWidth: 0,
    }
  );

  const springConfig = { mass: 2, tension: 180, friction: 14 };

  return (
    <div className="w-full flex justify-center py-1">
      <div
        style={{ width: Math.max(totalWidth, fontWidth), height: fontSize * 1.2 }}
        className={clsx(
          'relative flex items-center justify-center font-mono font-bold tracking-tight',
          dark ? 'text-indigo-300' : 'text-indigo-600'
        )}
      >
        <Transition
          items={items}
          keys={(item: AnimatedItem) => item.key}
          from={({ y }) => ({ y: -y * 0.7, opacity: 0 })}
          enter={({ x }) => ({ y: 0, x, opacity: 1 })}
          config={springConfig}
          trail={30}
        >
          {({ opacity, x, y }, item: AnimatedItem) => (
            <animated.span
              className="absolute left-0"
              style={{
                opacity,
                width: separators.includes(item.value) ? separatorWidth : fontWidth,
                textAlign: 'center',
                fontSize,
                transform: `translate3d(${x}px, ${y}px, 0px)`,
              }}
            >
              {item.value}
            </animated.span>
          )}
        </Transition>
      </div>
    </div>
  );
}
