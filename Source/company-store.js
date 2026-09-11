(function(root){
'use strict';
// Backed by StoreBackend (localStorage in the browser, JSON files on desktop).
// The company directory is derived from the backing store on every call, so
// there is no index to keep in step with the company records themselves.
const B=root.StoreBackend;let active='',blocked=false;
const label=c=>({id:c.id,name:c.name||'Untitled company',end:c.end,corrupt:c.corrupt,error:c.error});
function list(){return B.list().map(label);}
function key(id=active){return B.storageKeyFor(id);}
function init(){
 let entries=B.list();
 if(!entries.length){
  // First run, or a browser profile still holding the pre-multi-company blob.
  const id=crypto.randomUUID(),raw=B.legacy.get(B.legacy.state);
  const s=raw?StatementEngine.validate(JSON.parse(raw)):StatementEngine.fresh(false);
  B.write(id,JSON.stringify(s));
  const undo=B.legacy.get(B.legacy.undo);if(undo)B.writeUndo(id,undo);
  entries=B.list();
 }
 let preferred='';try{preferred=sessionStorage.getItem('hoistx-active-company');}catch{}
 const usable=entries.filter(c=>!c.corrupt);
 active=(entries.some(x=>x.id===preferred)?preferred:(usable[0]||entries[0]).id);
 return B.read(active);
}
function select(id){
 const entry=B.list().find(x=>x.id===id);
 if(!entry)throw Error('Company not found');
 if(entry.corrupt)throw Error('This company file is damaged and cannot be opened. Export or delete it, then restore from a backup.');
 const s=StatementEngine.validate(JSON.parse(B.read(id)));
 active=id;blocked=false;
 try{sessionStorage.setItem('hoistx-active-company',id);}catch{}
 return s;
}
function write(s){
 if(blocked)throw Error('This company was updated in another tab. Reload before editing.');
 B.write(active,JSON.stringify(s));
}
function create(name){
 const s=StatementEngine.fresh(false);s.company.name=name;
 const id=crypto.randomUUID();
 B.write(id,JSON.stringify(s));
 return select(id);
}
// Deleting the active company leaves nothing selected; the caller returns home.
async function remove(id){await B.remove(id);if(id===active)active='';return true;}
function external(k){if(k===key())blocked=true;}
root.CompanyStore={init,list,select,write,create,remove,key,external,
 get active(){return active;},get blocked(){return blocked;}};
})(globalThis);
