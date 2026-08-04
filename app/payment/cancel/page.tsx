export default function PaymentCancelPage() {
  return (
    <main className='flex min-h-screen items-center bg-slate-950 px-4 text-slate-100'>
      <section className='mx-auto w-full max-w-lg rounded-lg border border-slate-800 bg-slate-900 p-6 text-center'>
        <h1 className='text-xl font-semibold'>已取消支付</h1>
        <p className='mt-3 text-sm leading-6 text-slate-400'>本次支付没有完成，账户额度不会变化。</p>
        <a className='mt-6 inline-flex rounded-md border border-slate-700 px-4 py-2 text-sm font-medium text-slate-100 hover:border-slate-500' href='/pricing'>
          返回定价页
        </a>
      </section>
    </main>
  )
}
