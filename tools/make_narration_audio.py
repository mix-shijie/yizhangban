"""可选：把 narration.json 里的英文解说生成一条 narration_en.mp3，放在项目根目录后，自动演示就改播这个文件。

仓库里不附带任何音频文件。默认情况下，自动演示用浏览器自带的语音合成现场朗读，不需要这个脚本。

用法（需要自己安装 Python 包 edge-tts 和 ffmpeg）：
    pip install edge-tts
    python tools/make_narration_audio.py --voice en-US-GuyNeural

注意：edge-tts 调用的是微软的在线语音服务。生成的音频能不能商用、能不能再分发，由语音服务的条款决定，
请自己确认后再发布。也可以换成你有授权的任何 TTS 或真人录音，只要按 narration.json 的时间点对齐即可。
"""
from pathlib import Path
import argparse
import asyncio
import json
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]


def duration(ffprobe, path):
    out = subprocess.check_output([ffprobe, '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(path)])
    return float(out.decode().strip())


async def synth(segments, voice, rate, tmp):
    import edge_tts  # 只在需要时导入
    for s in segments:
        await edge_tts.Communicate(s['en'], voice, rate=rate).save(str(tmp / f"{s['id']}.mp3"))
        print('生成', s['id'])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--voice', default='en-US-GuyNeural')
    ap.add_argument('--rate', default='-8%')
    ap.add_argument('--out', default=str(ROOT / 'narration_en.mp3'))
    a = ap.parse_args()
    ffmpeg, ffprobe = shutil.which('ffmpeg'), shutil.which('ffprobe')
    if not ffmpeg or not ffprobe:
        raise SystemExit('需要先安装 ffmpeg（含 ffprobe），并加入 PATH。')
    n = json.loads((ROOT / 'narration.json').read_text(encoding='utf-8'))
    segs, end = n['segments'], float(n.get('end', 120))
    with tempfile.TemporaryDirectory() as d:
        tmp = Path(d)
        asyncio.run(synth(segs, a.voice, a.rate, tmp))
        inputs, filters = [], []
        for i, s in enumerate(segs):
            p = tmp / f"{s['id']}.mp3"
            slot = max(0.5, float(s['dur']) - 0.15)
            tempo = max(1.0, duration(ffprobe, p) / slot)  # 念不完就轻微提速，保证不压到下一句
            inputs += ['-i', str(p)]
            ms = int(float(s['t']) * 1000)
            filters.append(f'[{i}:a]atempo={tempo:.4f},adelay={ms}|{ms}[a{i}]')
        mix = ''.join(f'[a{i}]' for i in range(len(segs)))
        filters.append(f'{mix}amix=inputs={len(segs)}:normalize=0,apad[out]')
        subprocess.check_call([ffmpeg, '-y', '-v', 'error', *inputs, '-filter_complex', ';'.join(filters),
                               '-map', '[out]', '-t', f'{end:.2f}', '-ac', '2', '-ar', '48000', '-b:a', '160k', a.out])
    print('完成：', a.out)


if __name__ == '__main__':
    main()
