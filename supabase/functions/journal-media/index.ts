// Read-only gateway. Uses the caller JWT, or the server's legacy ANON JWT for guests.
// No service_role key, no signed URLs, no public bucket, and no policy bypass.
export function createJournalMediaHandler(env: (name: string) => string | undefined, fetcher: typeof fetch = fetch) {
 const roleOf=(token: string)=>{try{return JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).role;}catch{return null;}};
 const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'GET,OPTIONS'};
 return async (request: Request)=>{
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  const unavailable=()=>new Response('照片暂时不可用',{status:404,headers:{...cors,'Cache-Control':'no-store'}});
  if(request.method!=='GET')return unavailable();
  const url=new URL(request.url),id=url.searchParams.get('id'),size=url.searchParams.get('size');
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id||'')||!['image','thumb'].includes(size||''))return unavailable();
  const base=env('SUPABASE_URL'),key=env('SUPABASE_ANON_KEY');if(!base||!key||roleOf(key)!=='anon')return unavailable();
  const bearer=request.headers.get('Authorization');
  const authorization=bearer&&/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(bearer)?bearer:`Bearer ${key}`;
  if(!['anon','authenticated'].includes(roleOf(authorization.slice(7))))return unavailable();
  const headers={apikey:key,Authorization:authorization};
  try{
   // RLS, including current published media references, runs for every request.
   const rowResponse=await fetcher(`${base}/rest/v1/journal_media?id=eq.${id}&select=source,object_path,thumb_path`,{headers});
   if(!rowResponse.ok)return unavailable();
   const rows=await rowResponse.json(),row=rows[0];if(!row||row.source!=='private')return unavailable();
   const path=size==='image'?row.object_path:row.thumb_path;
   if(!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/(image|thumb)\.webp$/i.test(path||''))return unavailable();
   const object=await fetcher(`${base}/storage/v1/object/authenticated/place-journal-media/${path}`,{headers});
   if(!object.ok)return unavailable();
   return new Response(object.body,{headers:{...cors,'Content-Type':'image/webp','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  }catch{return unavailable();}
 };
}
if(typeof Deno!=='undefined')Deno.serve(createJournalMediaHandler(name=>Deno.env.get(name)));
