import fetch from 'node-fetch'
import mime from 'mime-types'

// #terabox / #tb / #teraboxdl — descarga archivos de enlaces compartidos de TeraBox.
// 1) TeraBox nativo (sin key): nombre, tamaño y lista de archivos. Si existe la variable
//    TERABOX_COOKIE (cookie "ndus" de una cuenta TeraBox), también saca el link directo.
// 2) Link directo por APIs de respaldo (con timeout): TERABOX_API_URL (propia, opcional),
//    Alyacore (global.api), Deline, NexRay y PlayerTera. Si todas fallan se manda la info
//    con el enlace original.

const FALLBACK_KEY = 'LUFFY-FIX67'
const MAX_SEND = 90 * 1024 * 1024 // misma regla que #apk: más de 90 MB solo info + link
const MAX_LIST = 10
const UA_WEB = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36'
const TB_HOST = 'https://www.terabox.app'
const TB_PARAMS = 'app_id=250528&web=1&channel=dubox&clienttype=0'

const HOSTS_RE = /^(?:[a-z0-9-]+\.)*(?:terabox|1024terabox|teraboxapp|4funbox|mirrobox|nephobox|freeterabox|teraboxlink|terasharelink|teraboxshare|terafileshare|terasharefile|1024tera|momerybox|tibibox)\.(?:com|app|co|fun|link)$/i
const VIDEO_EXT = ['mp4', 'm4v', 'mov', '3gp']
const DEAD_ERRNO = [-9, 105, 112, 115, 117, 145]

function getKey() {
  let key = (typeof api !== 'undefined' && api?.key ? String(api.key) : '').trim()
  if (!key || key === 'TU-API-KEY' || key === 'undefined') key = FALLBACK_KEY
  return key
}

function getBase() {
  return (typeof api !== 'undefined' && api?.url ? String(api.url) : 'https://api.alyacore.xyz').replace(/\/$/, '')
}

