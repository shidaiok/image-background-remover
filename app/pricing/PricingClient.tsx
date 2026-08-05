'use client'

import { useState } from 'react'

type PlanId = 'starter' | 'creator'

const plans = [
  {
    name: '免费体验',
    price: '$0',
    unit: '',
    credits: '1 张高清去背景',
    description: '适合第一次试用，确认效果后再升级。',
    cta: '免费开始',
    planId: null,
    featured: false,
    features: ['Google 登录后领取', '支持 JPG、PNG、WEBP', '透明 PNG 下载', '不保存上传图片'],
  },
  {
    name: 'Starter',
    price: '$4.99',
    unit: '/ 月',
    credits: '每月 15 张高清去背景',
    description: '适合偶尔处理头像、证件照和日常素材。',
    cta: '订阅 Starter',
    planId: 'starter' as PlanId,
    featured: false,
    features: ['约 $0.33 / 张', '每月自动发放 15 次额度', '高清 PNG 导出', '适合个人轻度使用'],
  },
  {
    name: 'Creator',
    price: '$12.99',
    unit: '/ 月',
    credits: '每月 50 张高清去背景',
    description: '适合内容创作者、轻量电商和稳定素材处理。',
    cta: '订阅 Creator',
    planId: 'creator' as PlanId,
    featured: true,
    features: ['约 $0.26 / 张', '每月自动发放 50 次额度', '适合商品图和社媒素材', '优先推荐升级方案'],
  },
]

export default function PricingClient() {
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function buyPlan(planId: PlanId) {
    setError('')
    setLoadingPlan(planId)
    try {
      const response = await fetch('/api/paypal/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId }),
      })
      const payload = await response.json().catch(() => null)
      if (response.status === 401) {
        window.location.href = '/api/auth/login'
        return
      }
      if (!response.ok || !payload?.approveUrl) {
        throw new Error(payload?.error || '创建订阅失败。')
      }
      window.location.href = payload.approveUrl
    } catch (err) {
      setError(err instanceof Error ? err.message : '订阅请求失败，请稍后重试。')
      setLoadingPlan(null)
    }
  }

  return (
    <>
      {error ? <p className='rounded-md border border-rose-900 bg-rose-950/60 px-4 py-3 text-sm text-rose-200'>{error}</p> : null}

      <section className='grid gap-4 lg:grid-cols-3'>
        {plans.map((plan) => (
          <article
            className={[
              'relative flex min-h-[520px] flex-col rounded-lg border bg-slate-900 p-5',
              plan.featured ? 'border-sky-400 shadow-[0_0_0_1px_rgba(56,189,248,0.25)]' : 'border-slate-800',
            ].join(' ')}
            key={plan.name}
          >
            {plan.featured ? <div className='absolute right-5 top-5 rounded-full bg-sky-400 px-3 py-1 text-xs font-semibold text-slate-950'>推荐</div> : null}

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

            {plan.planId ? (
              <button
                className={[
                  'mt-6 inline-flex h-11 items-center justify-center rounded-md px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60',
                  plan.featured ? 'bg-sky-500 text-white hover:bg-sky-400' : 'border border-slate-700 text-slate-100 hover:border-slate-500',
                ].join(' ')}
                disabled={loadingPlan !== null}
                onClick={() => buyPlan(plan.planId)}
              >
                {loadingPlan === plan.planId ? '跳转订阅中...' : plan.cta}
              </button>
            ) : (
              <a className='mt-6 inline-flex h-11 items-center justify-center rounded-md border border-slate-700 px-4 text-sm font-medium text-slate-100 hover:border-slate-500' href='/api/auth/login'>
                {plan.cta}
              </a>
            )}
          </article>
        ))}
      </section>
    </>
  )
}
