// The Windows app exposes a small bridge (desktop/src-tauri/src/init.js). In
// the web version it doesn't exist, so everything here is null and nothing changes.

export interface UpdateCheck {
  status: 'latest' | 'available' | 'unsupported';
  current: string;
  version?: string;
  portable?: boolean;
}

export interface DesktopBridge {
  info(): Promise<{ version: string; portable: boolean; packaged: boolean } | null>;
  checkForUpdate(): Promise<UpdateCheck>;
  /** Downloads the update and verifies its signature. */
  downloadUpdate(): Promise<{ status: 'ready'; verified?: boolean }>;
  installUpdate(): Promise<void>;
  openReleasesPage(): Promise<void>;
  onProgress(callback: (percent: number) => void): () => void;
  /** Switches full screen on or off; resolves to the new state. */
  toggleFullscreen(): Promise<boolean>;
  isFullscreen(): Promise<boolean>;
  /** Opacity of the whole window, 0.4–1 (1 = normal). */
  setWindowOpacity(opacity: number): Promise<void>;
}

export const desktop: DesktopBridge | null = (globalThis as { sudokuDesktop?: DesktopBridge }).sudokuDesktop ?? null;
