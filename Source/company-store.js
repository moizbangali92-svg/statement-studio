(function(root){
'use strict';
const prefix='hoistx-company-',indexKey='hoistx-companies-v1';let active='',blocked=false;
function list(){const v=JSON.parse(localStorage.getItem(indexKey)||'[]');if(!Array.isArray(v))throw Error('Invalid company directory');return v;}
function key(id=active){return prefix+id;}
function init(){let entries=list();if(!entries.length){const id=crypto.randomUUID(),raw=localStorage.getItem('hoistx-statement-builder-v1');const s=raw?StatementEngine.validate(JSON.parse(raw)):StatementEngine.fresh(false);localStorage.setItem(key(id),JSON.stringify(s));entries=[{id,name:s.company.name||'Untitled company',end:s.company.end}];localStorage.setItem(indexKey,JSON.stringify(entries));const undo=localStorage.getItem('hoistx-before-tb-v1');if(undo)localStorage.setItem(key(id)+'-undo',undo);}let preferred='';try{preferred=sessionStorage.getItem('hoistx-active-company');}catch{}active=entries.some(x=>x.id===preferred)?preferred:entries[0].id;return localStorage.getItem(key());}
function select(id){if(!list().some(x=>x.id===id))throw Error('Company not found');const s=StatementEngine.validate(JSON.parse(localStorage.getItem(key(id))));active=id;blocked=false;try{sessionStorage.setItem('hoistx-active-company',id);}catch{}return s;}
function write(s){if(blocked)throw Error('This company was updated in another tab. Reload before editing.');localStorage.setItem(key(),JSON.stringify(s));const entries=list(),entry=entries.find(x=>x.id===active);if(entry){entry.name=s.company.name||'Untitled company';entry.end=s.company.end;localStorage.setItem(indexKey,JSON.stringify(entries));}}
function create(name){const s=StatementEngine.fresh(false);s.company.name=name;const id=crypto.randomUUID(),entries=list();localStorage.setItem(key(id),JSON.stringify(s));entries.push({id,name,end:s.company.end});localStorage.setItem(indexKey,JSON.stringify(entries));return select(id);}
function external(k){if(k===key())blocked=true;}
root.CompanyStore={init,list,select,write,create,key,external,get active(){return active;},get blocked(){return blocked;}};
})(globalThis);
