import type { Session } from './domain';
export type UpdateState = {
  status: 'idle'|'disabled'|'checking'|'latest'|'downloading'|'ready'|'installing'|'error';
  currentVersion: string; version: string|null; progress: number; message: string; notes: string;
};
declare global {
  interface Window { plset?: {
    load(): Promise<{state: Session|null; error: string|null}>;
    save(state: Session): Promise<boolean>;
    copyText(text: string): Promise<boolean>;
    openOutput(): Promise<void>;
    exportSession(): Promise<boolean>;
    exportText(name: string, text: string): Promise<boolean>;
    importSession(): Promise<Session|null>;
    onState(callback: (state: Session)=>void): ()=>void;
    updateStatus(): Promise<UpdateState>;
    checkUpdate(): Promise<UpdateState>;
    installUpdate(): Promise<boolean>;
    onUpdate(callback: (state: UpdateState)=>void): ()=>void;
    minimize(): void; maximize(): void; close(): void;
  } }
}
