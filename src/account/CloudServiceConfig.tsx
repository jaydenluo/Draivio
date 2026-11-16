import {useState} from 'react'
import {cloudAccount,configureCloudOrigin} from './cloudAccount'
import {message} from '../ui/message'
export function CloudServiceConfig({disabled,onChanged}:{disabled?:boolean;onChanged:()=>void}){
 const [value,setValue]=useState(()=>cloudAccount.getOrigin())
 const save=()=>{try{configureCloudOrigin(value);setValue(cloudAccount.getOrigin());message.success('云服务地址已保存');onChanged()}catch{message.error('请输入 HTTPS 域名，或 localhost 的 HTTP 地址，不要附带 API 路径')}}
 return <details className="cloud-service-config"><summary>云服务地址</summary><label>服务域名<input type="url" aria-label="云服务地址" disabled={disabled} value={value} onChange={e=>setValue(e.target.value)}/></label><small>默认 https://www.moviviz.com。更换域名后需要重新登录。</small><button type="button" disabled={disabled} onClick={save}>保存地址</button></details>
}
