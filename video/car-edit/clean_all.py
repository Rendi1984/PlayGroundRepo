import cv2, numpy as np, glob, os
from clean import star_mask, text_mask
os.makedirs('cf',exist_ok=True); SM=None
def bright_mask(img,box,thr):
    x0,y0,x1,y1=box; g=img.max(axis=2); m=np.zeros(g.shape,np.uint8)
    m[y0:y1,x0:x1]=((g[y0:y1,x0:x1]>thr)*255).astype(np.uint8)
    return cv2.dilate(m,np.ones((7,7),np.uint8),iterations=2)
for p in sorted(glob.glob('sf/*.png')):
    i=int(os.path.basename(p)[1:5])
    if i<192: continue
    im=cv2.imread(p)
    if SM is None: SM=star_mask(im.shape)
    m=SM.copy()
    if i<=59: m|=text_mask(im,(90,838,640,900))
    if i>=192:
        m|=bright_mask(im,(150,110,600,232),95)
        hm=np.zeros(m.shape,np.uint8); cv2.ellipse(hm,(212,172),(62,58),0,0,360,255,-1); m|=hm
        m|=bright_mask(im,(60,995,660,1110),95)
    cv2.imwrite('cf/'+os.path.basename(p),cv2.inpaint(im,m,6,cv2.INPAINT_TELEA))
