import {createServer, type Server} from 'node:http'
import {afterEach, expect, it, vi} from 'vitest'
import {createCloudAccount} from './cloudAccount'
const response=(body:unknown,status=200)=>new Response(status===204?null:JSON.stringify(body),{status})
const model={id:'offer-id',code:'public-image',displayName:'Image',modality:'image',capabilities:['image'],constraints:{maxImages:1},availability:{available:true},estimatedCredits:7}
function setup(){
 const calls:Array<{path:string;body:any;auth:string|undefined}>=[]
 let handler:(path:string,body:any,auth:string|undefined)=>Promise<Response>|Response=(path)=>{
  if(path.endsWith('password-login')||path.endsWith('verify'))return response({accessToken:'secret-access',refreshToken:'secret-refresh'})
  if(path.endsWith('/me'))return response({email:'member@example.test'})
  if(path.endsWith('overview')||path.endsWith('/balance'))return response({balance:'42'})
  if(path.endsWith('models'))return response({data:[model]})
  return response({},204)
 }
 vi.spyOn(globalThis,'fetch').mockImplementation(async(url,init)=>{const path=new URL(String(url)).pathname;const body=init?.body?JSON.parse(String(init.body)):undefined;const auth=(init?.headers as Record<string,string>)?.Authorization;calls.push({path,body,auth});return handler(path,body,auth)})
 const account=createCloudAccount({origin:'https://cloud.test'})
 return {account,calls,setHandler:(fn:typeof handler)=>{handler=fn}}
}
afterEach(()=>{vi.restoreAllMocks();localStorage.clear()})
it('uses real auth contracts and exposes only sanitized account/model state, never persisted tokens',async()=>{
 const {account,calls}=setup();const changed=vi.fn();account.subscribe(changed)
 await account.passwordLogin('member@example.test','password-value')
 expect(account.getSnapshot()).toMatchObject({authenticated:true,user:{email:'member@example.test'},balance:42,models:[model]})
 expect(calls[0]).toMatchObject({path:'/api/auth/password-login',body:{email:'member@example.test',password:'password-value',deviceLabel:'Draivio'}})
 expect(calls[0].body.installationId).toMatch(/^[0-9a-f-]{36}$/)
 expect(calls.filter(c=>c.path.endsWith('/me'))[0].auth).toBe('Bearer secret-access')
 expect(JSON.stringify(account.getSnapshot())).not.toContain('secret-')
 expect(JSON.stringify({...localStorage})).not.toMatch(/secret-|password-value|member@example/)
 expect(changed).toHaveBeenCalled()
})
it('uses registration/reset purposes without pretending email/reset results authenticate',async()=>{
 const {account,calls}=setup()
 await account.requestCode('member@example.test','register');expect(account.getSnapshot().authenticated).toBe(false)
 await account.register('member@example.test','123456','password-value')
 await account.resetPassword('member@example.test','654321','new-password')
 expect(calls.find(c=>c.path.endsWith('/email-codes'))?.body).toEqual({email:'member@example.test',purpose:'register'})
 expect(calls.find(c=>c.path.endsWith('/verify'))?.body).toMatchObject({purpose:'register',code:'123456',password:'password-value'})
 expect(calls.find(c=>c.path.endsWith('/password-reset'))?.body).toEqual({email:'member@example.test',code:'654321',password:'new-password'})
})
it('singleflights expired-token refresh and retries only the unauthorized attempt',async()=>{
 const {account,calls,setHandler}=setup();await account.passwordLogin('member@example.test','password-value')
 setHandler(async(path,_body,auth)=>{
  if(path.endsWith('/refresh')){await new Promise(r=>setTimeout(r,15));return response({accessToken:'access-new',refreshToken:'refresh-new'})}
  return auth==='Bearer secret-access'?response({code:'TOKEN_EXPIRED'},401):response({data:[]})
 })
 const results=await Promise.all([account.request('/api/model-gateway/v1/models'),account.request('/api/model-gateway/v1/models')])
 expect(results.map(r=>r.status)).toEqual([200,200]);expect(calls.filter(c=>c.path.endsWith('/refresh'))).toHaveLength(1)
 expect(calls.find(c=>c.path.endsWith('/refresh'))?.body).toEqual({refreshToken:'secret-refresh'})
})
it('logout prevents late login, refresh and account fetches from restoring the session',async()=>{
 const {account,setHandler}=setup();let resolve!:(r:Response)=>void
 setHandler(()=>new Promise(r=>{resolve=r}))
 const pending=account.passwordLogin('member@example.test','pw');await Promise.resolve();await account.logout();resolve(response({accessToken:'late',refreshToken:'late-refresh'}))
 await expect(pending).rejects.toMatchObject({code:'SESSION_CHANGED'});expect(account.getSnapshot()).toEqual({authenticated:false,user:null,balance:null,models:[]})
})
it('redacts server text while preserving structured error code, and never retries quota failures',async()=>{
 const {account,calls,setHandler}=setup();await account.passwordLogin('member@example.test','pw')
 setHandler(()=>response({error:{code:'INSUFFICIENT_CREDITS',message:'secret-access private supplier text'}},402))
 const r=await account.request('/api/model-gateway/v1/images/generations',{method:'POST',body:{prompt:'test'}})
 expect(r).toMatchObject({status:402,body:{code:'INSUFFICIENT_CREDITS'}})
 expect(calls.filter(c=>c.path.endsWith('generations'))).toHaveLength(1)
 await expect(account.refreshAccount()).rejects.toMatchObject({code:'INSUFFICIENT_CREDITS'})
})
it('does not forward caller authorization or tokens to arbitrary URLs/paths',async()=>{
 const {account,calls}=setup();await account.passwordLogin('member@example.test','pw')
 await expect(account.request('https://attacker.test/api/auth/me')).rejects.toMatchObject({code:'INVALID_CLOUD_PATH'})
 await expect(account.request('/api/auth/refresh')).rejects.toMatchObject({code:'INVALID_CLOUD_PATH'})
 await account.request('/api/auth/me',{headers:{Authorization:'Bearer attacker'}})
 expect(calls.at(-1)?.auth).toBe('Bearer secret-access')
})
it('executes the shared transport against a local HTTP server with real status/body decoding',async()=>{
 const server=createServer((req,res)=>{res.setHeader('content-type','application/json');if(req.url==='/api/auth/password-login')res.end(JSON.stringify({accessToken:'local-access',refreshToken:'local-refresh'}));else if(req.url==='/api/auth/me')res.end(JSON.stringify({email:'local@example.test'}));else if(req.url==='/api/model-gateway/v1/balance')res.end(JSON.stringify({balance:0}));else res.end(JSON.stringify({data:[model]}))})
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve))
 try{const account=createCloudAccount({origin:`http://127.0.0.1:${(server.address() as any).port}`});await account.passwordLogin('local@example.test','pw');expect(account.getSnapshot()).toMatchObject({authenticated:true,balance:0,models:[model]})}finally{await new Promise<void>(resolve=>server.close(()=>resolve()))}
})
it('closing authentication cancels pending login but does not clear an already successful session',async()=>{
 const {account,setHandler}=setup();let resolve!:(r:Response)=>void
 setHandler(()=>new Promise(r=>{resolve=r}))
 const pending=account.passwordLogin('member@example.test','pw');await Promise.resolve();account.cancelPendingAuthentication();resolve(response({accessToken:'late',refreshToken:'late-refresh'}))
 await expect(pending).rejects.toMatchObject({code:'SESSION_CHANGED'});expect(account.getSnapshot().authenticated).toBe(false)
 const active=setup().account;await active.passwordLogin('member@example.test','pw');active.cancelPendingAuthentication();expect(active.getSnapshot().authenticated).toBe(true)
})
it('logout discards an in-flight refresh and never resurrects credentials',async()=>{
 const {account,setHandler}=setup();await account.passwordLogin('member@example.test','pw');let resolve!:(r:Response)=>void
 setHandler(path=>path.endsWith('/refresh')?new Promise(r=>{resolve=r}):path.endsWith('/logout')?response({},204):response({},401))
 const pending=account.request('/api/model-gateway/v1/models');while(!resolve)await new Promise(r=>setTimeout(r,0))
 await account.logout();resolve(response({accessToken:'late',refreshToken:'late-refresh'}))
 await expect(pending).rejects.toMatchObject({code:'SESSION_CHANGED'});expect(account.getSnapshot().authenticated).toBe(false)
 await expect(account.request('/api/auth/me')).rejects.toMatchObject({code:'SESSION_REQUIRED'})
})
it('forwards idempotency headers and does not retry a failed paid network request',async()=>{
 const {account,calls}=setup();await account.passwordLogin('member@example.test','pw')
 const fetcher=vi.mocked(fetch);fetcher.mockRejectedValueOnce(new Error('private secret-access'))
 await expect(account.request('/api/model-gateway/v1/images/generations',{method:'POST',headers:{'Idempotency-Key':'request-uuid'},body:{prompt:'image'}})).rejects.toMatchObject({kind:'network'})
 expect(fetcher.mock.calls.at(-1)?.[1]).toMatchObject({headers:{'Idempotency-Key':'request-uuid',Authorization:'Bearer secret-access'}})
 expect(calls.filter(c=>c.path.endsWith('generations'))).toHaveLength(0)
})
it('refreshes at most once on persistent 401 and clears an expired account',async()=>{
 const {account,calls,setHandler}=setup();await account.passwordLogin('member@example.test','pw')
 setHandler(path=>path.endsWith('/refresh')?response({accessToken:'new',refreshToken:'new-refresh'}):response({code:'ACCOUNT_SUSPENDED'},401))
 expect(await account.request('/api/auth/me')).toMatchObject({status:401,body:{code:'ACCOUNT_SUSPENDED'}})
 expect(calls.filter(c=>c.path.endsWith('/refresh'))).toHaveLength(1);expect(account.getSnapshot().authenticated).toBe(false)
})
it('uses the reset-code endpoint and explicit desktop session header with normalized email',async()=>{
 const {account,calls}=setup()
 await account.requestCode('  Member@Example.Test  ','password_reset')
 expect(calls[0]).toMatchObject({path:'/api/auth/password-reset/codes',body:{email:'member@example.test'}})
 const headers=vi.mocked(fetch).mock.calls[0][1]?.headers as Record<string,string>
 expect(headers['X-MOVIVIZ-Client']).toBe('desktop')
})
it('accepts the documented items catalog alias and balance API decimal values',async()=>{
 const {account,setHandler}=setup()
 setHandler(path=>path.endsWith('password-login')?response({accessToken:'access',refreshToken:'refresh'},201):path.endsWith('/me')?response({email:'member@example.test'}):path.endsWith('/balance')?response({balance:'12.25'}):path.endsWith('/models')?response({items:[{...model,code:undefined,id:'public-image'}]}):response({}))
 await account.passwordLogin('member@example.test','pw')
 expect(account.getSnapshot()).toMatchObject({balance:12.25,models:[{code:'public-image'}]})
})

