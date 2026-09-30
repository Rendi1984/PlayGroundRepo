import cv2, numpy as np, sys, glob, os
def star_mask(shape,cx=600,cy=1160,R=29,r=9):
    m=np.zeros(shape[:2],np.uint8); pts=[]
    for k in range(8):
        a=k*np.pi/4-np.pi/2; rr=R if k%2==0 else r
        pts.append([cx+rr*np.cos(a),cy+rr*np.sin(a)])
    cv2.fillPoly(m,[np.int32(pts)],255)
    # concave star: fill + smooth edges
    return cv2.dilate(m,np.ones((5,5),np.uint8))
def text_mask(img,box):
    x0,y0,x1,y1=box; g=cv2.cvtColor(img,cv2.COLOR_BGR2GRAY); m=np.zeros(g.shape,np.uint8)
    sub=g[y0:y1,x0:x1]; mm=(sub>150).astype(np.uint8)*255
    m[y0:y1,x0:x1]=mm; return cv2.dilate(m,np.ones((7,7),np.uint8),iterations=2)
if __name__=='__main__':
    src,dst,withtext=sys.argv[1],sys.argv[2],sys.argv[3]=='1'
    os.makedirs(dst,exist_ok=True); SM=None
    for p in sorted(glob.glob(src+'/*.png')):
        im=cv2.imread(p)
        if SM is None: SM=star_mask(im.shape)
        m=SM.copy()
        if withtext: m=cv2.bitwise_or(m,text_mask(im,(90,838,640,900)))
        out=cv2.inpaint(im,m,6,cv2.INPAINT_TELEA)
        cv2.imwrite(os.path.join(dst,os.path.basename(p)),out)
