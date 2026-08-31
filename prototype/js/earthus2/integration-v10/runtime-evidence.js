export class RuntimeEvidenceRecorder {
  #events = [];
  #max;
  constructor({max=250}={}){this.#max=max;}
  record(type, detail={}){
    this.#events.push(Object.freeze({at:new Date().toISOString(), type, detail:structuredClone(detail)}));
    if(this.#events.length>this.#max)this.#events.splice(0,this.#events.length-this.#max);
  }
  snapshot(){return Object.freeze({count:this.#events.length, events:this.#events.map(x=>structuredClone(x))});}
  clear(){this.#events.length=0;}
}
