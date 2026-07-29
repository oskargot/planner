import { useSyncStatus } from '../db/sync.js';

// Quiet corner indicator (§3): synced / syncing / offline. Never a modal.
export default function SyncDot() {
  const status = useSyncStatus();
  const cls = status === 'error' ? 'offline' : status;
  const label = { synced: 'Synced', syncing: 'Syncing…', offline: 'Offline', error: 'Offline', idle: '' }[status] || '';
  return <div className={`sync-dot ${cls}`} title={label} aria-label={label} />;
}
