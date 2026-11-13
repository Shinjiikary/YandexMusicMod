const crypto = require('crypto');

const API_BASE = 'https://api.music.yandex.net';
const SIGN_SALT = 'XGRlBW9FXlekgbPrRHuSiA';

function getHeaders(token) {
  return {
    'Authorization': `OAuth ${token}`,
    'X-Yandex-Music-Client': 'YandexMusicAndroid/24023621'
  };
}

// Забираем очередь треков "Моей волны"
async function getMyWave(token) {
  const res = await fetch(`${API_BASE}/rotor/station/user:onyourwave/tracks?settings2=true`, {
    headers: getHeaders(token)
  });
  const data = await res.json();
  if (!data.result || !data.result.sequence) throw new Error('Ошибка получения волны');

  return data.result.sequence.map(item => {
    const t = item.track;
    return {
      id: t.id,
      title: t.title,
      artist: t.artists ? t.artists.map(a => a.name).join(', ') : 'Неизвестен',
      cover: t.coverUri ? `https://${t.coverUri.replace('%%', '400x400')}` : ''
    };
  });
}

// Вытаскиваем прямую MP3-ссылку на аудиопоток
async function getTrackUrl(token, trackId) {
  const infoRes = await fetch(`${API_BASE}/tracks/${trackId}/download-info`, {
    headers: getHeaders(token)
  });
  const infoData = await infoRes.json();

  const best = infoData.result
    .filter(x => x.codec === 'mp3')
    .sort((a, b) => b.bitrateInKbps - a.bitrateInKbps)[0] || infoData.result[0];

  const dlRes = await fetch(`${best.downloadInfoUrl}&format=json`, {
    headers: getHeaders(token)
  });
  const dl = await dlRes.json();

  const sign = crypto
    .createHash('md5')
    .update(SIGN_SALT + dl.path.slice(1) + dl.s)
    .digest('hex');

  return `https://${dl.host}/get-mp3/${sign}/${dl.ts}${dl.path}`;
}

module.exports = { getMyWave, getTrackUrl };