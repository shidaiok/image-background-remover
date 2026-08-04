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
            <p className='mt-2 max-w-2xl text-sm text-slate-400'>一次性购买月度额度，按每张高清去背景计费。购买成功后额度立即到账。</p>
          </div>
          <a className='w-fit rounded-md bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-400' href='/api/auth/login'>
            登录后购买
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
            <p className='mt-2 text-sm leading-6 text-slate-400'>当前接入 PayPal 沙盒环境，支持 USD 一次性支付。</p>
          </div>
          <div>
            <h2 className='text-sm font-medium text-slate-200'>图片策略</h2>
            <p className='mt-2 text-sm leading-6 text-slate-400'>图片仅在处理请求中传递，不做云端保存，结果由用户自行下载。</p>
          </div>
        </section>
      </div>
    </main>
  )
}