export function formatSize(bytes) {
  const n = Number(bytes)
  if (!Number.isFinite(n) || n <= 0) return '?'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let v = n
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(i ? 2 : 0)} ${u[i]}`
}

function parseSizeToBytes(size) {
  if (typeof size === 'number' && Number.isFinite(size)) return size
  const s = String(size || '').trim().toUpperCase().replace(',', '.')
  if (/^\d+$/.test(s)) return Number(s)
  const m = s.match(/^([\d.]+)\s*(B|KB|MB|GB|TB)?/)
  if (!m) return 0
  const mult = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 }
  return Math.round(Number(m[1]) * (mult[m[2] || 'B'] || 1)) || 0
}

// Devuelve { url, surl } donde surl es el id SIN el "1" inicial (formato ?surl=)
export function parseTeraLink(text) {
  const raw = String(text || '').match(/https?:\/\/[^\s<>"']+/i)?.[0]
  if (!raw) return null
  let u
  try { u = new URL(raw) } catch { return null }
  if (!HOSTS_RE.test(u.hostname)) return null
  let surl = u.searchParams.get('surl')
  if (!surl) {
    const s = u.pathname.match(/\/s\/([A-Za-z0-9_-]{6,})/)
    if (s) surl = s[1].startsWith('1') ? s[1].slice(1) : s[1]
  }
  if (!surl || !/^[A-Za-z0-9_-]{6,}$/.test(surl)) return null
  return { url: raw, surl }
}

function cookieHeader(res, prev = '') {
  const jar = new Map(prev.split(';').map(c => c.trim()).filter(Boolean).map(c => [c.split('=')[0], c]))
  for (const c of res.headers.raw()['set-cookie'] || []) {
    const kv = c.split(';')[0].trim()
    if (kv) jar.set(kv.split('=')[0], kv)
  }
  return [...jar.values()].join('; ')
}

async function getJson(url, opts = {}) {
  const res = await fetch(url, { timeout: 25000, ...opts, headers: { 'User-Agent': UA_WEB, Accept: 'application/json, text/plain, */*', ...(opts.headers || {}) } })
  const txt = await res.text()
  let json = null
  try { json = JSON.parse(txt) } catch {}
  if (!json) throw new Error(`HTTP ${res.status} (sin JSON)`)
  return { res, json }
}

// ---------- TeraBox nativo ----------
async function teraNative(surl) {
  const userCookie = (process.env.TERABOX_COOKIE || '').trim()
  const ndus = userCookie ? (userCookie.includes('ndus=') ? userCookie : `ndus=${userCookie}`) : ''
  const pageUrl = `${TB_HOST}/sharing/link?surl=${surl}`
  const page = await fetch(pageUrl, { headers: { 'User-Agent': UA_WEB, ...(ndus ? { Cookie: ndus } : {}) }, timeout: 25000 })
  let cookie = cookieHeader(page, ndus)
  const html = await page.text()
  let dec = html
  try { dec = decodeURIComponent(html) } catch {}
  const jsToken = dec.match(/fn\(\s*"([A-F0-9]{32,})"\s*\)/)?.[1] || ''
  if (!jsToken) throw new Error('TeraBox no devolvió jsToken')
  const headers = { Cookie: cookie, Referer: pageUrl }

  const { json: info } = await getJson(`${TB_HOST}/api/shorturlinfo?${TB_PARAMS}&jsToken=${jsToken}&shorturl=1${surl}&root=1`, { headers })
  if (info.errno !== 0) {
    const e = new Error(`TeraBox errno ${info.errno}${info.errmsg ? ` (${info.errmsg})` : ''}`)
    e.errno = info.errno
    throw e
  }

  const listDir = async (dir) => {
    const q = dir ? `&dir=${encodeURIComponent(dir)}` : '&root=1'
    const { json } = await getJson(`${TB_HOST}/share/list?${TB_PARAMS}&jsToken=${jsToken}&shorturl=${surl}${q}&page=1&num=100&order=name&desc=0`, { headers })
    if (json.errno !== 0) throw new Error(`TeraBox share/list errno ${json.errno}`)
    return json.list || []
  }

  let list = await listDir('')
  // Expande carpetas (un nivel) para poder listar sus archivos
  const out = []
  for (const it of list) {
    if (String(it.isdir) === '1') {
      try { out.push(...(await listDir(it.path)).filter(x => String(x.isdir) !== '1')) } catch {}
    } else out.push(it)
    if (out.length >= 50) break
  }

  const files = out.map(f => ({
    name: f.server_filename || String(f.path || '').split('/').pop() || 'archivo',
    bytes: Number(f.size) || 0,
    fsId: String(f.fs_id || ''),
    link: f.dlink || '',
    thumb: f.thumbs?.url3 || f.thumbs?.url2 || f.thumbs?.url1 || ''
  }))

  // Con cookie de cuenta: intenta pedir dlink si share/list no lo trajo
  if (ndus && files.some(f => !f.link && f.fsId)) {
    try {
      const need = files.filter(f => !f.link && f.fsId).slice(0, MAX_LIST)
      const qs = new URLSearchParams({
        app_id: '250528', web: '1', channel: 'dubox', clienttype: '0', jsToken,
        shareid: String(info.shareid), uk: String(info.uk), sign: info.sign, timestamp: String(info.timestamp),
        primaryid: String(info.shareid), product: 'share', nozip: '0', type: 'nolimit',
        fid_list: `[${need.map(f => f.fsId).join(',')}]`,
        extra: JSON.stringify({ sekey: decodeURIComponent(info.randsk || '') })
      })
      const { json } = await getJson(`${TB_HOST}/share/download?${qs}`, { headers })
      if (json.errno === 0) {
        const dl = json.list || (json.dlink ? [{ fs_id: need[0].fsId, dlink: json.dlink }] : [])
        for (const d of dl) {
          const f = files.find(x => x.fsId === String(d.fs_id))
          if (f && d.dlink) f.link = d.dlink
        }
      }
    } catch (e) {
      console.error('[terabox] share/download', e?.message || e)
    }
  }
  // Los dlink de TeraBox piden la cookie: se sigue la redirección para dar el link del CDN
  if (ndus) {
    for (const f of files.slice(0, MAX_LIST)) {
      if (!f.link) continue
      try {
        const r = await fetch(f.link, { method: 'HEAD', redirect: 'manual', headers: { 'User-Agent': UA_WEB, Cookie: cookie }, timeout: 15000 })
        const loc = r.headers.get('location')
        if (loc) f.link = loc
      } catch {}
    }
  }

  return { source: ndus ? 'TeraBox (cookie)' : 'TeraBox', title: files[0]?.name || '', files }
}

// ---------- APIs de respaldo (solo para conseguir el link directo) ----------
function normalizeApi(json) {
  let arr = json?.result ?? json?.data ?? json?.list ?? json?.files ?? json
  if (arr && !Array.isArray(arr)) arr = arr.files || arr.list || arr.data || arr.result || [arr]
  if (!Array.isArray(arr)) return []
  return arr.map(f => {
    if (!f || typeof f !== 'object') return null
    const link = f.direct_link || f.dlink || f.download || f.downloadLink || f.download_link || f.fast_download || f.url || f.link || ''
    if (!/^https?:\/\//i.test(String(link))) return null
    return {
      name: f.server_filename || f.filename || f.file_name || f.name || f.title || 'archivo',
      bytes: parseSizeToBytes(f.size_bytes ?? f.sizebytes ?? f.size ?? f.filesize ?? f.formatted_size),
      link: String(link),
      thumb: f.thumb || f.thumbnail || f.thumbs?.url3 || ''
    }
  }).filter(Boolean)
}

function apiSources(url) {
  const e = encodeURIComponent(url)
  const list = []
  const custom = (process.env.TERABOX_API_URL || '').trim()
  if (custom) list.push({ name: 'TERABOX_API_URL', url: custom.includes('{url}') ? custom.replace('{url}', e) : `${custom}${custom.includes('?') ? '&' : '?'}url=${e}` })
  list.push({ name: 'Alyacore', url: `${getBase()}/dl/terabox?url=${e}&key=${encodeURIComponent(getKey())}` })
  list.push({ name: 'Deline', url: `https://api.deline.web.id/downloader/terabox?url=${e}` })
  list.push({ name: 'NexRay', url: `https://api.elrayyxml.web.id/api/downloader/terabox?url=${e}` })
  list.push({ name: 'PlayerTera', url: 'https://www.playertera.com/api/process-terabox', body: JSON.stringify({ url }) })
  return list
}

