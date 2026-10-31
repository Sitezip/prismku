# Generates the Open Graph card HTML (rendered to client/img/og.png by scripts/shot.mjs)
cols=['#ff3b47','#2f7bff','#ffd60a','#2ecc71']
g=[[0,1,2,3],[2,3,0,1],[1,0,3,2],[3,2,1,0]]
empty={(0,2),(1,1),(2,3),(3,0),(1,3),(2,0)}
s=''
for r in range(4):
  for c in range(4):
    if (r,c) in empty: s+='<div style="width:90px;height:90px;border-radius:16px;background:repeating-linear-gradient(45deg,#ffffff14 0 8px,transparent 8px 16px),#ffffff0d"></div>'
    else:
      col=cols[g[r][c]]; s+=f'<div style="width:90px;height:90px;border-radius:16px;background:{col};box-shadow:0 0 22px {col}aa, inset 0 -6px 0 #0003, inset 0 5px 0 #fff5"></div>'
html=f'''<html><body style="margin:0;width:1200px;height:630px;background:radial-gradient(circle at 20% 30%,#ff3b4755,transparent 35%),radial-gradient(circle at 85% 25%,#2f7bff66,transparent 35%),radial-gradient(circle at 70% 85%,#2ecc7155,transparent 35%),#120b2e;font-family:system-ui,sans-serif;color:#fff;display:flex;align-items:center;gap:60px;padding:0 80px;box-sizing:border-box;overflow:hidden">
<div style="padding:12px;border-radius:30px;background:conic-gradient(#ff3b47,#ff8c1a,#ffd60a,#2ecc71,#19d3c5,#2f7bff,#9b5cff,#ff5cc8,#ff3b47);box-shadow:0 0 60px #9b5cff88">
<div style="display:grid;grid-template-columns:repeat(4,90px);gap:10px;background:#1d1247;padding:12px;border-radius:22px">{s}</div></div>
<div><div style="font-size:112px;font-weight:900;letter-spacing:2px;background:linear-gradient(90deg,#ff3b47,#ff8c1a,#ffd60a,#2ecc71,#2f7bff,#9b5cff);-webkit-background-clip:text;color:transparent;line-height:1.1">Prismku</div>
<div style="font-size:40px;font-weight:700;margin-top:10px">Rainbow Sudoku</div>
<div style="font-size:28px;color:#d8ccff;margin-top:18px;max-width:520px">No color repeats in any row or column.<br>One new daily puzzle for everyone.</div>
<div style="font-size:28px;color:#ffd60a;margin-top:22px;font-weight:700">prismku.com · free to play</div></div></body></html>'''
open('/tmp/og.html','w').write(html)
