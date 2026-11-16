import { cloudAccount, type CloudAccountError } from './cloudAccount'

export type PaymentGateway = 'WECHAT' | 'ALIPAY'
export type CreditProduct = { id:string; title:string; priceFen:number; credits:number; bonusCredits:number }
export type CloudAccountOverview = { balance:number|string; products:CreditProduct[]; creditsPerYuan:number|null }
export type PaymentMethods = { wechat:boolean; alipay:boolean; defaultGateway:PaymentGateway|null }
export type Checkout = { orderId:string; gateway:PaymentGateway; amountFen:number; codeUrl:string; expiresAt?:string; serverTime?:string }
export type PaymentOrder = { id:string; orderNo:string; gateway:PaymentGateway; status:string; amountFen:number; credits:number|string; createdAt:string; paidAt?:string|null }
function object(value:unknown):Record<string,unknown>{return value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>: {}}
function finite(value:unknown){const n=typeof value==='number'?value:typeof value==='string'&&value.trim()?Number(value):NaN;return Number.isFinite(n)&&n>=0?n:null}
function checked<T>(response:{status:number;body:unknown}):T {if(response.status<200||response.status>=300){const body=object(response.body);throw new Error(typeof body.code==='string'?body.code:'HTTP_'+response.status)}return response.body as T}
function product(value:unknown):CreditProduct {const v=object(value);const price=finite(v.priceFen), credits=finite(v.credits), bonus=finite(v.bonusCredits);if(typeof v.id!=='string'||typeof v.title!=='string'||price===null||credits===null||bonus===null||!Number.isSafeInteger(price))throw new Error('INVALID_TOP_UP_CATALOG');return {id:v.id,title:v.title,priceFen:price,credits,bonusCredits:bonus}}
export async function fetchCloudBilling():Promise<{overview:CloudAccountOverview;methods:PaymentMethods}>{
 const [overview,methods]=await Promise.all([cloudAccount.request('/api/account/overview'),cloudAccount.request('/api/account/payment-methods')])
 const body=object(checked<Record<string,unknown>>(overview));const rawProducts=Array.isArray(body.products)?body.products:[]
 const balance=finite(body.balance);if(balance===null||!rawProducts.every(v=>{try{product(v);return true}catch{return false}}))throw new Error('INVALID_TOP_UP_CATALOG')
 const rate=body.creditsPerYuan===null?null:finite(body.creditsPerYuan);if(body.creditsPerYuan!==null&&rate===null)throw new Error('INVALID_TOP_UP_CATALOG')
 const method=object(checked<Record<string,unknown>>(methods));const gateway=method.defaultGateway;return {overview:{balance:body.balance as number|string,products:rawProducts.map(product),creditsPerYuan:rate},methods:{wechat:method.wechat===true,alipay:method.alipay===true,defaultGateway:gateway==='WECHAT'||gateway==='ALIPAY'?gateway:null}}
}
export async function createCloudPayment(input:{productId?:string;amountYuan?:number;gateway:PaymentGateway}):Promise<Checkout>{
 if((input.productId===undefined)===(input.amountYuan===undefined))throw new Error('PAYMENT_ORDER_INVALID')
 const response=await cloudAccount.request('/api/account/payment-orders',{method:'POST',body:input})
 const body=object(checked<Record<string,unknown>>(response));if(typeof body.orderId!=='string'||typeof body.gateway!=='string'||typeof body.codeUrl!=='string'||!['WECHAT','ALIPAY'].includes(body.gateway))throw new Error('INVALID_PAYMENT_CHECKOUT')
 const amount=finite(body.amountFen);if(amount===null||!Number.isSafeInteger(amount))throw new Error('INVALID_PAYMENT_CHECKOUT')
 return {orderId:body.orderId,gateway:body.gateway as PaymentGateway,amountFen:amount,codeUrl:body.codeUrl,...(typeof body.expiresAt==='string'?{expiresAt:body.expiresAt}:{}),...(typeof body.serverTime==='string'?{serverTime:body.serverTime}:{})}
}
export async function getCloudPaymentOrder(orderId:string):Promise<PaymentOrder>{
 if(!/^[A-Za-z0-9_-]{1,100}$/.test(orderId))throw new Error('PAYMENT_ORDER_INVALID')
 const response=await cloudAccount.request(`/api/account/payment-orders/${orderId}`);const body=object(checked<Record<string,unknown>>(response));if(typeof body.id!=='string'||typeof body.status!=='string'||typeof body.gateway!=='string')throw new Error('INVALID_PAYMENT_ORDER');return body as unknown as PaymentOrder
}
export function formatCredits(value:number|string){const n=finite(value);return n===null?'—':n.toLocaleString('zh-CN',{maximumFractionDigits:6})}
export function customCredits(amount:string,rate:number|null){if(!/^\d+$/.test(amount)||!rate||rate<0.01)return null;const yuan=Number(amount);return Number.isSafeInteger(yuan)&&yuan>=1&&yuan<=10000?Math.round(rate*100*yuan)/100:null}
