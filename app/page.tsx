'use client'

import Image from 'next/image'
import { useEffect, useMemo, useState } from 'react'

const MAX_SIZE = 12 * 1024 * 1024
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

interface CurrentUser {
  id: number
  email?: string
  name?: string
  avatar_url?: string
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null)
  const [sourceUrl, setSourceUrl] = useState('')
  const [resultUrl, setResultUrl] = useState('')
  const [resultBlobUrl, setResultBlobUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [previewMode, setPreviewMode] = useState<'light' | 'dark'>('light')
  const [dragActive, setDragActive] = useState(false)
  const [user, setUser] = useState<CurrentUser | null>(null)

  const canProcess = !!file && !loading

  const fileLabel = useMemo(() => {
    if (!file) return '未选择文件'
    return `${file.name} · ${formatBytes(file.size)}`
  }, [file])

  useEffect(() => {
    fetch('/api/auth/me')
      .then((response) => response.json())
      .then((payload) => setUser(payload.user || null))
      .catch(() => setUser(null))
  }, [])

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    setUser(null)
  }

  async function onFileSelect(nextFile: File | null) {
    setError('')
    setResultUrl('')
    setResultBlobUrl('')
    if (!nextFile) {
      setFile(null)
      setSourceUrl('')
      return
    }
    if (!ACCEPTED_TYPES.includes(nextFile.type)) {
      setError('文件格式不支持，请上传 JPG、PNG 或 WEBP。')
      return
    }
    if (nextFile.size > MAX_SIZE) {
      setError('文件过大，请压缩后重试。')
      return
    }
    setFile(nextFile)
    setSourceUrl(URL.createObjectURL(nextFile))
  }

  async function handleProcess() {
    if (!file) return
    setLoading(true)
    setError('')
    setResultUrl('')
    setResultBlobUrl('')
    try {
      const formData = new FormData()
      formData.append('image', file)
      const response = await fetch('/api/remove-bg', {
        method: 'POST',
        body: formData,
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.error || '处理失败，请稍后重试。')
      }
      const blob = await response.blob()
      const blobUrl = URL.createObjectURL(blob)
      setResultBlobUrl(blobUrl)
      setResultUrl(blobUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : '网络请求失败，请重新尝试。')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className='min-h-screen bg-slate-950 text-slate-100'>
      <div className='mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8'>
        <header className='flex flex-col gap-4 border-b border-slate-800 pb-4 sm:flex-row sm:items-center sm:justify-between'>
          <div>
            <h1 className='text-2xl font-semibold tracking-tight'>Image Background Remover</h1>
            <p className='mt-2 max-w-2xl text-sm text-slate-400'>上传一张图片，自动去背景，马上预览并下载透明 PNG。</p>
          </div>
          <div className='flex items-center gap-3'>
            {user ? (
              <>
                <span className='max-w-[220px] truncate text-sm text-slate-300'>{user.name || user.email || '已登录'}</span>
                <button className='rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:border-slate-500' onClick={handleLogout}>
                  退出
                </button>
              </>
            ) : (
              <a className='rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:border-slate-500' href='/api/auth/login'>
                Google 登录
              </a>
            )}
          </div>
        </header>

        <section className='grid gap-6 lg:grid-cols-[1.1fr_0.9fr]'>
          <div className='space-y-4'>
            <label
              className={[
                'flex cursor-pointer flex-col gap-4 rounded-lg border border-dashed bg-slate-900/60 p-6 transition',
                dragActive ? 'border-sky-400' : 'border-slate-700 hover:border-sky-500',
              ].join(' ')}
              onDragOver={(e) => {
                e.preventDefault()
                setDragActive(true)
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragActive(false)
                onFileSelect(e.dataTransfer.files?.[0] ?? null)
              }}
            >
              <input
                className='hidden'
                type='file'
                accept='image/jpeg,image/png,image/webp'
                onChange={(e) => onFileSelect(e.target.files?.[0] ?? null)}
              />
              <div>
                <div className='text-sm font-medium text-slate-200'>拖拽图片到这里，或点击选择文件</div>
                <div className='mt-1 text-xs text-slate-400'>支持 JPG、PNG、WEBP，最大 12MB。</div>
              </div>
              <div className='rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-300'>{fileLabel}</div>
            </label>

            <div className='flex flex-wrap items-center gap-3'>
              <button
                className='rounded-md bg-sky-500 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-700'
                onClick={handleProcess}
                disabled={!canProcess}
              >
                {loading ? '处理中...' : '开始处理'}
              </button>
              <label className='inline-flex items-center gap-2 text-sm text-slate-300'>
                <input
                  type='radio'
                  name='previewMode'
                  checked={previewMode === 'light'}
                  onChange={() => setPreviewMode('light')}
                />
                浅色背景
              </label>
              <label className='inline-flex items-center gap-2 text-sm text-slate-300'>
                <input
                  type='radio'
                  name='previewMode'
                  checked={previewMode === 'dark'}
                  onChange={() => setPreviewMode('dark')}
                />
                深色背景
              </label>
            </div>

            {error ? <p className='rounded-md border border-rose-900 bg-rose-950/60 px-4 py-3 text-sm text-rose-200'>{error}</p> : null}

            <div className='grid gap-4 sm:grid-cols-2'>
              <div className='rounded-lg border border-slate-800 bg-slate-900 p-4'>
                <div className='mb-3 text-sm font-medium text-slate-200'>原图</div>
                <div className='flex aspect-square items-center justify-center overflow-hidden rounded-md bg-slate-950'>
                  {sourceUrl ? (
                    <Image src={sourceUrl} alt='原图预览' width={640} height={640} unoptimized className='h-full w-full object-contain' />
                  ) : (
                    <span className='text-sm text-slate-500'>等待上传</span>
                  )}
                </div>
              </div>
              <div className='rounded-lg border border-slate-800 bg-slate-900 p-4'>
                <div className='mb-3 text-sm font-medium text-slate-200'>结果图</div>
                <div
                  className={
                    previewMode === 'dark'
                      ? 'flex aspect-square items-center justify-center overflow-hidden rounded-md bg-[url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAQCAYAAADNo/U5AAAAGUlEQVQYV2P8////fwYiYGJgYGBg+P///wMAEpwD/bY2yQAAAABJRU5ErkJggg==")] bg-[length:20px_20px]'
                      : 'flex aspect-square items-center justify-center overflow-hidden rounded-md bg-white'
                  }
                >
                  {resultUrl ? (
                    <Image src={resultUrl} alt='去背景结果' width={640} height={640} unoptimized className='h-full w-full object-contain' />
                  ) : (
                    <span className='text-sm text-slate-500'>处理后显示</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <aside className='rounded-lg border border-slate-800 bg-slate-900 p-5'>
            <div className='flex items-center justify-between gap-3 border-b border-slate-800 pb-3'>
              <h2 className='text-sm font-medium text-slate-200'>操作区</h2>
              <span className='text-xs text-slate-500'>单张图片</span>
            </div>
            <div className='mt-4 space-y-3 text-sm text-slate-300'>
              <p>1. 选择图片</p>
              <p>2. 点击开始处理</p>
              <p>3. 下载 PNG</p>
            </div>
            <div className='mt-6 rounded-md border border-slate-800 bg-slate-950 p-4 text-sm text-slate-300'>
              <div className='mb-2 font-medium text-slate-200'>下载</div>
              <a
                className='inline-flex rounded-md bg-emerald-500 px-4 py-2 font-medium text-white disabled:pointer-events-none disabled:bg-slate-700'
                href={resultBlobUrl || undefined}
                download={file ? `${file.name.replace(/\.[^.]+$/, '')}-no-bg.png` : 'result.png'}
                aria-disabled={!resultBlobUrl}
              >
                下载 PNG
              </a>
            </div>
          </aside>
        </section>
      </div>
    </main>
  )
}
