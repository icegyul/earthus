export class ArchiveCatalog {
  #rows=new Map();
  register(row){ if(!row?.archiveId||!row?.datasetId||!row?.region||!row?.startAt||!row?.endAt) throw new TypeError('archive catalog row incomplete'); this.#rows.set(row.archiveId,{...structuredClone(row),restoreCount:row.restoreCount??0}); return this.get(row.archiveId); }
  get(id){const r=this.#rows.get(id);return r?structuredClone(r):null;}
  find({datasetId=null,region=null,at=null}={}){const t=at?Date.parse(at):null;return [...this.#rows.values()].filter(r=>(!datasetId||r.datasetId===datasetId)&&(!region||r.region===region)&&(!Number.isFinite(t)||(Date.parse(r.startAt)<=t&&t<=Date.parse(r.endAt)))).map(x=>structuredClone(x));}
  markRestored(id,at=new Date().toISOString()){const r=this.#rows.get(id);if(!r)throw new Error('unknown archive');r.restoreCount=(r.restoreCount??0)+1;r.lastRestoreAt=at;return this.get(id);}
}
