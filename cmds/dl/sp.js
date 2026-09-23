import fetch from 'node-fetch'
import { getBuffer } from '#serialize'

const FALLBACK_KEY = 'LUFFY-FIX67'

function getApiBase() {
  return (typeof api !== 'undefined' && api?.url
    ? String(api.url)
    : 'https://api.alyacore.xyz'
  ).replace(/\/$/, '')
}

function getApiKey() {
  let key = (typeof api !== 'undefined' && api?.key ? String(api.key) : '').trim()
  if (!key || key === 'TU-API-KEY' || key === 'undefined') key = FALLBACK_KEY
  return key
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 15; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      Accept: 'application/json'
    },
    timeout: 60000
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function downloadBuffer(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 15; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        Accept: '*/*'
      },
      timeout: 180000
    })
    if (!res.ok) throw new Error(`Descarga HTTP ${res.status}`)
    return Buffer.from(await res.arrayBuffer())
  } catch (e) {
    return getBuffer(url)
  }
}

async function spotifyDl(url, key) {
  const base = getApiBase()
  const keys = [key]
  if (key !== FALLBACK_KEY) keys.push(FALLBACK_KEY)
  for (const useKey of keys) {
    try {
      const apiUrl = `${base}/dl/spotify?url=${encodeURIComponent(url)}&key=${encodeURIComponent(useKey)}`
      const res = await fetchJson(apiUrl)
      if (res?.status && res?.data) return res.data
    } catch (e) {
      console.error('[sp] dl/spotify', e?.message || e)
    }
  }
  return null
}

async function spotifySearch(query, key) {
  const base = getApiBase()
  const keys = [key]
  if (key !== FALLBACK_KEY) keys.push(FALLBACK_KEY)
  for (const useKey of keys) {
    try {
      const apiUrl = `${base}/search/spotify?query=${encodeURIComponent(query)}&key=${encodeURIComponent(useKey)}`
      const res = await fetchJson(apiUrl)
      if (res?.status && Array.isArray(res.data) && res.data.length) return res.data
    } catch (e) {
      console.error('[sp] search/spotify', e?.message || e)
    }
  }
  return []
}

async function metaFromSpotifyPage(trackUrl) {
  try {
    const res = await fetch(trackUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 15; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        Accept: 'text/html'
      },
      timeout: 30000
    })
    if (!res.ok) return null
    const html = await res.text()
    const title = (html.match(/property="og:title" content="([^"]+)"/i) || [])[1]
      || (html.match(/"name":"([^"]+)"/) || [])[1]
    const image = (html.match(/property="og:image" content="([^"]+)"/i) || [])[1]
    const desc = (html.match(/property="og:description" content="([^"]+)"/i) || [])[1] || ''
    // "Song · Artist · Album" or similar
    let artist = ''
    const parts = desc.split(/[·•|]/).map((s) => s.trim()).filter(Boolean)
    if (parts.length >= 2) artist = parts[1]
    if (!title) return null
    return { title, artist, album: parts[2] || '', image, url: trackUrl, duration: '' }
  } catch (e) {
    console.error('[sp] page meta', e?.message || e)
    return null
  }
}

async function youtubeAudio(query, key) {
  const base = getApiBase()
  const keys = [key]
  if (key !== FALLBACK_KEY) keys.push(FALLBACK_KEY)
  const q = String(query || '').trim()
  if (!q) return null

  for (const useKey of keys) {
    for (const ep of ['youtubeplayv2', 'youtubeplay']) {
      try {
        const apiUrl = `${base}/dl/${ep}?query=${encodeURIComponent(q)}&type=mp3&quality=320&key=${encodeURIComponent(useKey)}`
        const res = await fetchJson(apiUrl)
        const dl = res?.data?.dl || res?.result?.dl || res?.dl
        if (res?.status && dl) {
          return {
            dl,
            title: res.data?.title || res.result?.title || q,
            fileName: res.data?.fileName || `${q}.mp3`,
            thumbnail: res.data?.thumbnail || res.data?.image || ''
          }
        }
      } catch (e) {
        console.error(`[sp] ${ep}`, e?.message || e)
      }
    }

    // search yt then ytmp3
    try {
      const searchUrl = `${base}/search/yt?query=${encodeURIComponent(q)}&key=${encodeURIComponent(useKey)}`
      const search = await fetchJson(searchUrl)
      const list = search?.result || search?.data || []
      const first = Array.isArray(list) && list[0]
      const ytUrl = first?.url
      if (ytUrl) {
        for (const ep of ['ytmp3v2', 'ytmp3']) {
          try {
            const apiUrl = `${base}/dl/${ep}?url=${encodeURIComponent(ytUrl)}&key=${encodeURIComponent(useKey)}`
            const res = await fetchJson(apiUrl)
            const dl = res?.data?.dl || res?.result?.dl || res?.dl
            if (res?.status && dl) {
              return {
                dl,
                title: res.data?.title || first.title || q,
                fileName: res.data?.fileName || `${q}.mp3`,
                thumbnail: first.banner || first.thumbnail || first.image || ''
              }
            }
          } catch (e) {
            console.error(`[sp] ${ep}`, e?.message || e)
          }
        }
      }
    } catch (e) {
      console.error('[sp] search/yt', e?.message || e)
    }
  }
  return null
}

