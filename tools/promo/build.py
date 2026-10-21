import os, subprocess, json
SCENES = ['00','01','02','03','04','05','06','07','08','09','10']
FPS = 24
# 每幕各自編成一段
segments = []
for s in SCENES:
    files = sorted(f for f in os.listdir('/tmp/video/frames') if f.startswith(f's{s}-') and f.endswith('.jpg'))
    if not files:
        raise SystemExit(f'missing frames for scene {s}')
    out = f'/tmp/video/seg-{s}.mp4'
    seq = f'/tmp/video/seq{s}'
    os.makedirs(seq, exist_ok=True)
    for f in os.listdir(seq):
        os.unlink(os.path.join(seq, f))
    for i, f in enumerate(files):
        os.link(f'/tmp/video/frames/{f}', f'{seq}/f-{i:05d}.jpg')
    subprocess.run(['ffmpeg','-y','-v','error','-framerate',str(FPS),'-i',f'{seq}/f-%05d.jpg',
                    '-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p', out], check=True)
    dur = len(files) / FPS
    segments.append((s, out, dur))
    print(f'seg {s}: {len(files)} frames = {dur:.2f}s')
# xfade 串接（0.4s 交叉淡入）
FADE = 0.4
inputs = []
for _, path, _ in segments:
    inputs += ['-i', path]
filt = []
cur = '0:v'
offset = 0.0
for i in range(1, len(segments)):
    offset += segments[i-1][2] - FADE
    out = f'x{i}'
    filt.append(f'[{cur}][{i}:v]xfade=transition=fade:duration={FADE}:offset={offset:.3f}[{out}]')
    cur = out
graph = ';'.join(filt)
cmd = ['ffmpeg','-y','-v','error'] + inputs + ['-filter_complex', graph, '-map', f'[{cur}]',
       '-c:v','libx264','-preset','slow','-crf','19','-pix_fmt','yuv420p','-movflags','+faststart',
       '-x264-params','keyint=48:min-keyint=24', '/tmp/out/promo-2min.mp4']
subprocess.run(cmd, check=True)
total = sum(d for _,_,d in segments) - FADE * (len(segments)-1)
print(f'total ≈ {total:.2f}s')
