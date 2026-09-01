-- Preserve each source snapshot as a distinct orbit-solution version.
-- A new raw artifact must never overwrite an earlier scientific result merely
-- because both provider responses share the same OMM epoch.
ALTER TABLE orbit_solution
  DROP CONSTRAINT IF EXISTS orbit_solution_object_id_source_id_epoch_format_key;

ALTER TABLE orbit_solution
  ADD CONSTRAINT orbit_solution_versioned_source_artifact_key
  UNIQUE (object_id, source_id, source_artifact_id, epoch, format);
