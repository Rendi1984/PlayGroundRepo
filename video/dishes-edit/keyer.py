import cv2,numpy as np,sys,os
def order(p):
    p=np.array(p,dtype=np.float32); s=p.sum(1); d=np.diff(p,axis=1).ravel()
    return np.array([p[np.argmin(s)],p[np.argmin(d)],p[np.argmax(s)],p[np.argmax(d)]],dtype=np.float32)
def quad(cnt):
    hull=cv2.convexHull(cnt); peri=cv2.arcLength(hull,True)
    for eps in (0.02,0.03,0.05,0.08):
        a=cv2.approxPolyDP(hull,eps*peri,True)
        if len(a)==4: return order(a.reshape(4,2))
    return order(cv2.boxPoints(cv2.minAreaRect(cnt)))
def process(src,dst,pick):
    cap=cv2.VideoCapture(src); fps=cap.get(5); W=int(cap.get(3)); H=int(cap.get(4))
    vw=cv2.VideoWriter(dst,cv2.VideoWriter_fourcc(*'mp4v'),fps,(W,H)); i=0
    while True:
        ok,f=cap.read()
        if not ok: break
        hsv=cv2.cvtColor(f,cv2.COLOR_BGR2HSV)
        g=cv2.inRange(hsv,(38,70,70),(88,255,255))
        g=cv2.morphologyEx(g,cv2.MORPH_CLOSE,np.ones((11,11),np.uint8))
        cnts,_=cv2.findContours(g,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
        out=f.astype(np.float32); scr=np.zeros((H,W,1),np.float32); scrimg=np.zeros_like(out)
        for c in cnts:
            if cv2.contourArea(c)<1200: continue
            x,y,w,h=cv2.boundingRect(c)
            img=pick(i,x+w/2)
            if img is None: continue
            q=quad(c)
            # expand quad slightly to cover anti-aliased edge
            ctr=q.mean(0); q2=ctr+(q-ctr)*1.04
            sh,sw=img.shape[:2]
            M=cv2.getPerspectiveTransform(np.float32([[0,0],[sw,0],[sw,sh],[0,sh]]),q2.astype(np.float32))
            warped=cv2.warpPerspective(img,M,(W,H),flags=cv2.INTER_AREA)
            # alpha: green pixels inside this contour (keeps fingers on top)
            cm=np.zeros((H,W),np.uint8); cv2.drawContours(cm,[c],-1,255,-1)
            raw=cv2.inRange(hsv,(38,60,50),(88,255,255))
            raw=cv2.morphologyEx(raw,cv2.MORPH_CLOSE,np.ones((5,5),np.uint8))
            a=cv2.bitwise_and(raw,cm); a=cv2.dilate(a,np.ones((3,3),np.uint8))
            a=cv2.GaussianBlur(a,(3,3),0).astype(np.float32)[...,None]/255
            out=out*(1-a)+warped.astype(np.float32)*a
            scr=np.maximum(scr,a); scrimg=np.where(a>0,warped.astype(np.float32),scrimg)
            # spill suppression in a band around the screen
            band=(cv2.dilate(cm,np.ones((41,41),np.uint8))>0)&(a[...,0]<0.35)
            o=out[band]; o[:,1]=np.minimum(o[:,1],np.maximum(o[:,0],o[:,2])*1.02); out[band]=o
        # residual green glints on fingers (lower half only, not on the new screens)
        gl=cv2.inRange(hsv,(38,60,60),(88,255,255))>0
        gl[:540,:]=False
        if 'acc' in dir(): pass
        gl&=(scr[...,0]<0.35)
        o=out[gl]; o[:,1]=np.minimum(o[:,1],np.maximum(o[:,0],o[:,2])*1.05); out[gl]=o
        vw.write(np.clip(out,0,255).astype(np.uint8)); i+=1
    vw.release()
if __name__=='__main__':
    which=sys.argv[1]
    if which=='c3':
        D=cv2.imread('scr_mi-d.png'); R=cv2.imread('scr_mi-r.png')
        process('c3.mp4','c3r.mp4',lambda i,cx: D if cx<300 else R)
    else:
        def pk(i,cx):
            p='wheelscr/w%04d.png'%min(i,189); return cv2.imread(p)
        process('c2.mp4','c2r.mp4',pk)
