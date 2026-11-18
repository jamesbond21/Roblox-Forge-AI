import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildLocalResult } from './generation/templates.mjs';

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
const PUBLIC = resolve(ROOT, 'public');
const PORT = Number(process.env.PORT || 4173);
const TOKEN = process.env.FORGE_STUDIO_TOKEN || randomBytes(24).toString('hex');
const MAX_BODY = 128 * 1024;
const MODES = new Set(['luau','building','mesh','world','npc','vfx','game','assistant']);
const studioQueue = [];
const acked = new Map();
const mime = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.lua':'text/plain; charset=utf-8','.md':'text/markdown; charset=utf-8','.svg':'image/svg+xml'};

function send(res, status, data, headers={}) {
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  res.writeHead(status, {'Content-Type': typeof data === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8', 'X-Content-Type-Options':'nosniff', 'Cache-Control':'no-store', ...headers});
  res.end(body);
}
function secureEqual(a,b) { const x=Buffer.from(String(a||'')), y=Buffer.from(String(b||'')); return x.length===y.length && timingSafeEqual(x,y); }
async function readJson(req) {
  let raw='';
  for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > MAX_BODY) throw Object.assign(new Error('Request is too large (maximum 128 KB).'), {status:413}); }
  try { return JSON.parse(raw || '{}'); } catch { throw Object.assign(new Error('Request body must be valid JSON.'), {status:400}); }
}
function validate(input) {
  const mode=String(input.mode||''); const prompt=String(input.prompt||'').trim(); const name=String(input.name||mode).trim();
  if (!MODES.has(mode)) throw Object.assign(new Error('Choose a supported generator.'), {status:400});
  if (prompt.length < 8) throw Object.assign(new Error('Describe what you want in at least 8 characters.'), {status:400});
  if (prompt.length > 5000) throw Object.assign(new Error('Prompt is too long (maximum 5,000 characters).'), {status:400});
  if (name.length > 60) throw Object.assign(new Error('Project name must be 60 characters or fewer.'), {status:400});
  const engine=['auto','local','ai'].includes(input.engine)?input.engine:'auto';
  return {mode,prompt,name,engine};
}
const systemPrompt = `You are Roblox Forge AI, a senior Roblox engineer. Return only working Luau source, with no markdown fences. Use current Roblox APIs and strict types where practical. Use server authority for damage, rewards, inventory, and persistence. Validate remote arguments, add cleanup and error handling, and state required Studio placement/setup as Luau comments. Do not claim external mesh or animation assets were created; provide a reproducible Studio workflow or procedural implementation. The requested generator mode is included in the user request.`;

