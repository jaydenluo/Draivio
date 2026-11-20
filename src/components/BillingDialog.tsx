import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { SettingsDialog } from './SettingsDialog'
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
          <div><span>{account.user?.email}</span><strong>当前余额：{formatCredits(liveBalance ?? overview?.balance ?? account.balance ?? '—')} 积分</strong></div>
          <button type="button" disabled={refreshing} onClick={() => void refresh()}>{refreshing ? '刷新中…' : '刷新余额'}</button>
        </div>
        {loadError ? <div className="billing-error"><p role="alert">{loadError}</p><button type="button" onClick={() => setLoadAttempt(value => value + 1)}>重试</button></div> :
          catalog ? <>
            <fieldset className="billing-products" disabled={creating}>
              <legend>选择充值套餐</legend>
              {catalog.overview.products.map(item => <label key={item.id} className={selected === item.id ? 'selected' : ''}>
                <input type="radio" name="billing-product" checked={selected === item.id} onChange={() => setSelected(item.id)} />
                <span className="billing-product-info"><strong>{item.title}</strong>
                  <small>基础 {formatCredits(item.credits)}{item.bonusCredits > 0 ? ` + 赠送 ${formatCredits(item.bonusCredits)}` : ''}</small>
                </span>
                <span className="billing-product-price"><strong>{money(item.priceFen)}</strong>
                  {item.priceFen > 0 ? <small>{formatCredits((item.credits + item.bonusCredits) * 100 / item.priceFen)} 积分 / 元</small> : null}
                </span>
              </label>)}
              {rate ? <>
                <label className={custom ? 'selected' : ''}>
                  <input type="radio" name="billing-product" checked={custom} onChange={() => setSelected('custom')} />
                  <strong>自定义金额</strong><small>{formatCredits(rate)} 积分 / 元</small>
                </label>
                {custom ? <div className="billing-custom">
                  <label>金额（元） <input aria-label="充值金额" type="number" min="1" max="10000" step="1" value={amount} onChange={event => setAmount(event.target.value)} /></label>
                  <output aria-live="polite">{credits === null ? '请输入 1–10000 元的整数' : `预计到账 ${formatCredits(credits)} 积分`}</output>
                </div> : null}
              </> : null}
            </fieldset>
            {!catalog.overview.products.length && !rate ? <p className="billing-muted">暂没有可用的充值套餐</p> : null}
            <div className="billing-gateways" role="group" aria-label="支付方式">
              <button type="button" aria-pressed={gateway === 'WECHAT'} disabled={!catalog.methods.wechat || creating} onClick={() => setGateway('WECHAT')}>微信支付</button>
              <button type="button" aria-pressed={gateway === 'ALIPAY'} disabled={!catalog.methods.alipay || creating} onClick={() => setGateway('ALIPAY')}>支付宝</button>
            </div>
            {!enabled ? <p className="billing-muted">当前没有可用支付渠道</p> : null}
            {orderError ? <p role="alert" className="billing-error">{orderError}</p> : null}
            <footer><button type="button" className="billing-pay" disabled={creating || price === null || !enabled} onClick={() => void pay()}>
              {creating ? '创建订单中…' : price === null ? '支付' : `支付 ${money(price)}`}
            </button></footer>
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
