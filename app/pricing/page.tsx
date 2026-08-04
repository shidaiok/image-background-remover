const plans = [
  {
    name: '免费体验',
    price: '$0',
    unit: '',
    credits: '1 张高清去背景',
    description: '适合第一次试用，确认效果后再升级。',
    cta: '免费开始',
    href: '/api/auth/login',
    featured: false,
    features: ['Google 登录后领取', '支持 JPG、PNG、WEBP', '透明 PNG 下载', '不保存上传图片'],
  },
  {
    name: 'Starter',
    price: '$4.99',
    unit: '/ 月',
    credits: '每月 15 张高清去背景',
    description: '适合偶尔处理头像、证件照和日常素材。',
    cta: '选择 Starter',
    href: '/api/auth/login',
    featured: false,
    features: ['约 $0.33 / 张', '浅色/深色预览', '高清 PNG 导出', '适合个人轻度使用'],
  },
  {
    name: 'Creator',
    price: '$12.99',
    unit: '/ 月',
    credits: '每月 50 张高清去背景',
    description: '适合内容创作者、轻量电商和稳定素材处理。',
    cta: '选择 Creator',
    href: '/api/auth/login',
    featured: true,
    features: ['约 $0.26 / 张', '更高月度额度', '适合商品图和社媒素材', '优先推荐升级方案'],
  },
]

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
            <p className='mt-2 max-w-2xl text-sm text-slate-400'>按每张高清去背景计费，当前先开放三档套餐，适合验证真实使用需求。</p>
          </div>
          <a className='w-fit rounded-md bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-400' href='/api/auth/login'>
            登录后使用
          </a>
        </header>

        <section className='grid gap-4 lg:grid-cols-3'>
          {plans.map((plan) => (
            <article
              className={[
                'relative flex min-h-[520px] flex-col rounded-lg border bg-slate-900 p-5',
                plan.featured ? 'border-sky-400 shadow-[0_0_0_1px_rgba(56,189,248,0.25)]' : 'border-slate-800',
              ].join(' ')}
              key={plan.name}
            >
              {plan.featured ? (
                <div className='absolute right-5 top-5 rounded-full bg-sky-400 px-3 py-1 text-xs font-semibold text-slate-950'>推荐</div>
              ) : null}

              <div className='border-b border-slate-800 pb-5'>
                <h2 className='text-xl font-semibold text-slate-100'>{plan.name}</h2>
                <p className='mt-4 text-sm font-medium text-slate-300'>{plan.credits}</p>
                <div className='mt-8 flex items-end gap-2'>
                  <span className='text-4xl font-semibold tracking-tight'>{plan.price}</span>
                  {plan.unit ? <span className='pb-1 text-sm text-slate-400'>{plan.unit}</span> : null}
                </div>
                <p className='mt-4 min-h-[44px] text-sm leading-6 text-slate-400'>{plan.description}</p>
              </div>

              <ul className='mt-5 flex-1 space-y-3 text-sm text-slate-300'>
                {plan.features.map((feature) => (
                  <li className='flex gap-2' key={feature}>
                    <span className='mt-1 h-2 w-2 rounded-full bg-emerald-400' />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <a
                className={[
                  'mt-6 inline-flex h-11 items-center justify-center rounded-md px-4 text-sm font-medium',
                  plan.featured ? 'bg-sky-500 text-white hover:bg-sky-400' : 'border border-slate-700 text-slate-100 hover:border-slate-500',
                ].join(' ')}
                href={plan.href}
              >
                {plan.cta}
              </a>
            </article>
          ))}
        </section>

        <section className='grid gap-4 border-t border-slate-800 pt-6 md:grid-cols-3'>
          <div>
            <h2 className='text-sm font-medium text-slate-200'>计费口径</h2>
            <p className='mt-2 text-sm leading-6 text-slate-400'>每成功处理并返回一张高清透明 PNG，消耗 1 次额度。</p>
          </div>
          <div>
            <h2 className='text-sm font-medium text-slate-200'>图片策略</h2>
            <p className='mt-2 text-sm leading-6 text-slate-400'>图片仅在处理请求中传递，不做云端保存，结果由用户自行下载。</p>
          </div>
          <div>
            <h2 className='text-sm font-medium text-slate-200'>后续升级</h2>
            <p className='mt-2 text-sm leading-6 text-slate-400'>先验证三档套餐需求，后续再根据真实用量增加更高额度方案。</p>
          </div>
        </section>
      </div>
    </main>
  )
}
