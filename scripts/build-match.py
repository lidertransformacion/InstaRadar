import json,re,sys
d=json.load(open(sys.argv[1] if len(sys.argv)>1 else 'docs/candidatos-medellin-v2.json'))
def num(f):
    if f is None: return None
    if isinstance(f,(int,float)): return f
    s=str(f).lower().replace(',','.'); return float(s[:-1])*1000 if s.endswith('k') else float(s)
def kw(t,*ws): return any(w in t for w in ws)
out={}
for i in d['influencers']:
    t=(' '.join(str(i.get(k) or '') for k in ('niche','bio','notes','display_name'))).lower()
    nl=(i.get('niche') or '').lower(); loc=(i.get('location') or '').lower()
    f=num(i.get('followers')); er=re.search(r'ER ([\d.]+)%',i.get('notes') or ''); er=float(er.group(1)) if er else None
    ff=re.search(r'fake followers ([\d.]+)%',i.get('notes') or ''); ff=float(ff.group(1)) if ff else None
    why=[]
    # nicho 30
    if kw(nl+t,'café','cafe','☕') and kw(nl,'café','cafe'): n=30; why.append('nicho café')
    elif kw(nl,'brunch','desayun'): n=27; why.append('brunch/desayunos')
    elif kw(nl,'food','comida','foodie','chef','drinks','bebidas'): n=23; why.append('foodie')
    elif kw(nl,'wellness','saludable','vegan','bienestar'): n=19; why.append('bienestar')
    elif kw(nl,'fitness','crossfit','mentalidad'): n=16; why.append('fitness')
    elif kw(nl,'moda','beauty','fashion'): n=7; why.append('moda/belleza (lejos del café)')
    elif kw(nl,'lifestyle','viaje','travel'): n=13; why.append('lifestyle')
    else: n=10
    # zona 20 (cercanía a tiendas Libertario: Laureles, Provenza/El Poblado, Ciudad del Río)
    if kw(t+loc,'laureles','provenza','poblado','ciudad del r'): z=20; why.append('zona de tienda Libertario')
    elif 'confirmado' in loc: z=16; why.append('Medellín confirmado')
    elif kw(loc,'manizales'): z=9
    elif kw(loc,'envigado','sabaneta'): z=11; why.append('Envigado (fuera de zonas Libertario)')
    elif 'medell' in loc or 'mde' in loc: z=13
    elif 'colombia' in loc: z=5; why.append('ubicación solo "Colombia"')
    else: z=0
    # tamaño 15
    if f is None: s=4; why.append('seguidores sin verificar')
    elif 3000<=f<=15000: s=15
    elif 15000<f<=25000: s=13
    elif 1500<=f<3000: s=10
    elif 25000<f<=50000: s=9
    else: s=6
    # engagement 10
    if er is None: e=5
    elif er>10: e=6; why.append(f'ER {er}% atípico')
    elif er>=3: e=10
    elif er>=2: e=8
    elif er>=1.5: e=6
    else: e=4
    # autenticidad 10
    if ff is None: a=6
    elif ff<15: a=10
    elif ff<25: a=7
    elif ff<35: a=4; why.append(f'{ff}% seguidores falsos (Modash)')
    else: a=2; why.append(f'{ff}% seguidores falsos (Modash)')
    # estética/valores 10
    if kw(nl,'café'): v=10
    elif kw(t,'experiencia','saludable','sanos','consciente','sostenible','vegan','receta','gluten'): v=8
    elif kw(nl,'food','comida','brunch'): v=7
    elif kw(nl,'moda','beauty','fashion','lujo') or kw(t,'lujo'): v=5
    else: v=6
    # competidores 5
    mp=i.get('mentioned_pergamino')
    if mp is True: c=3; why.append('ya mencionó a Pergamino (afinidad probada; revisar exclusividad)')
    elif mp is False: c=5
    else: c=4
    pen=0 if i.get('verified') else 5
    total=max(0,min(100,n+z+s+e+a+v+c-pen))
    out[i['username']]=dict(total=total,nicho=n,zona=z,tamano=s,engagement=e,autenticidad=a,valores=v,competencia=c,penalizacion=pen,
        er=er,fake=ff,verificado=bool(i.get('verified')),
        explicacion=('Encaja por '+', '.join(why[:3]) if why else 'Encaje moderado')+('.' if i.get('verified') else '. Dato de terceros: verificar perfil.'))
json.dump(out,open('src/data/match-libertario.json','w'),ensure_ascii=False,indent=1)
for u,m in sorted(out.items(),key=lambda x:-x[1]['total']): print(m['total'],u,m['explicacion'])
