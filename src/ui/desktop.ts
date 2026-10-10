// The Windows app exposes a small bridge (desktop/preload.cjs). In the web
// version it doesn't exist, so everything here is null and nothing changes.

export interface UpdateCheck {
  status: 'latest' | 'available' | 'unsupported';
  current: string;
  version?: string;
  portable?: boolean;
}

export interface DesktopBridge {
  info(): Promise<{ version: string; portable: boolean; packaged: boolean } | null>;
  checkForUpdate(): Promise<UpdateCheck>;
  downloadUpdate(): Promise<{ status: 'ready' }>;
  installUpdate(): Promise<void>;
  openReleasesPage(): Promise<void>;
  onProgress(callback: (percent: number) => void): () => void;
}

export const desktop: DesktopBridge | null = (globalThis as { sudokuDesktop?: DesktopBridge }).sudokuDesktop ?? null;
