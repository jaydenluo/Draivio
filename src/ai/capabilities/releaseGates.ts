/** Runtime availability is separate from release acceptance; cloud requests require an authenticated session. */
export const releaseGates = Object.freeze({
 officialCloud:{available:true as const,label:'登录云端',reason:'登录共用云端账号后查询实际余额和可用模型；生成费用以所选模型和云服务响应为准。'},
 firstVersion:{status:'review-candidate' as const,reason:'本地工具和已配置供应商接口可验证；候选说明与测试证据需独立审核，尚未发布。'},
 fullTarget:{status:'pending-verification' as const,reason:'完整目标仍需真实服务质量、实际用户五工作流及浏览器/macOS/Windows验收证据，不能由单元测试自动批准。',acceptanceTaskId:'6bab7ff2-efdb-4bea-92c4-4736f6cc4f83'},
})
export function providerGate(connection?:{enabled:boolean;apiKey:string;protocol:string}):{available:boolean;reason:string}{
 if(!connection?.enabled)return {available:false,reason:'请选择启用的服务来源'}
 if(!connection.apiKey.trim())return {available:false,reason:'请重新输入本次会话的服务密钥'}
 if(!['openai_compatible','volcengine'].includes(connection.protocol))return {available:false,reason:'此协议尚未接入图片生成与模型规划'}
 return {available:true,reason:'由所选供应商计费；请求前核对上传范围及费用确认'}
}
