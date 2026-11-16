import {fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import {BillingDialog} from './BillingDialog'
const api=vi.hoisted(()=>({fetchCloudBilling:vi.fn(),createCloudPayment:vi.fn(),getCloudPaymentOrder:vi.fn(),customCredits:vi.fn((amount:string,rate:number|null)=>amount&&rate?Number(amount)*rate:null),formatCredits:vi.fn((v:number|string)=>String(v))}))
const account=vi.hoisted(()=>({authenticated:true,user:{email:'member@test'},balance:12,refreshAccount:vi.fn()}))
vi.mock('../account/cloudPayments',()=>api)
vi.mock('../account/useCloudAccount',()=>({useCloudAccount:()=>account}))
vi.mock('../account/cloudAccount',()=>({cloudAccount:{refreshAccount:account.refreshAccount}}))
vi.mock('qrcode',()=>({default:{toDataURL:vi.fn().mockResolvedValue('data:image/png;base64,AA==')}}))
afterEach(()=>{vi.clearAllMocks()})
it('loads server packages and creates a payment QR order',async()=>{api.fetchCloudBilling.mockResolvedValue({overview:{balance:12,products:[{id:'p1',title:'入门套餐',priceFen:100,credits:10,bonusCredits:2}],creditsPerYuan:10},methods:{wechat:true,alipay:false,defaultGateway:'WECHAT'}});api.createCloudPayment.mockResolvedValue({orderId:'o1',gateway:'WECHAT',amountFen:100,codeUrl:'weixin://pay'});api.getCloudPaymentOrder.mockReturnValue(new Promise(()=>{}));render(<BillingDialog onClose={vi.fn()}/>);await screen.findByText('入门套餐');fireEvent.click(screen.getByRole('button',{name:'支付 ¥1.00'}));await waitFor(()=>expect(api.createCloudPayment).toHaveBeenCalledWith({productId:'p1',gateway:'WECHAT'}));expect(await screen.findByAltText('微信支付二维码')).toBeInTheDocument()})
it('shows configured payment channel and blocks unavailable channel',async()=>{api.fetchCloudBilling.mockResolvedValue({overview:{balance:0,products:[],creditsPerYuan:null},methods:{wechat:false,alipay:true,defaultGateway:'ALIPAY'}});render(<BillingDialog onClose={vi.fn()}/>);expect(await screen.findByRole('button',{name:'支付宝'})).toBeEnabled();expect(screen.getByRole('button',{name:'微信支付'})).toBeDisabled()})
