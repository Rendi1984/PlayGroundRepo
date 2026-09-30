import numpy as np, wave
sr=44100; D=15.967; N=int(sr*D); t=np.arange(N)/sr
mus=np.zeros(N); sfx=np.zeros(N); rng=np.random.default_rng(3)
n=lambda m:440*2**((m-69)/12)
def env(a,b,att=.5,rel=1.0): return np.clip((t-a)/att,0,1)*np.clip((b-t)/rel,0,1)*((t>=a)&(t<b))
def add(buf,a,sig):
    i=int(a*sr); j=min(N,i+len(sig)); buf[i:j]+=sig[:j-i]
def tone(f,dur,amp,dec,harm=((1,1),(2,.35),(3,.12))):
    x=np.arange(int(dur*sr))/sr; return amp*np.exp(-x/dec)*sum(h*np.sin(2*np.pi*f*k*x) for k,h in harm)
bpm=96; beat=60/bpm; bar=4*beat
prog=[[53,57,60,64,67],[45,57,60,64,67],[50,57,60,64,65],[46,57,62,65,69]]
for i in range(int(D/bar)+1):
    c=prog[i%4]; a=i*bar
    for m in c[1:]:
        for d in (-.2,.2): mus+=0.018*np.sin(2*np.pi*(n(m)+d)*t)*env(a-.1,a+bar+.6,.4,.7)
    mus+=0.05*np.sin(2*np.pi*n(c[0]-12)*t)*env(a,a+bar,.05,.6)
    arp=[c[1]+12,c[2]+12,c[3]+12,c[2]+12,c[4]+12,c[3]+12,c[2]+12,c[1]+12]
    for k,m in enumerate(arp):
        tt=a+k*beat/2
        if 0.9<tt<D-.3: add(mus,tt,tone(n(m),1.0,.035 if tt<3.2 else .05,.28))
for k in range(int((9.5-1.9)/beat)):
    tt=1.9+k*beat; x=np.arange(int(.25*sr))/sr
    add(mus,tt,.12*np.sin(2*np.pi*(55+60*np.exp(-x*30))*x)*np.exp(-x*14))
def chime(a,notes,amp=.12):
    for k,m in enumerate(notes): add(sfx,a+k*.07,tone(n(m),1.4,amp,.45,((1,1),(2.01,.4),(3.98,.15))))
def tap(a,amp=.18):
    x=np.arange(int(.04*sr))/sr; add(sfx,a,amp*np.sin(2*np.pi*1800*x)*np.exp(-x*160))
def whoosh(a,dur=.5,amp=.08):
    x=np.arange(int(dur*sr))/sr; nz=rng.normal(0,1,len(x)); nz=np.convolve(nz,np.ones(30)/30,'same')
    add(sfx,a,amp*nz*np.sin(np.pi*x/dur)**2)
# hook: phone buzz + message ping
x=np.arange(int(.35*sr))/sr; add(sfx,.08,.09*np.sin(2*np.pi*170*x)*(np.sin(2*np.pi*22*x)>0)*np.exp(-x*4))
chime(.12,[84,88],.09)
whoosh(6.05,.6,.16); tap(6.566,.14)
WS,WE,ROT=6.566,8.066,360*4-45
for k in range(1,int(ROT/45)+1):
    frac=k*45/ROT; p=1-(1-frac)**0.25
    tap(WS+p*(WE-WS),.07)
for a in (6.386,7.486000000000001,8.586): add(sfx,a,tone(n(96),.6,.02,.2,((1,1),(1.5,.4))))
chime(8.086,[88],.09); whoosh(8.266,.35,.1)
tap(8.916); chime(9.046,[76,79,84,88],.09)
for f in (2637,3322,4186): add(sfx,9.236,tone(f,1.2,.05,.35,((1,1),(2.76,.3))))
for f in (2637,3322,4186): add(sfx,11.45,tone(f,1.0,.035,.3,((1,1),(2.76,.3))))
whoosh(13.1,.6,.1); chime(13.4,[72,79,84,88,91],.07); tap(14.3,.1)
mix=mus*np.clip(t/.4,0,1)*np.clip((D-t)/1.5,0,1)+sfx
mix=np.tanh(mix*1.4)/np.tanh(1.4)
d=int(.21*sr); wet=mix.copy(); wet[d:]+=.22*mix[:-d]; wet[2*d:]+=.1*mix[:-2*d]
st=np.stack([wet,np.roll(wet,int(.011*sr))],1); st=st/np.max(np.abs(st))*.89
w=wave.open('music4.wav','wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(sr); w.writeframes((st*32767).astype(np.int16).tobytes()); w.close()
