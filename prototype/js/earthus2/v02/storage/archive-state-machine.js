import { ARCHIVE_STATE } from '../core/constants.js';

const TRANSITIONS = Object.freeze({
  [ARCHIVE_STATE.HOT]: new Set([ARCHIVE_STATE.PACKING]),
  [ARCHIVE_STATE.PACKING]: new Set([ARCHIVE_STATE.COPY_PENDING, ARCHIVE_STATE.COPY_FAILED]),
  [ARCHIVE_STATE.COPY_PENDING]: new Set([ARCHIVE_STATE.COPYING, ARCHIVE_STATE.NAS_UNAVAILABLE]),
  [ARCHIVE_STATE.COPYING]: new Set([ARCHIVE_STATE.VERIFYING, ARCHIVE_STATE.COPY_FAILED, ARCHIVE_STATE.NAS_UNAVAILABLE]),
  [ARCHIVE_STATE.VERIFYING]: new Set([ARCHIVE_STATE.NAS_VERIFIED, ARCHIVE_STATE.CHECKSUM_FAILED, ARCHIVE_STATE.MANIFEST_MISMATCH]),
  [ARCHIVE_STATE.NAS_VERIFIED]: new Set([ARCHIVE_STATE.SNAPSHOT_VERIFIED, ARCHIVE_STATE.SNAPSHOT_FAILED]),
  [ARCHIVE_STATE.SNAPSHOT_VERIFIED]: new Set([ARCHIVE_STATE.GRACE_PERIOD]),
  [ARCHIVE_STATE.GRACE_PERIOD]: new Set([ARCHIVE_STATE.DELETE_ELIGIBLE, ARCHIVE_STATE.DELETE_BLOCKED]),
  [ARCHIVE_STATE.DELETE_ELIGIBLE]: new Set([ARCHIVE_STATE.COLD_ARCHIVED]),
  [ARCHIVE_STATE.COLD_ARCHIVED]: new Set([ARCHIVE_STATE.RESTORE_PENDING]),
  [ARCHIVE_STATE.RESTORE_PENDING]: new Set([ARCHIVE_STATE.RESTORING, ARCHIVE_STATE.NAS_UNAVAILABLE]),
  [ARCHIVE_STATE.RESTORING]: new Set([ARCHIVE_STATE.RESTORED_HOT, ARCHIVE_STATE.RESTORE_FAILED, ARCHIVE_STATE.NAS_UNAVAILABLE]),
  [ARCHIVE_STATE.RESTORED_HOT]: new Set([ARCHIVE_STATE.COLD_ARCHIVED]),
  [ARCHIVE_STATE.NAS_UNAVAILABLE]: new Set([ARCHIVE_STATE.COPY_PENDING, ARCHIVE_STATE.RESTORE_PENDING]),
  [ARCHIVE_STATE.COPY_FAILED]: new Set([ARCHIVE_STATE.COPY_PENDING]),
  [ARCHIVE_STATE.CHECKSUM_FAILED]: new Set([ARCHIVE_STATE.COPY_PENDING]),
  [ARCHIVE_STATE.MANIFEST_MISMATCH]: new Set([ARCHIVE_STATE.PACKING]),
  [ARCHIVE_STATE.SNAPSHOT_FAILED]: new Set([ARCHIVE_STATE.NAS_VERIFIED]),
  [ARCHIVE_STATE.DELETE_BLOCKED]: new Set([ARCHIVE_STATE.GRACE_PERIOD]),
  [ARCHIVE_STATE.RESTORE_FAILED]: new Set([ARCHIVE_STATE.RESTORE_PENDING]),
});

export class ArchiveStateMachine {
  #state;
  #history;

  constructor({ archiveId, state = ARCHIVE_STATE.HOT }) {
    if (!archiveId) throw new TypeError('archiveId is required');
    this.archiveId = archiveId;
    this.#state = state;
    this.#history = [{ state, at: new Date().toISOString(), reason: 'INITIAL' }];
  }

  get state() { return this.#state; }

  transition(nextState, { reason = 'UNSPECIFIED', evidence = null } = {}) {
    if (!TRANSITIONS[this.#state]?.has(nextState)) throw new Error(`invalid archive transition: ${this.#state} -> ${nextState}`);
    this.#state = nextState;
    this.#history.push({ state: nextState, at: new Date().toISOString(), reason, evidence: evidence ? structuredClone(evidence) : null });
    return this.snapshot();
  }

  snapshot() {
    return Object.freeze({ archiveId: this.archiveId, state: this.#state, history: Object.freeze(structuredClone(this.#history)) });
  }
}
