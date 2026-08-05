'use client'

import { useEffect, useState } from 'react'

export default function PaymentSuccessClient() {
  const [state, setState] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('正在确认 PayPal 订阅...')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const subscriptionId = params.get('subscription_id') || params.get('subscriptionId')

    if (!subscriptionId) {
      setState('success')
      setMessage('订阅已提交。PayPal 确认首期付款后，本月额度会自动到账。')
      return
    }

    fetch('/api/paypal/sync-subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscriptionId }),
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => null)
        if (!response.ok) throw new Error(payload?.error || '订阅确认失败。')
        return payload
      })
      .then((payload) => {
        setState('success')
        if (payload.credits > 0) {
          setMessage(`订阅成功，${payload.credits} 次本月额度已到账。`)
        } else {
          setMessage('订阅已确认。本月额度如已到账，不会重复发放。')
        }
      })
      .catch((error) => {
        setState('error')
        setMessage(error instanceof Error ? error.message : '订阅确认失败，请稍后重试。')
      })
  }, [])

  return (
    <main className='flex min-h-screen items-center bg-slate-950 px-4 text-slate-100'>
      <section className='mx-auto w-full max-w-lg rounded-lg border border-slate-800 bg-slate-900 p-6 text-center'>
        <p className={state === 'error' ? 'text-rose-300' : 'text-slate-200'}>{message}</p>
        <div className='mt-6 flex justify-center gap-3'>
          <a className='rounded-md bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-400' href={state === 'success' ? '/' : '/pricing'}>
            {state === 'success' ? '开始处理图片' : '返回定价页'}
          </a>
        </div>
      </section>
    </main>
  )
}
