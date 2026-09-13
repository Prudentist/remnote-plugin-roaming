import { AppEvents, declareIndexPlugin, ReactRNPlugin, WidgetLocation } from '@remnote/plugin-sdk';
import { DEFAULT_LEVELS_STRING } from '../services/levelService';
import '../style.css';
import '../App.css';

let sidebarObserver: MutationObserver | null = null;
const BUTTON_ELEMENT_ID = 'random-rem-global';

function cleanupSidebarButton() {
  if (sidebarObserver) {
    sidebarObserver.disconnect();
    sidebarObserver = null;
  }
  const existing = document.getElementById(BUTTON_ELEMENT_ID);
  if (existing) {
    existing.remove();
  }
}

function installSidebarButton(onRoamClick: () => void) {
  cleanupSidebarButton();

  const diceSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" style="width: 16px; height: 16px;">
    <path fill-rule="evenodd" d="M14 6a2.5 2.5 0 00-4-3 2.5 2.5 0 00-4 3H3.25C2.56 6 2 6.56 2 7.25v.5C2 8.44 2.56 9 3.25 9h6V6h1.5v3h6C17.44 9 18 8.44 18 7.75v-.5C18 6.56 17.44 6 16.75 6H14zm-1-1.5a1 1 0 01-1 1h-1v-1a1 1 0 112 0zm-6 0a1 1 0 001 1h1v-1a1 1 0 00-2 0z" clip-rule="evenodd" />
    <path d="M9.25 10.5H3v4.75A2.75 2.75 0 005.75 18h3.5v-7.5zM10.75 18v-7.5H17v4.75A2.75 2.75 0 0114.25 18h-3.5z" />
  </svg>`;

  const tryInsert = (): boolean => {
    if (document.getElementById(BUTTON_ELEMENT_ID)) {
      return true;
    }

    // Target header action container in sidebar
    const targetParent =
      document.querySelector(
        '#document-sidebar > div.shrink-0.w-full > div.flex.items-center.p-2.gap-2 > div.flex.items-center.justify-center'
      )?.parentElement ||
      document.querySelector('#document-sidebar [data-testid="sidebar-header-actions"]') ||
      document.querySelector('#document-sidebar .flex.items-center.p-2.gap-2');

    if (targetParent) {
      const btn = document.createElement('div');
      btn.id = BUTTON_ELEMENT_ID;
      btn.title = 'Roam to random Rem (Ctrl+Alt+.)';
      btn.className =
        'flex items-center justify-center rn-clr-background-secondary shrink-0 w-6 h-6 rounded-md rn-clr-content-secondary cursor-pointer hover:rn-clr-background--hovered hover:font-semibold transition-colors';
      btn.innerHTML = diceSvg;
      btn.addEventListener('click', onRoamClick);
      targetParent.appendChild(btn);
      return true;
    }

    return false;
  };

  if (!tryInsert()) {
    // Retry on DOM updates until the sidebar is mounted
    sidebarObserver = new MutationObserver(() => {
      if (tryInsert() && sidebarObserver) {
        sidebarObserver.disconnect();
        sidebarObserver = null;
      }
    });
    sidebarObserver.observe(document.body, { childList: true, subtree: true });
  }
}

async function onActivate(plugin: ReactRNPlugin) {
  const triggerRoam = () => {
    plugin.messaging.broadcast('roam');
  };

  async function registerRoamCommand(shortcut: string) {
    await plugin.app.registerCommand({
      id: 'roaming',
      name: 'Roam to Random Rem',
      keyboardShortcut: shortcut,
      action: () => {
        triggerRoam();
      },
    });
  }

  // Register main Roaming Widget in SidebarEnd
  await plugin.app.registerWidget('roaming_widget', WidgetLocation.SidebarEnd, {
    dimensions: { height: 'auto', width: '100%' },
  });

  // Settings: Shortcut
  await plugin.settings.registerStringSetting({
    id: 'roaming_shortcut',
    title: 'Roaming Keyboard Shortcut',
    description: 'Key combination to quickly jump to a random Rem.',
    defaultValue: 'ctrl+alt+.',
  });

  // Settings: Simple view mode
  await plugin.settings.registerBooleanSetting({
    id: 'roaming_mode',
    title: 'Simplified Widget View',
    description: 'Toggle between minimal buttons and full statistics dashboard.',
    defaultValue: false,
  });

  // Settings: Include documents
  await plugin.settings.registerBooleanSetting({
    id: 'include_documents',
    title: 'Include Documents in Roaming Pool',
    description: 'When enabled, top-level documents will also be candidates for roaming.',
    defaultValue: false,
  });

  // Settings: Custom Levels
  await plugin.settings.registerStringSetting({
    id: 'level_custom',
    title: 'Custom Level Configuration',
    description: 'Define your experience curve in format "<threshold>::<Title>" per line.',
    defaultValue: DEFAULT_LEVELS_STRING,
    multiline: true,
  });

  // Initial command registration
  const currentShortcut =
    ((await plugin.settings.getSetting('roaming_shortcut')) as string) || 'ctrl+alt+.';
  await registerRoamCommand(currentShortcut);

  // Dynamic setting change listener
  plugin.event.addListener(AppEvents.SettingChanged, 'roaming_shortcut', async ({ value }) => {
    if (typeof value === 'string') {
      await registerRoamCommand(value);
    }
  });

  // Safely mount sidebar quick button if in native DOM mode
  if (typeof document !== 'undefined') {
    installSidebarButton(triggerRoam);
  }
}

async function onDeactivate(_plugin: ReactRNPlugin) {
  cleanupSidebarButton();
}

declareIndexPlugin(onActivate, onDeactivate);
