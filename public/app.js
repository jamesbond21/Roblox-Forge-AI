const MODES = [
  {id:'luau',name:'Luau Generator',short:'Luau',icon:'⌘',desc:'Scripts & systems',tag:'CODE',title:'Write something brilliant',placeholder:'Example: Build a round-based capture-the-flag system with team assignment, scoring, respawns, and a match timer.'},
  {id:'building',name:'Building Generator',short:'Buildings',icon:'▧',desc:'Buildings & interiors',tag:'BUILD',title:'Design a place worth exploring',placeholder:'Example: A modern coastal hotel with a lobby, 4 floors, glass walls, balcony rails, and a rooftop pool. Include a detailed Studio build script.'},
  {id:'mesh',name:'3D Mesh Generator',short:'3D assets',icon:'⬡',desc:'Assets & import workflow',tag:'3D',title:'Create a 3D asset workflow',placeholder:'Example: A stylized sci-fi energy sword with a curved guard, emissive blade, grip, and Roblox mesh import instructions.'},
  {id:'world',name:'World Generator',short:'Worlds',icon:'⌁',desc:'Terrain & environments',tag:'WORLD',title:'Shape a whole new world',placeholder:'Example: A volcanic island with layered basalt cliffs, a central crater, black sand beaches, and sparse palm forest.'},
  {id:'npc',name:'NPC Creator',short:'NPCs',icon:'♟',desc:'Characters & AI',tag:'NPC',title:'Bring a character to life',placeholder:'Example: A forest guardian NPC that patrols waypoints, detects nearby players, chases with pathfinding, and attacks with a cooldown.'},
  {id:'vfx',name:'Animation & VFX',short:'Animation / VFX',icon:'✳',desc:'Effects & combat feel',tag:'VFX',title:'Make every moment land',placeholder:'Example: A reusable impact burst module with a glowing expanding ring, debris particles, and cleanup for a sword hit.'},
  {id:'game',name:'Complete Game Builder',short:'Game systems',icon:'◫',desc:'Integrated game systems',tag:'GAME',title:'Lay the foundation for a game',placeholder:'Example: A co-op dungeon crawler foundation with server-validated combat, inventory, persistent coins, quest hooks, and Studio setup.'},
  {id:'assistant',name:'Development Assistant',short:'Assistant',icon:'✧',desc:'Debug & improve code',tag:'ASSIST',title:'Make your project better',placeholder:'Paste your Luau code and explain the bug or improvement. Include error output and where the script lives.'}
];
const examples={luau:'Create an interactive metal door in Workspace with a ProximityPrompt. Tapping it should smoothly open and close the door.',building:'A detailed modern mountain lodge with a stone foundation, timber framing, large windows, a pitched roof, and a welcoming entrance.',mesh:'A stylized sci-fi energy sword with a curved guard, emissive blade, grip, and a repeatable Blender-to-Roblox import workflow.',world:'A forested island with rolling terrain, a sandy shoreline, ocean water, and scattered trees with an editable seed.',npc:'A forest guardian that patrols, detects nearby players, chases with pathfinding, and deals melee damage with a cooldown.',vfx:'A reusable impact effect module with colorful particle burst, glowing expanding ring, and automatic cleanup.',game:'A co-op dungeon crawler foundation with server-validated PvE combat, inventory, persistent coins, and setup instructions.',assistant:'Review this pattern for security and performance: remote events should validate all client arguments on the server, enforce cooldowns, and check target distance.'};
let activeMode='luau', files=[], activeIndex=0, studioToken='', endpoint='', generationCount=0;
const $=id=>document.getElementById(id);
const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function buildNavigation(){
  $('generatorNav').innerHTML=MODES.map(m=>`<button class="generator-item" data-mode="${m.id}"><span class="g-icon">${m.icon}</span>${m.name}<span class="g-tag">${m.tag}</span></button>`).join('');
  $('capabilities').innerHTML=MODES.slice(0,4).map(m=>`<button class="capability" data-mode="${m.id}"><span class="cap-icon">${m.icon}</span><span><strong>${m.name}</strong><small>${m.desc}</small></span><span class="arrow">↗</span></button>`).join('');
  $('modeChips').innerHTML=MODES.map(m=>`<button class="mode-chip" data-mode="${m.id}">${m.icon} &nbsp;${m.short}</button>`).join('');
  document.querySelectorAll('[data-mode]').forEach(el=>el.addEventListener('click',()=>selectMode(el.dataset.mode)));
}
function selectMode(mode){
  if(!MODES.some(m=>m.id===mode))return; activeMode=mode;
  const item=MODES.find(m=>m.id===mode); $('modeTitle').textContent=item.title; $('promptInput').placeholder=item.placeholder;
  document.querySelectorAll('.mode-chip').forEach(el=>el.classList.toggle('selected',el.dataset.mode===mode));
  document.querySelectorAll('.generator-item').forEach(el=>el.classList.toggle('active',el.dataset.mode===mode));
  $('modeCount').textContent=`${MODES.length} tools ready · ${item.short}`;
}
function showView(view){
  for(const id of ['forge','projects','studio']) $(`${id}View`).classList.toggle('hidden',id!==view);
  document.querySelectorAll('.nav-item').forEach(el=>el.classList.toggle('active',el.dataset.view===view));
  $('crumb').textContent=view==='forge'?'COMMAND CENTER':view==='projects'?'PROJECT FILES':'STUDIO BRIDGE';
  if(view==='studio'){loadStudioConfig();refreshQueue();} if(view==='projects')renderProjects();
}
let toastTimer;
function toast(msg,error=false){const box=$('toast');box.textContent=msg;box.classList.toggle('error',error);box.classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>box.classList.add('hidden'),3600);}
function renderFiles(){
  $('resultPanel').classList.remove('hidden'); $('resultTitle').textContent=files.length===1?files[0].path:`${files.length} project files are ready`;
  $('fileList').innerHTML=files.map((f,i)=>`<button class="file-entry ${i===activeIndex?'active':''}" data-index="${i}" title="${escapeHtml(f.path)}">${escapeHtml(f.path)}</button>`).join('');
  document.querySelectorAll('.file-entry').forEach(el=>el.addEventListener('click',()=>selectFile(Number(el.dataset.index)))); selectFile(Math.min(activeIndex,files.length-1)); renderProjects();
}
function selectFile(index){activeIndex=index;const f=files[index];if(!f)return;$('activeFileName').textContent=f.path;$('codeOutput').textContent=f.content;document.querySelectorAll('.file-entry').forEach((el,i)=>el.classList.toggle('active',i===index));}
async function generate(){
  const prompt=$('promptInput').value.trim(); if(prompt.length<8){toast('Add a little more detail to your prompt first.',true);$('promptInput').focus();return;}
  const button=$('generateButton'), label=button.querySelector('span:nth-child(2)'), old=label.textContent;button.disabled=true;label.textContent='Forge is building…';
  try{
    const response=await fetch('/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:activeMode,prompt,name:$('nameInput').value.trim()||activeMode,engine:$('engineSelect').value})});
    const data=await response.json();if(!response.ok)throw new Error(data.error||'Generation failed.');
    files=data.files;activeIndex=0;generationCount++;$('resultSummary').textContent=data.summary;$('providerResult').textContent=data.provider==='local'?'Generated with the local Forge engine':`Generated with ${data.provider}`;renderFiles();$('resultPanel').scrollIntoView({behavior:'smooth',block:'nearest'});toast(`Ready: ${files.length} file${files.length===1?'':'s'} generated.`);
  }catch(err){toast(err.message||'Could not generate this request.',true)}finally{button.disabled=false;label.textContent=old;}
}
function downloadBlob(blob,name){const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=name;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(link.href),1000);}
function downloadFile(){const f=files[activeIndex];if(f)downloadBlob(new Blob([f.content],{type:'text/plain;charset=utf-8'}),f.path.split('/').pop());}
// Minimal ZIP writer (store method) for a dependency-free project export.
const CRC_TABLE=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);t[n]=c>>>0}return t})();
function crc32(bytes){let c=0xffffffff;for(const b of bytes)c=CRC_TABLE[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0}
function zipProject(){
 if(!files.length)return;const enc=new TextEncoder(), locals=[], centrals=[];let offset=0;
 for(const f of files){const name=enc.encode(f.path),data=enc.encode(f.content),crc=crc32(data),lh=new Uint8Array(30+name.length),lv=new DataView(lh.buffer);lv.setUint32(0,0x04034b50,true);lv.setUint16(4,20,true);lv.setUint16(6,0x800,true);lv.setUint16(8,0,true);lv.setUint32(14,crc,true);lv.setUint32(18,data.length,true);lv.setUint32(22,data.length,true);lv.setUint16(26,name.length,true);lh.set(name,30);locals.push(lh,data);
 const ch=new Uint8Array(46+name.length),cv=new DataView(ch.buffer);cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x800,true);cv.setUint16(10,0,true);cv.setUint32(16,crc,true);cv.setUint32(20,data.length,true);cv.setUint32(24,data.length,true);cv.setUint16(28,name.length,true);cv.setUint32(42,offset,true);ch.set(name,46);centrals.push(ch);offset+=lh.length+data.length;}
 const centralSize=centrals.reduce((n,b)=>n+b.length,0),end=new Uint8Array(22),ev=new DataView(end.buffer);ev.setUint32(0,0x06054b50,true);ev.setUint16(8,files.length,true);ev.setUint16(10,files.length,true);ev.setUint32(12,centralSize,true);ev.setUint32(16,offset,true);
 downloadBlob(new Blob([...locals,...centrals,end],{type:'application/zip'}),`${($('nameInput').value.trim()||'RobloxForgeProject').replace(/[^\w-]/g,'_')}.zip`);
}
async function loadStudioConfig(){
 try{const r=await fetch('/api/studio/config');const d=await r.json();studioToken=d.token;endpoint=d.endpoint;$('tokenValue').textContent=studioToken;$('endpointValue').textContent=`Bridge endpoint · ${endpoint}`;}
 catch{$('tokenValue').textContent='Forge server unavailable';}
}
async function sendToStudio(){
 if(!files.length)return toast('Generate project files before sending them to Studio.',true);
 try{if(!studioToken)await loadStudioConfig();const r=await fetch(`/api/studio/send?token=${encodeURIComponent(studioToken)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({files})});const d=await r.json();if(!r.ok)throw new Error(d.error);toast(`${d.queued} file${d.queued===1?'':'s'} queued. Make sure the Forge plugin is connected.`);$('bridgeDot').classList.add('connected');}
 catch(e){toast(e.message||'Studio transfer could not be queued.',true)}
}
async function refreshQueue(){
 try{if(!studioToken)await loadStudioConfig();const r=await fetch(`/api/studio/queue?token=${encodeURIComponent(studioToken)}`);const d=await r.json();const acts=d.acknowledgements||[];$('queueState').textContent=d.queued?`${d.queued} file${d.queued===1?'':'s'} waiting for Studio`:'Bridge ready · no files waiting';$('bridgeDot').classList.toggle('connected',d.queued>0||acts.length>0);$('queueActivity').innerHTML=acts.length?acts.slice(-8).reverse().map(a=>`<div class="queue-item"><span class="live-dot" style="background:${a.status==='error'?'#e08777':'#baf36b'}"></span>${escapeHtml(a.status)} <small>${escapeHtml(a.message||'Studio file transfer')}</small></div>`).join(''):'No transfers yet.';}
 catch{$('queueState').textContent='Could not reach local bridge';}
}
async function copyText(text){try{await navigator.clipboard.writeText(text);toast('Copied to clipboard.')}catch{toast('Clipboard access is unavailable in this browser.',true)}}
function renderProjects(){
  $('projectsEmpty').classList.toggle('hidden',files.length>0);$('projectsTable').innerHTML=files.length?files.map((f,i)=>`<article class="project-card"><strong>${escapeHtml(f.path)}</strong><p>${f.content.split('\n').length} lines · ${f.kind||'Script'} · current session</p><button data-project="${i}">Open source →</button></article>`).join(''):'';
  document.querySelectorAll('[data-project]').forEach(el=>el.addEventListener('click',()=>{activeIndex=Number(el.dataset.project);renderFiles();showView('forge');$('resultPanel').scrollIntoView({behavior:'smooth'});}));
}
async function checkStatus(){try{const r=await fetch('/api/status');const d=await r.json();$('providerLabel').textContent=d.provider==='openai'?'AI ENGINE ONLINE':'LOCAL ENGINE';$('providerDetail').textContent=d.provider==='openai'?`${d.model} · server-side connection`:'Ready to generate · no key required';$('engineSelect').value='auto';}catch{$('providerDetail').textContent='Server connection unavailable';}}
function init(){
 buildNavigation();selectMode(activeMode);checkStatus();
 document.querySelectorAll('.nav-item').forEach(el=>el.addEventListener('click',()=>showView(el.dataset.view)));
 document.querySelectorAll('[data-goto]').forEach(el=>el.addEventListener('click',()=>showView(el.dataset.goto)));
 $('generateButton').addEventListener('click',generate);$('promptInput').addEventListener('input',()=>$('charCount').textContent=`${$('promptInput').value.length.toLocaleString()} / 5,000`);
 $('promptInput').addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){e.preventDefault();generate()}});
 $('exampleButton').addEventListener('click',()=>{$('promptInput').value=examples[activeMode];$('promptInput').dispatchEvent(new Event('input'));$('promptInput').focus()});$('clearButton').addEventListener('click',()=>{$('promptInput').value='';$('promptInput').dispatchEvent(new Event('input'));$('promptInput').focus()});
 $('downloadButton').addEventListener('click',zipProject);$('downloadFileButton').addEventListener('click',downloadFile);$('copyButton').addEventListener('click',()=>copyText(files[activeIndex]?.content||''));$('sendStudioButton').addEventListener('click',sendToStudio);
 $('helpButton').addEventListener('click',()=>showView('studio'));$('setupButton').addEventListener('click',()=>$('setupDialog').showModal());$('copyTokenButton').addEventListener('click',()=>copyText(studioToken));$('refreshQueueButton').addEventListener('click',refreshQueue);
}
init();