function buildCaption(songInfo, url, viaYt) {
  const duracion = (!songInfo.duration || String(songInfo.duration).includes('NaN'))
    ? 'Desconocida'
    : (songInfo.duration || '')
  const via = viaYt ? '\n> ✿⃘࣪◌ ֪ Fuente › YouTube (fallback)' : ''
  return `➪ Descargando › ${songInfo.title || songInfo.name || 'cancion'}

> ✿⃘࣪◌ ֪ Artista › ${songInfo.artist || ''}
> ✿⃘࣪◌ ֪ Álbum › ${songInfo.album || ''}
> ✿⃘࣪◌ ֪ Fecha › ${songInfo.publish || songInfo.year || ''}
> ✿⃘࣪◌ ֪ Duración › ${duracion}${via}
> ✿⃘࣪◌ ֪ Enlace › ${url || ''}

𐙚 ❀ ｡ ↻ El archivo se está enviando, espera un momento... ˙𐙚`
}

export default {
  command: ['sp', 'spotify'],
  category: 'downloader',
  run: async ({ msg, sock, args }) => {
    try {
      if (!args[0]) {
        return msg.reply('✎ Por favor, menciona el nombre o URL de la canción que deseas descargar de Spotify')
      }

      const query = args.join(' ').trim()
      const key = getApiKey()
      let url = ''
      let songInfo = null
      let viaYt = false
      let audio = null

      const isSpotifyUrl = /open\.spotify\.com\/track\//i.test(query)

      if (isSpotifyUrl) {
        url = query.split(/\s+/)[0]
        const dlData = await spotifyDl(url, key)
        if (dlData?.dl || dlData?.title || dlData?.name) {
          songInfo = dlData
          if (dlData.dl) audio = { dl: dlData.dl, title: dlData.title || dlData.name, fileName: `${dlData.title || 'music'}.mp3` }
        }
        if (!songInfo) {
          const pageMeta = await metaFromSpotifyPage(url)
          if (pageMeta) songInfo = pageMeta
        }
        if (!songInfo) {
          // last resort: search by track id
          const id = (url.match(/track\/([a-zA-Z0-9]+)/) || [])[1]
          const found = id ? await spotifySearch(id, key) : []
          if (found[0]) {
            songInfo = found[0]
            url = found[0].url || url
          }
        }
        if (!songInfo) {
          return msg.reply('❖ No se pudo procesar el enlace de Spotify.')
        }
      } else {
        const found = await spotifySearch(query, key)
        if (!found.length) {
          return msg.reply('❖ No se encontraron resultados en Spotify')
        }
        songInfo = found[0]
        url = songInfo.url || ''
      }

      // Try Spotify download if we still need audio
      if (!audio?.dl && url) {
        const dlData = await spotifyDl(url, key)
        if (dlData?.dl) {
          audio = {
            dl: dlData.dl,
            title: dlData.title || songInfo.title || songInfo.name,
            fileName: `${dlData.title || songInfo.title || 'music'}.mp3`
          }
          songInfo = { ...songInfo, ...dlData }
        }
      }

      // YouTube fallback
      if (!audio?.dl) {
        const ytQuery = [songInfo.title || songInfo.name, songInfo.artist]
          .filter(Boolean)
          .join(' ')
          .trim() || query
        const yt = await youtubeAudio(ytQuery, key)
        if (!yt?.dl) {
          return msg.reply('❖ No se pudo descargar el audio (Spotify y YouTube fallaron). Prueba #play con el nombre de la canción.')
        }
        audio = yt
        viaYt = true
        if (!songInfo.image && yt.thumbnail) songInfo.image = yt.thumbnail
      }

      const caption = buildCaption(songInfo, url, viaYt)
      const yi = songInfo.image || songInfo.cover

      try {
        if (yi) {
          await sock.sendMessage(msg.chat, { image: { url: yi }, caption }, { quoted: msg })
        } else {
          await msg.reply(caption)
        }
      } catch (thumbErr) {
        console.error('[sp] thumb', thumbErr?.message || thumbErr)
        await msg.reply(caption).catch(() => {})
      }

      const audioBuffer = await downloadBuffer(audio.dl)
      if (!audioBuffer?.length) {
        return msg.reply('❖ El audio vino vacío.')
      }
      if (audioBuffer.length < 50 * 1024) {
        return msg.reply(`❖ No envié el audio: el archivo es demasiado pequeño (${(audioBuffer.length / 1024).toFixed(1)} KB).`)
      }

      const rawName = audio.fileName || `${audio.title || songInfo.title || 'music'}.mp3`
      const fileName = String(rawName).replace(/[^\w\s.-]/g, '').slice(0, 80) || 'music.mp3'

      try {
        await sock.sendMessage(msg.chat, {
          audio: audioBuffer,
          mimetype: 'audio/mpeg',
          fileName,
          ptt: false
        }, { quoted: msg })
      } catch (e) {
        console.error('[sp] audio send', e)
        await sock.sendMessage(msg.chat, {
          document: audioBuffer,
          mimetype: 'audio/mpeg',
          fileName,
          caption: songInfo.title || songInfo.name || 'music'
        }, { quoted: msg })
      }
    } catch (e) {
      console.error('[sp]', e)
      await msg.reply(`《✧》 Error: ${e?.message || e}`).catch(() => msg.reply(msgglobal))
    }
  }
}
