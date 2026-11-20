export type RememberedLogin = {remember:boolean;email:string;password:string}
const empty=():RememberedLogin=>({remember:true,email:'',password:''})
const keyFor=(origin:string)=>`draivio-remembered-login-v1:${encodeURIComponent(origin)}`

/** Explicitly opted-in local credentials. Session tokens never belong in this record. */
export function readRememberedLogin(origin:string):RememberedLogin{
 try{
  const raw=localStorage.getItem(keyFor(origin))
  if(!raw)return empty()
  const value:unknown=JSON.parse(raw)
  if(!value||typeof value!=='object'||Array.isArray(value))return empty()
  const data=value as Record<string,unknown>
  if(data.remember===false)return {remember:false,email:'',password:''}
  if(data.remember!==true||typeof data.email!=='string'||typeof data.password!=='string'||data.email.length>254||data.password.length>128)return empty()
  return {remember:true,email:data.email,password:data.password}
 }catch{return empty()}
}

export function writeRememberedLogin(origin:string,value:RememberedLogin):boolean{
 try{
  localStorage.setItem(keyFor(origin),JSON.stringify(value.remember?{remember:true,email:value.email,password:value.password}:{remember:false}))
  return true
 }catch{return false}
}
