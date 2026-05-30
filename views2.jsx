/* ============================================================
   MUNDIAL VALUE — views part 2: Premium, Record, How
   ============================================================ */

/* ---- premium plan helpers (server-verified if backend present; else Stripe link / demo) ---- */
function getPlan(){ if (window.MV_PLAN) return window.MV_PLAN; try { return localStorage.getItem('mv_plan') || 'free'; } catch(e){ return 'free'; } }
function setPlanLS(p){ try { localStorage.setItem('mv_plan', p); } catch(e){} }
function stripeUrl(tier){ const s=(window.MV_CONFIG&&window.MV_CONFIG.stripe)||{}; return tier==='single'?s.single:(tier==='all'?s.all:null); }
async function startCheckout(tier, setPlan){
    // 1) real backend: Cloudflare Function creates a Stripe Checkout session
    try {
        const r = await fetch('/api/checkout', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ tier }) });
        if (r.ok) { const j = await r.json(); if (j.url) { window.location.href = j.url; return; } }
    } catch(e){}
    // 2) plain Stripe Payment Link from config.js
    const u = stripeUrl(tier);
    if (u && !/PASTE|^#?$/.test(u)) { window.location.href = u; return; }
    // 3) demo unlock (preview / nothing configured yet)
    setPlanLS(tier); if (setPlan) setPlan(tier);
}

/* a single accumulator card; locked unless `unlocked` */
function ComboCard({ c, t, locked, onUnlock }) {
    const total = window.comboOdds(c);
    const inner = (
        <div className="combo">
            <div className="combo__head">
                <div>
                    <span className="tag tag--lime" style={{ marginBottom:6 }}>{c.tier==='single' ? t.comboOfDay : t.comboTitle}</span>
                    <div className="combo__title">{c.name}</div>
                </div>
                <div style={{ textAlign:'right' }}>
                    <div style={{ fontFamily:'var(--font-mono)', fontSize:'.58rem', letterSpacing:'.12em', textTransform:'uppercase', color:'var(--muted)' }}>{t.comboTotal}</div>
                    <div className="combo__odds">{total.toFixed(2)}</div>
                </div>
            </div>
            <div className="combo__legs">
                {c.legs.map((l,i)=>(
                    <div className="combo-leg" key={i}>
                        <span className="combo-leg__num">{i+1}</span>
                        <div className="combo-leg__main">
                            <div className="combo-leg__match">{l.match}</div>
                            <div className="combo-leg__pick">{l.pick} · {bookById(l.book).name}</div>
                        </div>
                        <span className="combo-leg__odd">{l.odd.toFixed(2)}</span>
                    </div>
                ))}
            </div>
            <div className="combo__foot">
                <span className="combo__conf">{t.comboConf}: <b>{c.conf}%</b></span>
                <span style={{ fontFamily:'var(--font-mono)', fontSize:'.72rem', color:'var(--muted)' }}>{c.legs.length} {t.legs}</span>
            </div>
        </div>
    );
    if (!locked) return inner;
    return (
        <div className="locked">
            <div className="locked__content">{inner}</div>
            <div className="locked__overlay">
                <span className="locked__ic">{Icon.lock({ style:{width:24,height:24} })}</span>
                <div style={{ fontFamily:'var(--font-head)', fontWeight:800, fontSize:'1.1rem' }}>{t.lockedTitle}</div>
                <div style={{ color:'var(--text-2)', fontSize:'.88rem', maxWidth:240 }}>{t.lockedSub}</div>
                <button className="btn btn--lime btn--sm" style={{ marginTop:4 }} onClick={onUnlock}>{c.tier==='single' ? t.unlockSingle : t.unlockAll}</button>
            </div>
        </div>
    );
}

