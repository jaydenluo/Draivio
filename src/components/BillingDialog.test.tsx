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

it('shows bonus, effective rate and custom estimate, then replaces the form with order information', async () => {
 api.fetchCloudBilling.mockResolvedValue({
  overview: { balance: 12, products: [{ id: 'p1', title: '入门套餐', priceFen: 200, credits: 20, bonusCredits: 4 }], creditsPerYuan: 10 },
  methods: { wechat: true, alipay: false, defaultGateway: 'WECHAT' },
 })
 api.createCloudPayment.mockResolvedValue({ orderId: 'o2', gateway: 'WECHAT', amountFen: 300, codeUrl: 'weixin://pay', serverTime: '2026-11-20T04:00:00Z', expiresAt: '2026-11-20T04:05:00Z' })
 render(<BillingDialog onClose={vi.fn()} />)
 expect(await screen.findByText('基础 20 + 赠送 4')).toBeInTheDocument()
 expect(screen.getByText('12 积分 / 元')).toBeInTheDocument()
 fireEvent.click(screen.getByRole('radio', { name: /自定义金额/ }))
 fireEvent.change(screen.getByRole('spinbutton', { name: '充值金额' }), { target: { value: '3' } })
 expect(screen.getByText('预计到账 30 积分')).toBeInTheDocument()
 fireEvent.click(screen.getByRole('button', { name: '支付 ¥3.00' }))
 expect(await screen.findByAltText('微信支付二维码')).toBeInTheDocument()
 expect(screen.queryByRole('group', { name: '选择充值套餐' })).toBeNull()
 expect(screen.getByText('剩余 05:00')).toBeInTheDocument()
})

it('retries a failed catalog load in the same window', async () => {
 api.fetchCloudBilling.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({
  overview: { balance: 12, products: [], creditsPerYuan: 10 },
  methods: { wechat: true, alipay: false, defaultGateway: 'WECHAT' },
 })
 render(<BillingDialog onClose={vi.fn()} />)
 fireEvent.click(await screen.findByRole('button', { name: '重试' }))
 expect(await screen.findByRole('radio', { name: /自定义金额/ })).toBeEnabled()
})
