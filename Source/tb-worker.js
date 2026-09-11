'use strict';
importScripts('vendor/xlsx.full.min.js');
self.onmessage=e=>{try{
 const book=XLSX.read(e.data,{type:'array',cellFormula:true,cellDates:false,sheetRows:5001});
 const sheets=book.SheetNames.map(name=>{const sheet=book.Sheets[name],ref=sheet['!fullref']||sheet['!ref'];if(ref){const range=XLSX.utils.decode_range(ref);if(range.e.r>=5000||range.e.c>=100)return {name,error:'This sheet exceeds 5,000 rows or 100 columns. Export just the trial balance range.'};}
  let formulas=0;for(const key of Object.keys(sheet)){if(key.startsWith('!'))continue;const c=sheet[key];if(c.f){formulas++;if(c.v===undefined||c.v===null){c.t='s';c.v='[Formula missing saved result]';}}}
  return {name,formulas,grid:XLSX.utils.sheet_to_json(sheet,{header:1,raw:true,defval:'',blankrows:true,range:0})};});
 self.postMessage({sheets});
 }catch(err){self.postMessage({error:'Cannot read this workbook. Use an unprotected Excel file or export as CSV. '+err.message});}};