async function generateWithAI(args) {
  if (args.engine==='local') return buildLocalResult(args);
  if (!process.env.OPENAI_API_KEY) {
    if (args.engine==='ai') throw Object.assign(new Error('No AI provider is configured. Set OPENAI_API_KEY on the server, then restart it. Local templates are available with Engine set to Local.'), {status:503});
    return buildLocalResult(args);
  }
  const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
  let response;
  try {
    response = await fetch('https://api.openai.com/v1/responses', {method:'POST', headers:{'Authorization':`Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type':'application/json'}, body:JSON.stringify({model, instructions:systemPrompt, input:`Mode: ${args.mode}\nProject/module name: ${args.name}\nUser request:\n${args.prompt}`, max_output_tokens:6000})});
  } catch { throw Object.assign(new Error('Could not reach the AI provider. Check server network access and try again.'), {status:502}); }
  const payload = await response.json().catch(()=>({}));
  if (!response.ok) throw Object.assign(new Error(payload.error?.message || `AI provider returned HTTP ${response.status}. Check server credentials and provider availability.`), {status:502});
  const code = payload.output?.flatMap(item=>item.content||[]).find(item=>item.type==='output_text')?.text?.trim();
  if (!code) throw Object.assign(new Error('AI provider returned no source code. Try a more specific request.'), {status:502});
  const fileName = args.name.replace(/[^\w-]/g,'').slice(0,40) || 'ForgeGenerated';
  const location = args.mode==='npc'?'NPC':args.mode==='world'?'World':args.mode==='building'||args.mode==='mesh'?'Models':args.mode==='vfx'?'Effects':args.mode==='game'?'ServerScriptService':args.mode==='assistant'?'Assistant':'Scripts';
  const ext = args.mode==='assistant'?'lua':'server.lua';
  return {files:[{path:`${location}/${fileName}.${ext}`,content:code,kind:'Script'}], summary:`Generated ${fileName} with ${model}. Review the setup comments before use.`, provider:model};
}
async function handler(req,res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method==='GET' && url.pathname==='/api/status') return send(res,200,{ok:true,provider:process.env.OPENAI_API_KEY?'openai':'local',model:process.env.OPENAI_API_KEY?(process.env.OPENAI_MODEL||'gpt-4.1-mini'):null,studioConnected:studioQueue.length>0});
  if (req.method==='GET' && url.pathname==='/api/studio/config') return send(res,200,{token:TOKEN,endpoint:`http://127.0.0.1:${PORT}`});
  if (url.pathname.startsWith('/api/studio/')) {
    const token=url.searchParams.get('token') || req.headers['x-forge-token'];
    if (!secureEqual(token,TOKEN)) return send(res,401,{error:'Invalid Studio transfer token.'});
    if (req.method==='POST' && url.pathname==='/api/studio/send') {
      const body=await readJson(req); if (!Array.isArray(body.files)||body.files.length>50) return send(res,400,{error:'Provide between 1 and 50 generated files.'});
      for (const file of body.files) if (typeof file.path!=='string'||typeof file.content!=='string'||file.content.length>500000) return send(res,400,{error:'Each file must include a path and source under 500 KB.'});
      const batchId=randomBytes(8).toString('hex');
      for (const file of body.files) studioQueue.push({id:randomBytes(8).toString('hex'),batchId,path:file.path.replace(/^\/+|\.\.(?:\/|$)/g,''),content:file.content,kind:file.kind==='ModuleScript'?'ModuleScript':'Script',createdAt:Date.now()});
      return send(res,202,{ok:true,batchId,queued:body.files.length});
    }
    if (req.method==='GET' && url.pathname==='/api/studio/next') {
      const item=studioQueue.shift(); return send(res,200,{item:item||null});
    }
    if (req.method==='POST' && url.pathname==='/api/studio/ack') {
      const body=await readJson(req); if (typeof body.id!=='string') return send(res,400,{error:'Acknowledgement id is required.'});
      acked.set(body.id,{status:body.status==='error'?'error':'inserted',message:String(body.message||'').slice(0,300),at:Date.now()});
      for (const [key,val] of acked) if (Date.now()-val.at>86400000) acked.delete(key);
      return send(res,200,{ok:true});
    }
    if (req.method==='GET' && url.pathname==='/api/studio/queue') return send(res,200,{queued:studioQueue.length,acknowledgements:[...acked.values()].slice(-20)});
    return send(res,404,{error:'Unknown Studio endpoint.'});
  }
  if (req.method==='POST' && url.pathname==='/api/generate') {
    const args=validate(await readJson(req));
    const result=await generateWithAI(args);
    return send(res,200,{...result,files:result.files.map(f=>({...f,kind:f.kind||'Script'}))});
  }
  if (req.method!=='GET' && req.method!=='HEAD') return send(res,405,{error:'Method not allowed.'},{Allow:'GET, HEAD, POST'});
  const requested=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1));
  const path=resolve(PUBLIC,requested);
  if (!path.startsWith(PUBLIC+sep) && path!==PUBLIC) return send(res,403,'Forbidden');
  try { const content=await readFile(path); res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"}); return res.end(req.method==='HEAD'?undefined:content); }
  catch { return send(res,404,'Not found'); }
}

http.createServer((req,res)=>{ handler(req,res).catch(err=>{if(!res.headersSent)send(res,err.status||500,{error:err.message||'Unexpected server error.'});else res.destroy();}); })
 .listen(PORT,'127.0.0.1',()=>console.log(`Roblox Forge AI ready at http://127.0.0.1:${PORT}\nAI provider: ${process.env.OPENAI_API_KEY?'configured':'local generators (no API key)'}\nStudio transfer token: ${TOKEN}`));
