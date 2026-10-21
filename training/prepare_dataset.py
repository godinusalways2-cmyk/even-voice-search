#!/usr/bin/env python3
"""Convert consented iPhone whisper-lab ZIP to 16 kHz mono WAV and grouped train/val/test JSONL.
No audio uploads. Requires local ffmpeg installed (https://ffmpeg.org/).
"""
import argparse
import hashlib
import json
from pathlib import Path
import random
import subprocess
import tempfile
import zipfile

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("zip", type=Path, help="ZIP downloaded from whisper-lab")
    p.add_argument("--out",type=Path,default=Path("whisper-dataset"))
    p.add_argument("--seed",type=int,default=42)
    args=p.parse_args()
    args.out.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(args.zip) as archive:
        manifest=json.loads(archive.read("manifest.json"))
        if manifest.get("format")!="even-whisper-lab-v1":
            raise ValueError("Unexpected manifest format")
        clips=manifest.get("clips",[])
        if not clips:raise ValueError("No audio clips")
        prompts=sorted(set(str(c["prompt_id"]) for c in clips))
        if len(prompts)<3:
            raise ValueError("Need at least 3 different prompts to prevent train/test leakage")
        random.Random(args.seed).shuffle(prompts)
        n_train=max(1,round(len(prompts)*0.7))
        n_val=max(1,round(len(prompts)*0.15))
        if n_train+n_val>=len(prompts):n_val=1;n_train=len(prompts)-2
        assignment={key:("train" if i<n_train else ("validation" if i<n_train+n_val else "test"))
                    for i,key in enumerate(prompts)}
        result={split:[] for split in ["train","validation","test"]}
        wav_dir=args.out/"wav"
        wav_dir.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory() as temporary:
            temp=Path(temporary)
            for i,c in enumerate(clips):
                source=str(c["filename"])
                if not source.startswith("audio/") or ".." in source:
                    raise ValueError("Bad audio filename in archive")
                raw=archive.read(source)
                input_path=temp/("source_"+str(i)+Path(source).suffix)
                input_path.write_bytes(raw)
                output_path=wav_dir/(f"{i:05d}.wav")
                subprocess.run(["ffmpeg","-hide_banner","-loglevel","error","-y",
                                "-i",str(input_path),"-ac","1","-ar","16000",
                                "-c:a","pcm_s16le",str(output_path)],check=True)
                entry={
                    "audio":str(output_path.resolve()),
                    "text":str(c["expected_text"]).strip(),
                    "condition":str(c["condition"]),
                    "prompt_id":str(c["prompt_id"]),
                    "chapter":str(c.get("chapter","")),
                    "duration_ms":int(c.get("duration_ms",0)),
                }
                if not entry["text"]:raise ValueError("Missing expected transcript")
                result[assignment[entry["prompt_id"]]].append(entry)
    for split,rows in result.items():
        with (args.out/(split+".jsonl")).open("w",encoding="utf-8") as fp:
            for row in rows:fp.write(json.dumps(row,ensure_ascii=False)+"\n")
    print("Converted",sum(map(len,result.values())),"clips into",args.out.resolve())
    for split,rows in result.items():
        cond={x:sum(r["condition"]==x for r in rows) for x in ["normal","soft","whisper"]}
        print(f" {split}: {len(rows)} clips from {len(set(r['prompt_id'] for r in rows))} unique prompts, conditions {cond}")
    print("Important: splits are grouped by prompt, preventing identical text from appearing in train and test.")
if __name__=="__main__":
    main()