function Premium({ t, go }) {
    // plan persists in localStorage; Stripe redirect sets it via ?unlocked=
    const [plan, setPlan] = useState(getPlan());
    const combos = window.COMBOS;
    const isUnlocked = (c) => plan==='all' || (plan==='single' && c.tier==='single') || (plan==='free' && c.id==='c1');

    const tiers = [
        { key:'free', name:t.tierFree, amt:'0€', per:'', desc:t.priceFreeDesc, cta:t.getFree, feat:[
            [true,t.featValueBoard],[true,t.featCompare],[true,t.featRecord],[false,t.featComboDay],[false,t.featCombosAll] ] },
        { key:'single', name:t.tierSingle, amt:'3,99€', per:t.perOnce, feat:[
            [true,t.featValueBoard],[true,t.featCompare],[true,t.featComboDay],[false,t.featCombosAll],[false,t.featHistory] ], desc:t.priceSingleDesc, cta:t.getSingle },
        { key:'all', name:t.tierAll, amt:'14,99€', per:t.perMonth, feat:[
            [true,t.featValueBoard],[true,t.featComboDay],[true,t.featCombosAll],[true,t.featHistory],[true,t.featPriority] ], desc:t.priceAllDesc, cta:t.getAll, feat_popular:true },
    ];

    return (
        <main>
            <section className="section">
                <div className="wrap">
                    <span className="eyebrow"><span className="dot" />{t.comboOfDay}</span>
                    <h2 className="section__title" style={{ marginBottom:8 }}>{t.pricingTitle}</h2>
                    {window.MV_OWNER && (
                        <div style={{ display:'flex', alignItems:'center', gap:10, background:'rgba(246,196,67,.1)', border:'1px solid rgba(246,196,67,.4)', borderRadius:10, padding:'10px 14px', marginBottom:16 }}>
                            <span style={{ fontFamily:'var(--font-head)', fontWeight:800, color:'var(--lime)', fontSize:'.85rem' }}>👑 MODO DUEÑO</span>
                            <span style={{ color:'var(--text-2)', fontSize:'.85rem' }}>Estás viendo todas las combinadas desbloqueadas. Para salir: <code style={{ color:'var(--lime)' }}>?dueno=salir</code></span>
                        </div>
                    )}
                    <p style={{ color:'var(--text-2)', maxWidth:620, lineHeight:1.6, marginBottom:26 }}>{t.pricingLead}</p>

                    <div className="pricing">
                        {tiers.map(tier => (
                            <div key={tier.key} className={'price-card' + (tier.feat_popular ? ' feat' : '')}>
                                <span className="price-card__tier">{tier.name}</span>
                                <div className="price-card__price"><span className="amt">{tier.amt}</span><span className="per">{tier.per}</span></div>
                                <p className="price-card__desc">{tier.desc}</p>
                                <ul className="price-card__feats">
                                    {tier.feat.map(([on,label],i)=>(
                                        <li key={i} className={on?'':'off'}>{on?Icon.check({}):Icon.x({})}{label}</li>
                                    ))}
                                </ul>
                                <button className={'btn ' + (tier.feat_popular?'btn--lime':'btn--ghost')} onClick={()=> tier.key==='free' ? (setPlanLS('free'), setPlan('free')) : startCheckout(tier.key, setPlan)}>{tier.cta}</button>
                            </div>
                        ))}
                    </div>

                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12, margin:'40px 0 16px' }}>
                        <div><span className="eyebrow muted"><span className="dot" />{t.comboTitle}</span><h3 className="section__title" style={{ fontSize:'1.4rem' }}>{t.navCombos}</h3></div>
                        <span className="tag">{plan==='free'?t.tierFree:plan==='single'?t.tierSingle:t.tierAll} · demo</span>
                    </div>
                    <p style={{ color:'var(--text-2)', maxWidth:620, lineHeight:1.6, margin:'-6px 0 22px' }}>{t.comboLead}</p>

                    <div className="grid grid--3" style={{ alignItems:'start' }}>
                        {combos.map(c => <ComboCard key={c.id} c={c} t={t} locked={!isUnlocked(c)} onUnlock={()=>startCheckout(c.tier==='single'?'single':'all', setPlan)} />)}
                    </div>

                    <div className="disclaimer" style={{ marginTop:26 }}><b>{t.discTitle}</b> {t.disc}</div>
                </div>
            </section>
            <Footer t={t} go={go} />
        </main>
    );
}

