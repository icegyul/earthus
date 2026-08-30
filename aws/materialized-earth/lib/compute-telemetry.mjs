const PII_FIELDS = new Set([
  'userId', 'email', 'preciseLocation', 'privateRoute', 'savedPlaces',
  'prompt', 'token', 'secret', 'authorization',
]);

function findPii(value) {
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (const child of value) {
      const found = findPii(child);
      if (found) return found;
    }
    return null;
  }
  for (const [key, child] of Object.entries(value)) {
    if (PII_FIELDS.has(key)) return key;
    const found = findPii(child);
    if (found) return found;
  }
  return null;
}

export class ComputeTelemetry {
  #events = [];
  #dropped = 0;
  constructor({ maxEvents = 1000 } = {}) { this.maxEvents = maxEvents; }

  emit(eventName, fields = {}) {
    const pii = findPii(fields);
    if (pii) throw new Error(`TELEMETRY_PII_FIELD:${pii}`);
    if (this.#events.length >= this.maxEvents) {
      this.#dropped += 1;
      return false;
    }
    this.#events.push(Object.freeze({ eventName, ...fields }));
    return true;
  }

  summary() {
    const leaders = this.#events.filter(event => event.eventName === 'compute.singleflight_leader').length;
    const followers = this.#events.filter(event => event.eventName === 'compute.singleflight_follower').length;
    const executions = this.#events.filter(event => event.eventName === 'compute.execute_end').length + leaders;
    return Object.freeze({ events: this.#events.length, dropped: this.#dropped, leaders, followers, executions });
  }

  events() { return Object.freeze([...this.#events]); }
}
