export async function onRequestPost(context: {
  request: Request
  env: { REMOVE_BG_API_KEY?: string }
}) {
  const formData = await context.request.formData()
  const image = formData.get('image')

  if (!(image instanceof File)) {
    return Response.json({ error: '请先上传图片。' }, { status: 400 })
  }

  const apiKey = context.env.REMOVE_BG_API_KEY
  if (!apiKey) {
    return Response.json({ error: '服务器未配置 Remove.bg API Key。' }, { status: 500 })
  }

  const upstream = new FormData()
  upstream.append('image_file', image, image.name)
  upstream.append('size', 'auto')
  upstream.append('format', 'png')

  const response = await fetch('https://api.remove.bg/v1.0/removebg', {
    method: 'POST',
    headers: {
      'X-Api-Key': apiKey,
    },
    body: upstream,
  })

  if (!response.ok) {
    const message = await response.text().catch(() => '')
    return Response.json(
      { error: message || 'Remove.bg 返回错误，请稍后重试。' },
      { status: response.status }
    )
  }

  const buffer = await response.arrayBuffer()
  return new Response(buffer, {
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': `attachment; filename="${image.name.replace(/\.[^.]+$/, '')}-no-bg.png"`,
    },
  })
}

export function onRequestGet() {
  return Response.json({ error: 'Method not allowed' }, { status: 405 })
}
