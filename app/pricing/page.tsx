import PricingClient from './PricingClient'

export default function PricingPage() {
  return (
    <main className='min-h-screen bg-slate-950 text-slate-100'>
      <div className='mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8'>
        <header className='flex flex-col gap-4 border-b border-slate-800 pb-4 sm:flex-row sm:items-center sm:justify-between'>
          <div>
            <a className='text-sm text-slate-400 hover:text-slate-200' href='/'>
              返回工具
            </a>
            <h1 className='mt-3 text-2xl font-semibold tracking-tight'>定价套餐</h1>
            <p className='mt-2 max-w-2xl text-sm text-slate-400'>按月订阅，额度每个已付款周期发放一次。每成功返回一张高清去背景 PNG，消耗 1 次额度。</p>
          </div>
          <a className='w-fit rounded-md bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-400' href='/api/auth/login'>
            登录后订阅
          </a>
        </header>

        <PricingClient />

        <section className='grid gap-4 border-t border-slate-800 pt-6 md:grid-cols-3'>
          <div>
            <h2 className='text-sm font-medium text-slate-200'>计费口径</h2>
            <p className='mt-2 text-sm leading-6 text-slate-400'>每成功处理并返回一张高清透明 PNG，消耗 1 次额度。</p>
          </div>
          <div>
            <h2 className='text-sm font-medium text-slate-200'>支付方式</h2>
            <p className='mt-2 text-sm leading-6 text-slate-400'>当前接入 PayPal 沙盒环境，收款币种为 USD，正式上线前可切换为 PayPal Live。</p>
          </div>
          <div>
            <h2 className='text-sm font-medium text-slate-200'>额度周期</h2>
            <p className='mt-2 text-sm leading-6 text-slate-400'>Starter 和 Creator 的额度按月发放，本周期未使用完的次数会在周期结束时失效。</p>
          </div>
        </section>
      </div>
    </main>
  )
}
