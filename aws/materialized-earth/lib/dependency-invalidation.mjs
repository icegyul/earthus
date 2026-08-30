export class DependencyIndex {
  #dependencies = new Map();
  #audit = [];

  register(artifactKey, dependencyKeys) {
    if (!artifactKey || !Array.isArray(dependencyKeys)) {
      throw new Error('DEPENDENCY_REGISTRATION_INVALID');
    }
    for (const dependencyKey of dependencyKeys) {
      const dependents = this.#dependencies.get(dependencyKey) || new Set();
      dependents.add(artifactKey);
      this.#dependencies.set(dependencyKey, dependents);
    }
  }

  invalidate({ dependencyKey, oldRevision, newRevision, reason = 'REVISION_CHANGED' } = {}) {
    if (!dependencyKey) throw new Error('INVALIDATION_DEPENDENCY_REQUIRED');
    if (oldRevision === newRevision) {
      return Object.freeze({ dependencyKey, affectedArtifactKeys: Object.freeze([]), fanout: 0, noOp: true });
    }
    const affectedArtifactKeys = [...(this.#dependencies.get(dependencyKey) || [])].sort();
    const event = Object.freeze({
      dependencyKey, oldRevision, newRevision, reason,
      affectedArtifactKeys: Object.freeze(affectedArtifactKeys),
      fanout: affectedArtifactKeys.length,
      noOp: false,
    });
    this.#audit.push(event);
    return event;
  }

  audit() { return Object.freeze([...this.#audit]); }
}