async function fromApis(url) {
  const errors = []
  for (const s of apiSources(url)) {
    try {
      const opts = s.body
        ? { method: 'POST', body: s.body, headers: { 'Content-Type': 'application/json', Origin: 'https://www.playertera.com', Referer: 'https://www.playertera.com/' } }
        : {}
      const { json } = await getJson(s.url, { ...opts, timeout: 30000 })
      if (json?.status === false || json?.success === false) throw new Error(json?.message || json?.error || json?.msg || 'status false')
      const files = normalizeApi(json)
      if (files.length) return { source: s.name, files }
      throw new Error('sin archivos')
    } catch (e) {
      errors.push(`${s.name}: ${e?.message || e}`)
    }
  }
  const err = new Error('Todas las APIs fallaron')
  err.details = errors
  throw err
}

export async function resolveTerabox(text) {
  const parsed = parseTeraLink(text)
  if (!parsed) return { invalid: true }
  const shareUrl = parsed.url
  let data = null
  const errors = []
  try {
    data = await teraNative(parsed.surl)
  } catch (e) {
    errors.push(`TeraBox: ${e?.message || e}`)
    // errno de enlace inexistente / expirado / cancelado
    if (DEAD_ERRNO.includes(e?.errno)) return { notFound: true, shareUrl, errors }
  }
  if (!data || data.files.some(f => !f.link)) {
    try {
      const api = await fromApis(parsed.url)
      if (!data) data = { ...api, title: api.files[0]?.name || '' }
      else {
        for (const f of data.files) {
          if (f.link) continue
          const hit = api.files.find(a => a.name === f.name) || (data.files.length === 1 ? api.files[0] : null)
          if (hit) f.link = hit.link
        }
        data.source += ` + ${api.source}`
      }
    } catch (e) {
      errors.push(...(e.details || [e?.message || String(e)]))
    }
  }
  if (!data || !data.files.length) return { failed: true, shareUrl, errors }
  return { ...data, shareUrl, errors }
}

function extOf(name) {
  return (String(name).split('.').pop() || '').toLowerCase().trim()
}

async function downloadBuffer(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA_WEB }, timeout: 180000 })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const len = Number(res.headers.get('content-length'))
  if (len && len > MAX_SEND) throw new Error(`TOO_HEAVY:${len}`)
  const buf = await res.buffer()
  if (buf.length > MAX_SEND) throw new Error(`TOO_HEAVY:${buf.length}`)
  if (buf.length < 1024 && /text\/html|application\/json/i.test(res.headers.get('content-type') || '')) throw new Error('El link no devolvió un archivo')
  return buf
}

