import './styles/main.css';
import { AppStore } from './game/store.ts';
import { App, type Route } from './ui/app.ts';
import { toast } from './ui/components.ts';
import { Feedback } from './ui/feedback.ts';
import { applyTheme } from './ui/theme.ts';
import { dailyScreen } from './ui/screens/daily.ts';
import { homeScreen } from './ui/screens/home.ts';
import { controlsScreen, learnScreen, rulesScreen, techniqueScreen, techniquesScreen } from './ui/screens/learn.ts';
import { levelsScreen, stageScreen, stagesScreen } from './ui/screens/levels.ts';
import { playScreen } from './ui/screens/play.ts';
import { privacyScreen, settingsScreen } from './ui/screens/settings.ts';
import { statsScreen } from './ui/screens/stats.ts';
import { lessonScreen, tutorialListScreen } from './ui/screens/tutorial.ts';

const routes: Route[] = [
  { pattern: /^\/$/, screen: homeScreen },
  { pattern: /^\/levels$/, screen: levelsScreen },
  { pattern: /^\/level\/([a-z]+)$/, screen: stagesScreen },
  { pattern: /^\/level\/([a-z]+)\/(\d+)$/, screen: stageScreen },
  { pattern: /^\/play\/([a-z0-9-]+)$/, screen: playScreen },
  { pattern: /^\/daily$/, screen: dailyScreen },
  { pattern: /^\/stats$/, screen: statsScreen },
  { pattern: /^\/settings$/, screen: settingsScreen },
  { pattern: /^\/privacy$/, screen: privacyScreen },
  { pattern: /^\/learn$/, screen: learnScreen },
  { pattern: /^\/learn\/rules$/, screen: rulesScreen },
  { pattern: /^\/learn\/controls$/, screen: controlsScreen },
  { pattern: /^\/learn\/techniques$/, screen: techniquesScreen },
  { pattern: /^\/learn\/technique\/([a-zA-Z]+)$/, screen: techniqueScreen },
  { pattern: /^\/tutorial$/, screen: tutorialListScreen },
  { pattern: /^\/tutorial\/(\d+)$/, screen: lessonScreen },
];

const store = new AppStore();
applyTheme(store.settings);
store.subscribe(() => applyTheme(store.settings));

const app = new App(document.getElementById('app')!, routes, store, new Feedback(() => store.settings));
app.render();

// Errors stay on this device: they are shown to the player, never reported anywhere.
let lastErrorToast = 0;
const onError = (err: unknown) => {
  console.error(err);
  if (Date.now() - lastErrorToast > 5000) {
    lastErrorToast = Date.now();
    toast('Something went wrong, but your progress is saved.', { icon: 'info' });
  }
};
window.addEventListener('error', (e) => onError(e.error ?? e.message));
window.addEventListener('unhandledrejection', (e) => onError(e.reason));

// Offline support: cache the game's own files (production builds only).
if (import.meta.env.PROD && 'serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('Offline mode unavailable:', e));
  });
}
