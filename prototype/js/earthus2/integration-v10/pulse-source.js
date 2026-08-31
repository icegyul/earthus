function asArray(payload){
  if(Array.isArray(payload)) return payload;
  for(const key of ['items','events','news','articles','features']) if(Array.isArray(payload?.[key])) return payload[key];
  return [];
}
function finite(value){const n=Number(value);return Number.isFinite(n)?n:null;}
function text(row, keys){for(const key of keys){const v=row?.[key];if(typeof v==='string'&&v.trim())return v.trim();}return null;}

// No schema guessing beyond safe aliases. Missing values stay null; no geocoding and no fake coordinates.
export async function fetchPulseNews({url='/events/regional-news.json', signal, fetchImpl=fetch}={}){
  const response=await fetchImpl(url,{signal,cache:'no-store'});
  if(!response.ok) throw new Error(`pulse news HTTP ${response.status}`);
  const payload=await response.json();
  const rows=asArray(payload);
  const items=rows.map((row,index)=>{
    const lat=finite(row?.lat ?? row?.latitude ?? row?.geometry?.coordinates?.[1]);
    const lon=finite(row?.lon ?? row?.lng ?? row?.longitude ?? row?.geometry?.coordinates?.[0]);
    return Object.freeze({
      id:text(row,['id','guid','link','url']) ?? `row-${index}`,
      title:text(row,['title','headline','name']),
      source:text(row,['source','publisher','agency']),
      publishedAt:text(row,['publishedAt','published_at','pubDate','date','time']),
      url:text(row,['url','link']),
      region:text(row,['region','location','area','country']),
      lat, lon,
      mappable:lat!==null&&lon!==null,
    });
  }).filter(item=>item.title);
  return Object.freeze({url, count:items.length, items, schemaRecognized:rows.length>0 || Array.isArray(payload)});
}
