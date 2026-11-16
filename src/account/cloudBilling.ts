import { cloudAccount } from './cloudAccount'

/** Quote only; billing/freeze/refund remain entirely on the server. */
export async function quoteCloudImages(request: {model:string;prompt:string;n?:number;size?:string;quality?:string}, requestCount:number):Promise<number> {
  const response=await cloudAccount.request('/api/model-gateway/v1/quotes',{method:'POST',body:{model:request.model,capability:'image',request}})
  if(response.status<200||response.status>=300)throw new Error('无法获取云端报价，请刷新模型或稍后重试')
  const value=(response.body as {totalCredits?:unknown}|null)?.totalCredits
  const unit=typeof value==='number'?value:typeof value==='string'&&value.trim()?Number(value):NaN
  const total=unit*requestCount
  if(!Number.isFinite(total)||total<0||!Number.isInteger(requestCount)||requestCount<1)throw new Error('云端报价无效，未提交付费请求')
  const account=cloudAccount.getSnapshot()
  if(!account.authenticated)throw new Error('请先登录云端账号')
  if(account.balance===null||account.balance<total)throw new Error(`云端积分不足，预计需要 ${total} 积分，请充值后重试`)
  return total
}
