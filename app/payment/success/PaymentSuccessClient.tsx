'use client'

import { useEffect, useState } from 'react'

export default function PaymentSuccessClient() {
  const [state, setState] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('正在确认 PayPal 支付...')

  useEffect(() => {
    const orderId = new URLSearchParams(window.location.search).get('token')
    if (!orderId) {
      setState('error')
      setMessage('未找到 PayPal 订单号，请返回定价页重新发起支付。')
      return
    }

    fetch('/api/paypal/capture-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId }),
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => null)
        if (!response.ok) throw new Error(payload?.error || '支付确认失败。')
        return payload
      })
      .then((payload) => {
        setState('success')
        setMessage(payload.alreadyCaptured ? '订单已确认，额度已在账户中。' : `支付成功，${payload.credits} 次额度已到账。`)
      })
      .catch((error) => {
        setState('error')
        setMessage(error instanceof Error ? error.message : '支付确认失败，请稍后重试。')
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
