// Instagram リールの表紙画像を取り寄せて返す（ブラウザから直接は読み込めないため）
export async function onRequest({ params, request }) {
  const id = String(params.id || '').replace(/[^\w-]/g, '');
  if (!id) return new Response('bad request', { status: 400 });
  const cache = caches.default;
  const key = new Request(new URL(request.url).origin + '/ig/' + id);
  const hit = await cache.match(key);
  if (hit) return hit;
  const r = await fetch(`https://www.instagram.com/p/${id}/media/?size=l`, {
    redirect: 'follow',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      'Accept': 'image/avif,image/webp,image/*,*/*;q=0.8',
    },
  });
  const ct = r.headers.get('content-type') || '';
  if (!r.ok || !ct.startsWith('image/')) return new Response('unavailable', { status: 502 });
  const res = new Response(r.body, { headers: { 'content-type': ct, 'cache-control': 'public, max-age=604800' } });
  await cache.put(key, res.clone());
  return res;
}
