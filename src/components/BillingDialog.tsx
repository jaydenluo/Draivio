import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { SettingsDialog } from './SettingsDialog'
import { NumericScrubber } from './NumericScrubber'
import { DialogTitlebar } from '../ui/DialogTitlebar'
import { cloudAccount } from '../account/cloudAccount'
import { useCloudAccount } from '../account/useCloudAccount'
import { message } from '../ui/message'
import { createCloudPayment, customCredits, fetchCloudBilling, formatCredits, getCloudPaymentOrder, type Checkout, type PaymentGateway } from '../account/cloudPayments'
import '../styles/billing-dialog.css'

const money = (fen: number) => `¥${(fen / 100).toFixed(2)}`
type Catalog = Awaited<ReturnType<typeof fetchCloudBilling>>
type Payment = { checkout: Checkout; credits: number; deadline: number | null }

export function BillingDialog({ onClose, onLogin }: { onClose: () => void; onLogin?: () => void }) {
  const account = useCloudAccount()
  const accountId = account.authenticated ? account.user?.email ?? '' : ''
  const activeAccount = useRef(accountId)
  activeAccount.current = accountId
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [loadError, setLoadError] = useState('')
  const [selected, setSelected] = useState('')
  const [amount, setAmount] = useState('')
  const [gateway, setGateway] = useState<PaymentGateway>('WECHAT')
  const [creating, setCreating] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [liveBalance, setLiveBalance] = useState<number | null>(null)
  const [payment, setPayment] = useState<Payment | null>(null)
  const [orderError, setOrderError] = useState('')
  const pending = useRef(false)
  const onPaid = useRef(onClose)
  onPaid.current = onClose

  useEffect(() => {
    setPayment(null)
    setOrderError('')
    setAmount('')
    if (!account.authenticated) return
    let active = true
    setLoadError('')
    setCatalog(null)
    setLiveBalance(null)
    void fetchCloudBilling().then(next => {
      if (!active) return
      setCatalog(next)
      setSelected(next.overview.products[0]?.id ?? 'custom')
      setGateway(next.methods.defaultGateway === 'ALIPAY' && next.methods.alipay || !next.methods.wechat ? 'ALIPAY' : 'WECHAT')
    }).catch(error => {
      if (!active) return
      setLoadError(error instanceof Error && error.message === 'INVALID_TOP_UP_CATALOG'
        ? '云端返回的套餐信息无效' : '充值信息加载失败，请检查网络')
    })
    return () => { active = false }
  }, [account.authenticated, accountId, loadAttempt])

  const overview = catalog?.overview
  const product = overview?.products.find(item => item.id === selected)
  const custom = selected === 'custom'
  const rate = overview?.creditsPerYuan ?? null
  const credits = custom ? customCredits(amount, rate) : product ? product.credits + product.bonusCredits : null
  const price = custom ? (credits === null ? null : Number(amount) * 100) : product?.priceFen ?? null
  const enabled = gateway === 'WECHAT' ? catalog?.methods.wechat : catalog?.methods.alipay
  const refresh = async () => {
    setRefreshing(true)
    try { setLiveBalance((await cloudAccount.refreshAccount())?.balance ?? null) }
    catch { message.error('余额刷新失败，请检查网络或重新登录。', { key: 'cloud-balance' }) }
    finally { setRefreshing(false) }
  }
  const pay = async () => {
    if (pending.current || payment || credits === null || !enabled) return
    pending.current = true
    setCreating(true)
    setOrderError('')
    try {
      const checkout = await createCloudPayment(custom ? { amountYuan: Number(amount), gateway } : { productId: product!.id, gateway })
      if (activeAccount.current !== accountId) return
      const now = Date.now()
      const serverTime = Date.parse(checkout.serverTime ?? '')
      const expires = Date.parse(checkout.expiresAt ?? '')
      const deadline = Number.isFinite(expires) ? now + expires - (Number.isFinite(serverTime) ? serverTime : now) : null
      setPayment({ checkout, credits, deadline })
    } catch (error) {
      if (activeAccount.current !== accountId) return
      setOrderError(error instanceof Error && error.message === 'PAYMENT_CHANNEL_NOT_CONFIGURED'
        ? '该支付渠道暂未开通' : '创建充值订单失败，请稍后重试')
    } finally {
      pending.current = false
      setCreating(false)
    }
  }

  const paid = () => {
    message.success('充值成功，积分已到账', { key: 'cloud-payment' })
    void cloudAccount.refreshAccount().catch(() => message.info('充值成功，可刷新余额查看最新积分', { key: 'cloud-balance' }))
    onPaid.current()
  }
  return <SettingsDialog label="云服务充值" onClose={onClose} className="billing-dialog">
    <DialogTitlebar title="云服务充值" onClose={onClose} />
    {!account.authenticated ? <div className="billing-dialog-body">
      <p>登录后查看积分余额及充值套餐。</p>
      <button type="button" onClick={() => onLogin ? onLogin() : window.dispatchEvent(new Event('draivio:cloud-login'))}>登录 / 注册</button>
    </div> : payment ? <PaymentView payment={payment} onBack={() => setPayment(null)} onPaid={paid} /> :
      <div className="billing-dialog-body">
        <div className="billing-account">
          <div className="billing-balance">
            <span>当前余额</span> <strong>{formatCredits(liveBalance ?? overview?.balance ?? account.balance ?? '—')}</strong> 积分
          </div>
          <span className="billing-email" title={account.user?.email}>{account.user?.email}</span>
          <button type="button" disabled={refreshing} onClick={() => void refresh()}>{refreshing ? '刷新中…' : '刷新余额'}</button>
        </div>
        {loadError ? <div className="billing-error"><p role="alert">{loadError}</p><button type="button" onClick={() => setLoadAttempt(value => value + 1)}>重试</button></div> :
          catalog ? <>
            <fieldset className="billing-products" disabled={creating}>
              <legend>选择充值套餐</legend>
              {catalog.overview.products.length ? <div className="billing-product-grid">
                {catalog.overview.products.map(item => <label key={item.id} className="billing-option billing-package" data-selected={selected === item.id}>
                  <input className="sr-only" type="radio" name="billing-product" checked={selected === item.id} onChange={() => setSelected(item.id)} />
                  <span className="billing-package-name">{item.title}</span>
                  <span className="billing-package-credits"><strong>{formatCredits(item.credits + item.bonusCredits)}</strong> 积分</span>
                  {item.bonusCredits > 0 ? <small>基础 {formatCredits(item.credits)} + 赠送 {formatCredits(item.bonusCredits)}</small> : null}
                  <span className="billing-package-price">
                    <strong>{money(item.priceFen)}</strong>
                    {item.priceFen > 0 ? <small>{formatCredits((item.credits + item.bonusCredits) * 100 / item.priceFen)} 积分 / 元</small> : null}
                  </span>
                </label>)}
              </div> : null}
              {rate ? <>
                <label className="billing-option billing-custom-option" data-selected={custom}>
                  <input className="sr-only" type="radio" name="billing-product" checked={custom} onChange={() => setSelected('custom')} />
                  <strong>自定义金额</strong><small>{formatCredits(rate)} 积分 / 元</small>
                </label>
                {custom ? <div className="billing-custom">
                  <NumericScrubber
                    label="金额（元）"
                    ariaLabel="充值金额"
                    descriptionId="billing-amount-range"
                    min={1}
                    max={10000}
                    value={amount === '' ? null : Number(amount)}
                    onChange={value => setAmount(String(Math.round(value)))}
                    onDraftChange={setAmount}
                    disabled={creating}
                  />
                  <small id="billing-amount-range">1–10,000 元的整数</small>
                </div> : null}
              </> : null}
            </fieldset>
            {!catalog.overview.products.length && !rate ? <p className="billing-muted">暂没有可用的充值套餐</p> : null}
            <div className="billing-gateways" role="group" aria-label="支付方式">
              <button type="button" className="billing-wechat" aria-pressed={gateway === 'WECHAT'} disabled={!catalog.methods.wechat || creating} onClick={() => setGateway('WECHAT')}>
                <svg className="billing-gateway-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135-.01-.27-.027-.407-.03zm-2.53 3.274c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z" />
                </svg>
                <span>微信支付</span>
              </button>
              <button type="button" className="billing-alipay" aria-pressed={gateway === 'ALIPAY'} disabled={!catalog.methods.alipay || creating} onClick={() => setGateway('ALIPAY')}>
                <svg className="billing-gateway-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M19.695 15.07c3.426 1.158 4.203 1.22 4.203 1.22V3.846c0-2.124-1.705-3.845-3.81-3.845H3.914C1.808.001.102 1.722.102 3.846v16.31c0 2.123 1.706 3.845 3.813 3.845h16.173c2.105 0 3.81-1.722 3.81-3.845v-.157s-6.19-2.602-9.315-4.119c-2.096 2.602-4.8 4.181-7.607 4.181-4.75 0-6.361-4.19-4.112-6.949.49-.602 1.324-1.175 2.617-1.497 2.025-.502 5.247.313 8.266 1.317a16.796 16.796 0 0 0 1.341-3.302H5.781v-.952h4.799V6.975H4.77v-.953h5.81V3.591s0-.409.411-.409h2.347v2.84h5.744v.951h-5.744v1.704h4.69a19.453 19.453 0 0 1-1.986 5.06c1.424.52 2.702 1.011 3.654 1.333m-13.81-2.032c-.596.06-1.71.325-2.321.869-1.83 1.608-.735 4.55 2.968 4.55 2.151 0 4.301-1.388 5.99-3.61-2.403-1.182-4.438-2.028-6.637-1.809" />
                </svg>
                <span>支付宝</span>
              </button>
            </div>
            {!enabled ? <p className="billing-muted">当前没有可用支付渠道</p> : null}
            {orderError ? <p role="alert" className="billing-error">{orderError}</p> : null}
            <footer className="billing-checkout">
              <output aria-label="到账积分" className="billing-summary">
                <span>到账积分</span> <strong>{credits === null ? '—' : `${formatCredits(credits)} 积分`}</strong>
              </output>
              <button type="button" className="billing-pay" disabled={creating || price === null || !enabled} onClick={() => void pay()}>
                {creating ? '创建订单中…' : price === null ? '支付' : `支付 ${money(price)}`}
              </button>
            </footer>
          </> : <p role="status">正在加载充值套餐…</p>}
      </div>}
  </SettingsDialog>
}