it('changing service invalidates active and pending sessions without forwarding old credentials',async()=>{
 const {account,calls,setHandler}=setup();await account.passwordLogin('member@example.test','pw')
 const version=account.getSessionVersion()
 account.configureOrigin(' https://other-cloud.test/ ')
 expect(account.getOrigin()).toBe('https://other-cloud.test')
 expect(account.getSessionVersion()).toBeGreaterThan(version)
 expect(account.getSnapshot().authenticated).toBe(false)
 await expect(account.request('/api/auth/me')).rejects.toMatchObject({code:'SESSION_REQUIRED'})
 expect(calls.filter(c=>c.path.endsWith('/me'))).toHaveLength(1)
 let finish!:(r:Response)=>void;setHandler(()=>new Promise(r=>{finish=r}))
 const pending=account.codeLogin('member@example.test','123456');await Promise.resolve()
 account.configureOrigin('https://third-cloud.test');finish(response({accessToken:'late',refreshToken:'late-refresh'}))
 await expect(pending).rejects.toMatchObject({code:'SESSION_CHANGED'})
 expect(account.getSnapshot().authenticated).toBe(false)
})
it.each(['http://public.test','https://user:pass@cloud.test','https://cloud.test/v1','https://cloud.test?key=secret','https://cloud.test/#token'])('rejects invalid configured service %s without dropping a valid session',async origin=>{
 const {account}=setup();await account.passwordLogin('member@example.test','pw')
 expect(()=>account.configureOrigin(origin)).toThrow('INVALID_CLOUD_ORIGIN')
 expect(account.getOrigin()).toBe('https://cloud.test');expect(account.getSnapshot().authenticated).toBe(true)
})
