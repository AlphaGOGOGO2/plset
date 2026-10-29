from PIL import Image, ImageDraw
from pathlib import Path
root=Path(__file__).resolve().parents[1]
folder=root/'electron'/'assets'
folder.mkdir(parents=True,exist_ok=True)
im=Image.new('RGBA',(256,256),(0,0,0,0))
d=ImageDraw.Draw(im)
d.rounded_rectangle((4,4,252,252),radius=54,fill='#14231b',outline='#3e6048',width=4)
d.rounded_rectangle((61,57,168,151),radius=25,fill='#e6ecdf')
d.rectangle((61,81,86,204),fill='#e6ecdf')
d.rounded_rectangle((86,82,142,125),radius=11,fill='#14231b')
d.polygon([(184,48),(207,48),(139,208),(116,208)],fill='#a4e5bc')
im.save(folder/'icon.png')
im.save(folder/'icon.ico',sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
