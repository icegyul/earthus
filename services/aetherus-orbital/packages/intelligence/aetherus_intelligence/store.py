from collections import defaultdict
from aetherus_domain.models import IntelligenceEvent, EventRevision

class InMemoryIntelligenceStore:
    def __init__(self):
        self.events_by_key:dict[str,IntelligenceEvent]={}
        self.revisions:dict[str,list[EventRevision]]=defaultdict(list)
    def get_event_by_key(self,key:str): return self.events_by_key.get(key)
    def save_event(self,event:IntelligenceEvent): self.events_by_key[event.canonical_key]=event
    def append_revision(self,revision:EventRevision): self.revisions[str(revision.event_id)].append(revision)
    def revisions_for(self,event_id): return list(self.revisions[str(event_id)])
