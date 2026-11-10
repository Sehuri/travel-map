const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('supabase/functions/journal-media/index.ts','utf8').replace('export function','function').replace('env: (name: string) => string | undefined, fetcher: typeof fetch = fetch','env,fetcher=fetch').replace('(request: Request)','request').replace('(token: string)','token').replace(/if\(typeof Deno[^\n]+/,'');
const context={Request,Response,URL,fetch,atob};vm.runInNewContext(source,context);
const id='55555555-5555-4555-8555-555555555555';
test('private media gateway forwards caller identity and never signs or bypasses RLS',async()=>{
 const calls=[],key='header.'+Buffer.from(JSON.stringify({role:'anon'})).toString('base64url')+'.sig',objectPath=`33333333-3333-4333-8333-333333333333/${id}/image.webp`;
 const env=n=>n==='SUPABASE_URL'?'https://example.supabase.co':key;
 let allowed=true;
 const handler=context.createJournalMediaHandler(env,async(url,opts)=>{calls.push([url,opts]);if(url.includes('/rest/'))return Response.json(allowed?[{source:'private',object_path:objectPath,thumb_path:objectPath.replace('image.webp','thumb.webp')}]:[]);return new Response('image');});
 let r=await handler(new Request(`https://test.invalid?id=${id}&size=image`));assert.equal(r.status,200);assert.equal(calls[0][1].headers.Authorization,`Bearer ${key}`);assert.match(calls[1][0],/object\/authenticated\/place-journal-media/);assert.match(r.headers.get('cache-control'),/no-store/);
 calls.length=0;r=await handler(new Request(`https://test.invalid?id=${id}&size=thumb`,{headers:{authorization:'Bearer header.'+Buffer.from(JSON.stringify({role:'authenticated'})).toString('base64url')+'.sig'}}));assert.equal(calls[0][1].headers.Authorization,'Bearer header.'+Buffer.from(JSON.stringify({role:'authenticated'})).toString('base64url')+'.sig');
 allowed=false;calls.length=0;r=await handler(new Request(`https://test.invalid?id=${id}&size=image`));assert.equal(r.status,404);assert.equal(calls.length,1,'no object lookup after RLS filters the media row');
 assert.equal((await handler(new Request('https://test.invalid?id=bad&size=image'))).status,404);
});
