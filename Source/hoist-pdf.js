(function(root){
'use strict';
async function create(state){const L=root.PDFLib||(typeof require==='function'?require('./vendor/pdf-lib.min.js'):null),R=root.HoistReport||(typeof require==='function'?require('./hoist-report.js'):null),model=R.build(state),pdf=await L.PDFDocument.create();pdf.setTitle(model.company+' - Financial statements');pdf.setAuthor(model.company);pdf.setSubject('Management-prepared financial statements - Hoistx 2024 layout');pdf.registerFontkit(root.fontkit||(typeof require==='function'?require('./vendor/fontkit.min.js'):null));if(!root.ReportFonts&&typeof require==='function')require('./report-fonts.js');const regular=await pdf.embedFont(root.ReportFonts.regular,{subset:true}),bold=await pdf.embedFont(root.ReportFonts.bold,{subset:true}),W=595.28,H=841.89,left=56,right=539,bottom=64,top=114;let page,y,sectionTitle='',pendingHeading='',toc=[],noteStart=0,noteEnd=0;
 const clean=s=>String(s??'').replace(/\r/g,'').replace(/[\u2011\u2010]/g,'-').replace(/\t/g,'    ');
 const width=(text,font,size)=>{try{return font.widthOfTextAtSize(text,size);}catch{throw Error('This English PDF template needs Latin-script text. Use an English transliteration for characters not supported by the report font.');}};
 function wrap(text,max,font=regular,size=10){const lines=[];for(const para of clean(text).split('\n')){if(!para){lines.push('');continue;}let line='';for(const word of para.split(/\s+/)){if(width((line?line+' ':'')+word,font,size)<=max){line+=(line?' ':'')+word;continue;}if(line){lines.push(line);line='';}if(width(word,font,size)>max){let chunk='';for(const ch of word){if(width(chunk+ch,font,size)>max){lines.push(chunk);chunk='';}chunk+=ch;}line=chunk;}else line=word;}lines.push(line);}return lines;}
 function draw(text,x,at,size=10,font=regular){page.drawText(clean(text),{x,y:at,size,font,color:L.rgb(0,0,0)});}
 function newPage(continued=false){page=pdf.addPage([W,H]);y=H-top;const names=wrap(model.company,right-left-95,bold,10);names.slice(0,3).forEach((line,i)=>draw(line,left,H-48-i*12,10,bold));draw(model.ready?'UNAUDITED':'INCOMPLETE DRAFT',right-91,H-48,7);const titles=wrap(sectionTitle+(continued?' (continued)':''),right-left,bold,10);let at=H-83;titles.forEach(line=>{draw(line,left,at,10,bold);at-=12;});page.drawLine({start:{x:left,y:at-3},end:{x:right,y:at-3},thickness:.7});y=at-20;}
 function need(height){if(y-height<bottom)newPage(true);}
 function para(text,{font=regular,size=10,after=7}={}){const lines=wrap(text,right-left,font,size),height=size*1.22;for(let i=0;i<lines.length;i++){need(height);draw(lines[i],left,y,size,font);y-=height;}y-=after;}
 function heading(text){need(52);para(text,{font:bold,size:10,after:5});}
 function table(block){const count=block.headers.length;if(!count)return;let widths=block.widths?block.widths.map(x=>x*(right-left)):null;if(!widths){const first=count<=3?.60:count===4?.49:.39;let remainder=1-first;if(block.headers[1]==='Note'){widths=[(right-left)*first,28,...Array(count-2).fill(((right-left)*remainder-28)/(count-2))];}else widths=[(right-left)*first,...Array(count-1).fill((right-left)*remainder/(count-1))];}
 const size=count>=6?8:9,lh=size*1.2,pad=3;
 function measured(cells,font){return cells.map((text,i)=>wrap(text,Math.max(widths[i]-2*pad,10),font,size));}
 const headers=measured(block.headers,bold);const headerH=Math.max(...headers.map(x=>x.length))*lh+12;
 function cells(lines,height,font,isHeader=false,offset=0,take=Infinity){let x=left;for(let i=0;i<count;i++){const a=lines[i].slice(offset,offset+take);for(let j=0;j<a.length;j++){const line=a[j],numeric=i>0&&!isHeader;const px=numeric?x+widths[i]-pad-width(line,font,size):x+pad;draw(line,px,y-pad-size-j*lh,size,font);}x+=widths[i];}y-=height;}
 function header(){need(headerH+20);cells(headers,headerH,bold,true);page.drawLine({start:{x:left,y:y+2},end:{x:right,y:y+2},thickness:.6});}
 const fullHeight=headerH+block.rows.reduce((n,row)=>n+Math.max(...measured(row.cells,row.total||row.heading?bold:regular).map(a=>a.length),1)*lh+6+(row.total?4:0),0)+14;
 if(fullHeight<450)need(fullHeight+(pendingHeading?35:0));
 if(pendingHeading){heading(pendingHeading);pendingHeading='';}
 header();
 for(const row of block.rows){const font=row.total||row.heading?bold:regular,lines=measured(row.cells,font),lineCount=Math.max(...lines.map(x=>x.length),1);let offset=0;if(y-Math.min(lineCount*lh+12,100)<bottom){newPage(true);header();}if(row.total){page.drawLine({start:{x:left,y:y+1},end:{x:right,y:y+1},thickness:.5});}
 while(offset<lineCount){const available=Math.floor((y-bottom-12)/lh);if(available<1){newPage(true);header();continue;}const take=Math.min(available,lineCount-offset),height=take*lh+6;cells(lines,height,font,false,offset,take);offset+=take;if(offset<lineCount){newPage(true);header();}}
 if(row.total){page.drawLine({start:{x:left,y:y+2},end:{x:right,y:y+2},thickness:.5});page.drawLine({start:{x:left,y:y},end:{x:right,y:y},thickness:.5});y-=4;}
 }y-=10;
 }
 // Cover and contents are reserved before any paginated sections.
 page=pdf.addPage([W,H]);y=535;for(const line of wrap(model.company,430,bold,17)){draw(line,(W-width(line,bold,17))/2,y,17,bold);y-=24;}y-=25;for(const text of ['Annual report and financial statements',model.period,`Presented in ${model.currency}`]){for(const line of wrap(text,430,regular,11)){draw(line,(W-width(line,regular,11))/2,y,11);y-=17;}y-=8;}draw(model.ready?'Management-prepared financial statements':'INCOMPLETE DRAFT - requirements remain outstanding',left,170,9,bold);draw(model.illustrative?'ILLUSTRATIVE DATA - NOT COMPANY FINANCIAL STATEMENTS':'Unaudited - no audit assurance is generated by this application',left,151,8);
 const contents=pdf.addPage([W,H]);
 for(const section of model.sections){sectionTitle=section.title;newPage();const start=pdf.getPageCount()-2;if(section.key==='notes')noteStart=start;for(const block of section.blocks){if(block.type==='h'){if(pendingHeading)heading(pendingHeading);pendingHeading=block.text;}else if(block.type==='p'){if(pendingHeading){heading(pendingHeading);pendingHeading='';}para(block.text);}else table(block);}if(pendingHeading){heading(pendingHeading);pendingHeading='';}const end=pdf.getPageCount()-2;if(section.key==='notes')noteEnd=end;toc.push({title:section.title,start,end});}
 // Contents references use the final pagination, not estimated section numbers.
 page=contents;y=H-60;draw(model.company,left,y,11,bold);y-=45;draw('Contents',left,y,12,bold);y-=38;for(const entry of toc){const lines=wrap(entry.title,390,regular,10);for(const line of lines){draw(line,left,y,10);y-=14;}draw(entry.start===entry.end?String(entry.start):entry.start+' - '+entry.end,right-45,y+14,10);y-=14;}
 y-=15;para('The accompanying notes form an integral part of the financial statements. These statements are prepared from information entered by management.');if(!model.ready){heading('Preparation status');const items=model.issues.slice(0,8);para(items.map(x=>'- '+x.title).join('\n'),{size:9});if(model.issues.length>8)para(`A further ${model.issues.length-8} requirements are listed in the application.`,{size:9});}
 const pages=pdf.getPages();for(let i=2;i<pages.length;i++){page=pages[i];page.drawLine({start:{x:left,y:47},end:{x:right,y:47},thickness:.4});draw(`The notes on pages ${noteStart} - ${noteEnd} form part of these financial statements.`,left,33,7);draw(String(i-1),right-10,33,8);}
 return pdf.save();
}
root.HoistPDF={create};if(typeof module!=='undefined')module.exports=root.HoistPDF;
})(globalThis);