function PaymentView({ payment, onBack, onPaid }: { payment: Payment; onBack: () => void; onPaid: () => void }) {
  const { checkout, deadline } = payment
  const [qr, setQr] = useState('')
  const [qrError, setQrError] = useState(false)
  const [actualCredits, setActualCredits] = useState<number | string | null>(null)
  const [orderStatus, setOrderStatus] = useState('')
  const [statusError, setStatusError] = useState(false)
  const [now, setNow] = useState(Date.now)
  const paid = useRef(onPaid)
  paid.current = onPaid
  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout>
    let failures = 0
    void QRCode.toDataURL(checkout.codeUrl, { width: 240, margin: 2 }).then(url => {
      if (active) setQr(url)
    }).catch(() => { if (active) setQrError(true) })
    const poll = async () => {
      try {
        const order = await getCloudPaymentOrder(checkout.orderId)
        if (!active) return
        failures = 0
        setActualCredits(order.credits)
        setStatusError(false)
        if (order.status === 'PAID') { paid.current(); return }
        if (['CLOSED', 'FAILED', 'REFUNDED', 'EXPIRED', 'CANCELLED'].includes(order.status)) {
          setOrderStatus(order.status)
          return
        }
      } catch {
        if (active && ++failures >= 3) setStatusError(true)
      }
      if (active) timer = setTimeout(() => void poll(), 2500)
    }
    void poll()
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => { active = false; clearTimeout(timer); clearInterval(tick) }
  }, [checkout])
  const seconds = deadline === null ? null : Math.max(0, Math.ceil((deadline - now) / 1000))
  const expired = seconds === 0 || !!orderStatus
  const method = checkout.gateway === 'WECHAT' ? '微信' : '支付宝'
  const countdown = seconds === null ? '' : `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
  return <section className="billing-qr" aria-label="订单支付">
    <h3>{method}扫码支付</h3>
    <strong className="billing-amount">{money(checkout.amountFen)}</strong>
    <p>{actualCredits === null ? '预计到账' : '到账'} {formatCredits(actualCredits ?? payment.credits)} 积分</p>
    {expired ? <p role="status">订单已失效，可返回重新充值。</p> : qrError ? <p role="alert">二维码生成失败，请返回重试。</p> :
      qr ? <img src={qr} width="216" height="216" alt={`${method}支付二维码`} /> : <p role="status">正在生成二维码…</p>}
    {!expired && countdown ? <p className="billing-countdown">剩余 {countdown}</p> : null}
    {statusError ? <p role="status">暂时无法查询支付状态，仍在重试。</p> : null}
    <button type="button" onClick={onBack}>返回充值</button>
  </section>
}