/* ---------- equity curve (inline SVG) ---------- */
function EquityCurve() {
    const pts = window.equitySeries();
    const w = 600, h = 120, pad = 6;
    const xs = pts.map(p=>p.x), ys = pts.map(p=>p.y);
    const minY = Math.min(0, ...ys), maxY = Math.max(...ys, 1);
    const sx = (x) => pad + (x/(Math.max(...xs))) * (w - pad*2);
    const sy = (y) => h - pad - ((y - minY)/(maxY - minY)) * (h - pad*2);
    const line = pts.map((p,i)=>`${i?'L':'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
    const area = `${line} L${sx(xs[xs.length-1]).toFixed(1)},${(h-pad).toFixed(1)} L${sx(0).toFixed(1)},${(h-pad).toFixed(1)} Z`;
    const zeroY = sy(0);
    return (
        <svg className="equity" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
            <defs><linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(246,196,67,.35)" /><stop offset="100%" stopColor="rgba(246,196,67,0)" />
            </linearGradient></defs>
            <line x1={pad} y1={zeroY} x2={w-pad} y2={zeroY} stroke="rgba(255,255,255,.12)" strokeWidth="1" strokeDasharray="4 4" />
            <path d={area} fill="url(#eq)" />
            <path d={line} fill="none" stroke="var(--lime)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
    );
}

function Record({ t, go }) {
    const rec = window.recordSummary();
    let cum = 0;
    return (
        <main>
            <section className="section">
                <div className="wrap">
                    <span className="eyebrow"><span className="dot" />{t.recordEyebrow}</span>
                    <h2 className="section__title" style={{ marginBottom:8 }}>{t.recordTitle}</h2>
                    <p style={{ color:'var(--text-2)', maxWidth:660, lineHeight:1.6, marginBottom:26 }}>{t.recordLead}</p>

                    <div className="rec-stats">
                        <div className="rec-stat"><div className="rec-stat__l">{t.roi}</div><div className="rec-stat__v pos">+{rec.roi}%</div><div className="rec-stat__s">{rec.staked}{t.units} {t.profit.toLowerCase()}</div></div>
                        <div className="rec-stat"><div className="rec-stat__l">{t.profit}</div><div className="rec-stat__v pos">+{rec.profit}{t.units}</div><div className="rec-stat__s">{t.avgOdd} {rec.avgOdd}</div></div>
                        <div className="rec-stat"><div className="rec-stat__l">{t.winRate}</div><div className="rec-stat__v">{rec.winRate}%</div><div className="rec-stat__s">{rec.w}{t.resW[0]} · {rec.l}{t.resL[0]}</div></div>
                        <div className="rec-stat"><div className="rec-stat__l">{t.totalPicks}</div><div className="rec-stat__v">{rec.picks}</div><div className="rec-stat__s">1{t.units}/pick</div></div>
                    </div>

                    <div className="panel panel--pad" style={{ marginBottom:22 }}>
                        <span className="eyebrow muted"><span className="dot" />{t.profit} ({t.units})</span>
                        <div style={{ marginTop:14 }}><EquityCurve /></div>
                    </div>

                    {Array.isArray(window.PENDING) && window.PENDING.length > 0 && (
                        <div className="panel panel--pad" style={{ marginBottom:22, borderColor:'rgba(246,196,67,.3)' }}>
                            <span className="eyebrow"><span className="dot" />{t.pendingTitle}</span>
                            <p style={{ color:'var(--text-2)', fontSize:'.9rem', lineHeight:1.55, margin:'10px 0 16px', maxWidth:660 }}>{t.pendingLead}</p>
                            {window.PENDING.map((p,i)=>(
                                <div className="oc-row" key={i} style={{ alignItems:'center' }}>
                                    <div>
                                        <div className="oc-name">{p.pickLabel} <span style={{ color:'var(--muted)', fontWeight:400, fontFamily:'var(--font-mono)', fontSize:'.8rem' }}>· {p.match}</span></div>
                                        <div className="oc-sub">{p.date} · {bookById(p.book) ? bookById(p.book).name : p.book}</div>
                                    </div>
                                    <div style={{ display:'flex', alignItems:'center', gap:14 }}>
                                        <span style={{ fontFamily:'var(--font-mono)', fontWeight:700, fontSize:'1.1rem' }}>{(+p.odd).toFixed(2)}</span>
                                        <span className="res-pill p" style={{ background:'rgba(246,196,67,.14)', color:'var(--lime)' }}>{t.statusPending}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="panel">
                        <div className="ptable-scroll">
                        <table className="ledger">
                            <thead><tr>
                                <th className="l">{t.colDate}</th><th className="l">{t.colPick}</th><th className="l">{t.colMatch}</th>
                                <th>{t.colOdd}</th><th>{t.colBook}</th><th>{t.colResult}</th><th>{t.colProfit}</th>
                            </tr></thead>
                            <tbody>
                                {window.RECORD.map((x,i)=>{
                                    const p = x.result==='W' ? x.stake*(x.odd-1) : x.result==='L' ? -x.stake : 0;
                                    cum += p;
                                    const resCls = x.result==='W'?'w':x.result==='L'?'l':'p';
                                    const resLbl = x.result==='W'?t.resW:x.result==='L'?t.resL:t.resP;
                                    return (
                                        <tr key={i}>
                                            <td className="l" style={{ color:'var(--muted)' }}>{x.date}</td>
                                            <td className="l" style={{ fontFamily:'var(--font-head)', fontWeight:600 }}>{x.pick}</td>
                                            <td className="l" style={{ color:'var(--text-2)' }}>{x.match}</td>
                                            <td>{x.odd.toFixed(2)}</td>
                                            <td><Book id={x.book} showName={false} size={20} /></td>
                                            <td><span className={'res-pill ' + resCls}>{resLbl}</span></td>
                                            <td className={'profit ' + (p>=0?'pos':'neg')}>{p>=0?'+':''}{p.toFixed(2)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        </div>
                    </div>
                    <div className="disclaimer" style={{ marginTop:22 }}><b>{t.discTitle}</b> {t.disc}</div>
                </div>
            </section>
            <Footer t={t} go={go} />
        </main>
    );
}

function How({ t, go }) {
    const steps = [
        [t.step1T, t.step1D, Icon.book],
        [t.step2T, t.step2D, Icon.target],
        [t.step3T, t.step3D, Icon.bolt],
        [t.step4T, t.step4D, Icon.book],
    ];
    return (
        <main>
            <section className="section">
                <div className="wrap">
                    <span className="eyebrow"><span className="dot" />{t.navHow}</span>
                    <h2 className="section__title" style={{ marginBottom:8 }}>{t.howTitle}</h2>
                    <p style={{ color:'var(--text-2)', maxWidth:620, lineHeight:1.6, marginBottom:26 }}>{t.howLead}</p>

                    <div className="grid grid--2" style={{ marginBottom:26 }}>
                        {steps.map(([h,d,Ic],i)=>(
                            <div className="panel panel--pad" key={i}>
                                <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:10 }}>
                                    <span style={{ width:38, height:38, borderRadius:10, background:'rgba(246,196,67,.14)', display:'grid', placeItems:'center', color:'var(--lime)' }}>{Ic({ style:{width:19,height:19} })}</span>
                                    <span className="mono" style={{ fontSize:'1.6rem', color:'var(--lime)', fontFamily:'var(--font-display)' }}>0{i+1}</span>
                                </div>
                                <h3 style={{ fontFamily:'var(--font-head)', fontWeight:800, margin:'0 0 8px', fontSize:'1.15rem' }}>{h}</h3>
                                <p style={{ color:'var(--text-2)', lineHeight:1.6, margin:0, fontSize:'.92rem' }}>{d}</p>
                            </div>
                        ))}
                    </div>

                    <div className="panel panel--pad" style={{ background:'linear-gradient(160deg, var(--surface) 0%, rgba(246,196,67,.06) 100%)', borderColor:'rgba(246,196,67,.3)' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:14, flexWrap:'wrap' }}>
                            <span style={{ width:46, height:46, borderRadius:12, background:'var(--lime)', display:'grid', placeItems:'center', color:'#0b0e17' }}>{Icon.bolt({ style:{width:24,height:24} })}</span>
                            <div style={{ flex:1, minWidth:240 }}>
                                <h3 style={{ fontFamily:'var(--font-head)', fontWeight:800, margin:'0 0 4px', fontSize:'1.3rem' }}>{t.autoTitle}</h3>
                                <p style={{ color:'var(--text-2)', lineHeight:1.55, margin:0 }}>{t.autoD}</p>
                            </div>
                        </div>
                    </div>

                    <button className="btn btn--lime" style={{ marginTop:24 }} onClick={()=>go({view:'value'})}>{t.heroCta1} {Icon.arrow({ style:{width:17,height:17} })}</button>
                    <div className="disclaimer" style={{ marginTop:24 }}><b>{t.discTitle}</b> {t.disc}</div>
                </div>
            </section>
            <Footer t={t} go={go} />
        </main>
    );
}

Object.assign(window, { Premium, Record, How, ComboCard, EquityCurve });