function buildInfo(data) {
  const files = data.files.slice(0, MAX_LIST)
  let t = `ㅤ۟∩　ׅ　★ ໌　ׅ　🅣 🅔rabox　ᰙ\n\n`
  if (files.length === 1) {
    const f = files[0]
    t += `𖣣ֶㅤ֯⌗ ★ ⬭ Archivo: *${f.name}*\n`
    t += `𖣣ֶㅤ֯⌗ ✿ ⬭ Tamaño: *${formatSize(f.bytes)}*\n`
    t += `𖣣ֶㅤ֯⌗ ❍ ⬭ Link directo: ${f.link || 'no disponible (usa el enlace original)'}\n`
  } else {
    t += `𖣣ֶㅤ֯⌗ ★ ⬭ Archivos: *${data.files.length}*${data.files.length > MAX_LIST ? ` (mostrando ${MAX_LIST})` : ''}\n\n`
    files.forEach((f, i) => {
      t += `*${i + 1}.* ${f.name}\n   ✿ ${formatSize(f.bytes)}\n   ❍ ${f.link || 'sin link directo'}\n`
    })
  }
  t += `𖣣ֶㅤ֯⌗ ☄︎ ⬭ Enlace: ${data.shareUrl}`
  return t
}

export default {
  command: ['terabox', 'tb', 'teraboxdl'],
  category: 'downloader',
  description: 'Descarga archivos de TeraBox.',
  run: async ({ msg, sock, args, usedPrefix, command }) => {
    const p = usedPrefix || '#'
    const text = args.join(' ').trim()
    if (!text) {
      return msg.reply(`✎ Ingresa un enlace de *TeraBox*.\n> Ejemplo: *${p}${command || 'terabox'} https://1024terabox.com/s/...*`)
    }
    if (!parseTeraLink(text)) {
      return msg.reply('✿ El enlace no parece *válido*. Usa un link de TeraBox (terabox.com, 1024terabox.com, teraboxapp.com, terabox.app…) con /s/… o ?surl=…')
    }

    try {
      await msg.react('🕒').catch(() => {})
      await msg.reply('✎ Descargando información de TeraBox...')

      const data = await resolveTerabox(text)
      if (data.notFound) {
        await msg.react('✖️').catch(() => {})
        return msg.reply(`《✧》 El enlace de TeraBox no existe, *expiró* o fue eliminado.\n${data.shareUrl}`)
      }
      if (data.failed) {
        console.error('[terabox]', data.errors)
        await msg.react('✖️').catch(() => {})
        return msg.reply(`《✧》 No pude obtener el archivo de TeraBox. Todas las fuentes fallaron, intenta más tarde.\n${data.shareUrl}`)
      }
      if (data.errors?.length) console.error('[terabox] avisos:', data.errors)

      const info = buildInfo(data)
      const first = data.files.find(f => f.link && f.bytes && f.bytes <= MAX_SEND) ||
        data.files.find(f => f.link && !f.bytes)

      if (!first) {
        const extra = data.files.some(f => f.link)
          ? `\n\n✎ Pesa más de *90 MB*: no lo subo por WhatsApp (se cuelga). Abre el *link directo* en el navegador.`
          : `\n\n✎ No pude generar el *link directo* (TeraBox pide iniciar sesión y las APIs de respaldo fallaron). Abre el enlace original en el navegador o en la app de TeraBox.`
        await msg.react('✔️').catch(() => {})
        return msg.reply(info + extra)
      }

      await msg.reply(info + `\n\n✎ Enviando *${first.name}* (${formatSize(first.bytes)})...`)
      try {
        const buf = await downloadBuffer(first.link)
        const ext = extOf(first.name)
        const caption = `★ ${first.name}\n✿ ${formatSize(buf.length)}\n❍ ${first.link}`
        if (VIDEO_EXT.includes(ext)) {
          await sock.sendMessage(msg.chat, { video: buf, mimetype: 'video/mp4', caption, fileName: first.name }, { quoted: msg })
        } else {
          await sock.sendMessage(msg.chat, {
            document: buf,
            mimetype: mime.lookup(first.name) || 'application/octet-stream',
            fileName: first.name,
            caption
          }, { quoted: msg })
        }
        await msg.react('✔️').catch(() => {})
      } catch (e) {
        console.error('[terabox] send', e?.message || e)
        const m = String(e?.message || e)
        await msg.react('✖️').catch(() => {})
        if (m.startsWith('TOO_HEAVY:')) {
          return msg.reply(`《✧》 El archivo pesa *${formatSize(Number(m.split(':')[1]))}*, más de 90 MB: no lo subo por WhatsApp.\nDescárgalo aquí:\n${first.link}`)
        }
        return msg.reply(`《✧》 No pude enviar el archivo por WhatsApp.\nDescárgalo aquí:\n${first.link}`)
      }
    } catch (e) {
      console.error('[terabox]', e)
      await msg.react('✖️').catch(() => {})
      await msg.reply(`《✧》 Error: ${e?.message || e}`).catch(() => {})
    }
  }
}
