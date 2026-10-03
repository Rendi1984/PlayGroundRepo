import numpy as np, wave
sr=44100; D=22.733; N=int(sr*D); t=np.arange(N)/sr
mus=np.zeros(N); sfx=np.zeros(N); rng=np.random.default_rng(7)
n=lambda m:440*2**((m-69)/12)
def env(a,b,att=.3,rel=.6): return np.clip((t-a)/att,0,1)*np.clip((b-t)/rel,0,1)*((t>=a)&(t<b))
def add(buf,a,sig):
    i=int(a*sr); j=min(N,i+len(sig)); 
    if i<N: buf[i:j]+=sig[:j-i]
def tone(f,dur,amp,dec,harm=((1,1),(2,.35),(3,.12))):
    x=np.arange(int(dur*sr))/sr; return amp*np.exp(-x/dec)*sum(h*np.sin(2*np.pi*f*k*x) for k,h in harm)
def sweep(f0,f1,dur,amp,dec=1.0):
    x=np.arange(int(dur*sr))/sr; f=f0*(f1/f0)**(x/dur); ph=2*np.pi*np.cumsum(f)/sr
    return amp*np.sin(ph)*np.exp(-x/dec)*np.clip(x/0.01,0,1)
def chime(a,notes,amp=.1,gap=.07):
    for k,m in enumerate(notes): add(sfx,a+k*gap,tone(n(m),1.3,amp,.4,((1,1),(2.01,.4),(3.98,.15))))
def tap(a,amp=.15,f=1800):
    x=np.arange(int(.04*sr))/sr; add(sfx,a,amp*np.sin(2*np.pi*f*x)*np.exp(-x*160))
def whoosh(a,dur=.5,amp=.1):
    x=np.arange(int(dur*sr))/sr; nz=np.convolve(rng.normal(0,1,len(x)),np.ones(30)/30,'same'); add(sfx,a,amp*nz*np.sin(np.pi*x/dur)**2)
def pop(a,amp=.12): add(sfx,a,sweep(300,900,.09,amp,.05))
def thump(a,amp=.3):
    x=np.arange(int(.35*sr))/sr; add(sfx,a,amp*np.sin(2*np.pi*(50+90*np.exp(-x*25))*x)*np.exp(-x*9))
# ---- music: playful plucks, 104 bpm, F major-ish; thinner during suspense, pause at reveal
bpm=104; beat=60/bpm; bar=4*beat
prog=[[53,60,64,69],[50,57,62,65],[46,58,62,65],[48,55,60,64]]
def play(a0,a1,amp=1.0,arp=True):
    k=0; tt=a0
    while tt<a1:
        c=prog[int((tt-a0)//bar)%4]
        if arp:
            m=[c[1]+12,c[2]+12,c[3]+12,c[2]+12][k%4]; add(mus,tt,tone(n(m),.5,.05*amp,.16))
        if k%2==0: add(mus,tt,tone(n(c[0]-12),.5,.07*amp,.25,((1,1),(2,.2))))
        if k%4==0:
            for m in c[1:]: add(mus,tt,tone(n(m),1.4,.012*amp,.9,((1,1),(2,.1))))
        tt+=beat/2; k+=1
play(0,3.4,1.0)
play(3.4,8.95,.55,arp=False)   # suspense: bass + pads only
for k in range(int((8.9-3.9)/.5)): tap(3.9+k*.5,.06,2400 if k%2 else 1600)   # clock tick-tock
play(10.15,19.9,1.0)
play(19.9,D,.8,arp=False)
# ---- sfx
add(sfx,1.15,sweep(180,520,.35,.12,.25)); add(sfx,1.5,sweep(500,220,.25,.1,.2))   # sponge boing
pop(1.75)
whoosh(3.42,.4,.14); pop(3.5)
for k in range(10): add(sfx,5.33+k*.035,tone(n(72+k*2),.5,.03,.25))     # harp up into flashback
chime(6.85,[88,91],.07)                                                    # heart pops in the sketch
for k in range(10): add(sfx,7.73+k*.035,tone(n(90-k*2),.5,.03,.25))     # harp down
pop(8.2,.1)
for a in (9.0,9.38,9.76): add(sfx,a,tone(1046,.25,.12,.12,((1,1),(2,.2))))
thump(10.15,.35); chime(10.18,[84,88,91],.08)
pop(10.35,.08); pop(10.5,.08)
pop(11.0); thump(11.45,.28); chime(11.5,[79,84],.06)
# sad trombone for Ron
for k,(m,d) in enumerate([(58,.3),(57,.3),(56,.3),(55,.8)]):
    a=11.85+k*.3; x=np.arange(int(d*sr))/sr; f=n(m)*(1+0.012*np.sin(2*np.pi*6*x*(k==3)))
    ph=2*np.pi*np.cumsum(f)/sr; add(sfx,a,.07*(np.sin(ph)+.5*np.sin(2*ph)+.25*np.sin(3*ph))*np.clip(x/.03,0,1)*np.clip((d-x)/.08,0,1))
add(sfx,12.35,sweep(1600,500,.4,.05,1.0)); add(sfx,12.75,sweep(160,480,.3,.13,.2))   # whistle fall + boing
pop(13.55)
pop(14.58)
WS,WE,ROT=15.0,17.2,360*4
for k in range(1,int(ROT/45)+1):
    frac=k*45/ROT; p=1-(1-frac)**0.25; tap(WS+p*(WE-WS),.07)
chime(17.22,[88],.09); pop(17.25)
add(sfx,18.3,sweep(400,1300,.18,.08,.12)); chime(18.38,[76,79,84,88],.08)
whoosh(19.88,.5,.12); chime(20.1,[72,79,84,88,91],.07); tap(20.85,.1)
mix=mus*np.clip(t/.2,0,1)*np.clip((D-t)/1.2,0,1)+sfx
mix=np.tanh(mix*1.5)/np.tanh(1.5)
d=int(.19*sr); wet=mix.copy(); wet[d:]+=.18*mix[:-d]
st=np.stack([wet,np.roll(wet,int(.011*sr))],1); st=st/np.max(np.abs(st))*.89
w=wave.open('music6.wav','wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(sr); w.writeframes((st*32767).astype(np.int16).tobytes()); w.close()
