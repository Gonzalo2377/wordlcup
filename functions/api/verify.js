/* GET /api/verify?session_id=...
   Stripe redirects here after payment. We confirm the session is
   really paid, then set a signed HttpOnly cookie with the plan and
   bounce the user back to the site. The browser can't forge it.
   Env: STRIPE_SECRET_KEY, AUTH_SECRET (any long random string)
*/
import { makeToken } from './_auth.js';

export async function onRequestGet(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const sid = url.searchParams.get('session_id');
    const home = `${url.origin}/#/premium`;
    if (!sid || !env.STRIPE_SECRET_KEY || !env.AUTH_SECRET) return Response.redirect(home, 302);

    const r = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sid}`, {
        headers: { 'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}` },
    });
    const s = await r.json();

    let plan = 'free', ttl = 0;
    const paid = s && (s.payment_status === 'paid' || s.status === 'complete');
    if (paid) {
        if (s.mode === 'subscription') {
            // distingue reto escalera de "todas las combis" por el precio comprado
            const priceId = s.line_items && s.line_items.data && s.line_items.data[0] && s.line_items.data[0].price && s.line_items.data[0].price.id;
            plan = (env.STRIPE_PRICE_LADDER && priceId === env.STRIPE_PRICE_LADDER) ? 'ladder' : 'all';
            ttl = 60 * 60 * 24 * 31;
        }
        else { plan = 'single'; ttl = 60 * 60 * 24 * 3; }
    }
    if (plan === 'free') return Response.redirect(home, 302);
    // re-pide la sesión con line_items expandido para saber el precio (fiable)
    if (s.mode === 'subscription' && env.STRIPE_PRICE_LADDER) {
        try {
            const r2 = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sid}?expand[]=line_items`, { headers:{ 'Authorization':`Bearer ${env.STRIPE_SECRET_KEY}` } });
            const s2 = await r2.json();
            const pid = s2.line_items && s2.line_items.data && s2.line_items.data[0] && s2.line_items.data[0].price && s2.line_items.data[0].price.id;
            plan = (pid === env.STRIPE_PRICE_LADDER) ? 'ladder' : 'all';
        } catch(e){}
    }

    const token = await makeToken(plan, ttl, env.AUTH_SECRET);
    const dest = plan==='ladder' ? 'reto' : 'premium';
    const headers = new Headers({ 'Location': `${url.origin}/?unlocked=${plan}#/${dest}` });
    headers.append('Set-Cookie', `mv_access=${token}; Path=/; Max-Age=${ttl}; HttpOnly; Secure; SameSite=Lax`);
    return new Response(null, { status: 302, headers });
}
