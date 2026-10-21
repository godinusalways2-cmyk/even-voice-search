#!/usr/bin/env python3
"""Evaluate local Whisper speech-to-text without uploading audio.

Requires: pip install openai-whisper
Requires: ffmpeg executable. First run downloads model weights only.
Example: python training/evaluate_baseline.py whisper-dataset/test.jsonl --model base.en
"""
import argparse
import csv
import json
from pathlib import Path
import re
from collections import defaultdict

def word_tokens(s):
    return re.findall(r"[a-z0-9]+(?:'[a-z0-9]+)?",s.lower())

def edit_distance(a,b):
    previous=list(range(len(b)+1))
    for i,x in enumerate(a,1):
        current=[i]
        for j,y in enumerate(b,1):
            current.append(min(current[-1]+1,previous[j]+1,
                               previous[j-1]+(x!=y)))
        previous=current
    return previous[-1]

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("jsonl",type=Path)
    parser.add_argument("--model",default="base.en",help="Whisper checkpoint: tiny.en, base.en, small.en")
    parser.add_argument("--out",type=Path,default=Path("whisper-baseline-results.csv"))
    args=parser.parse_args()
    items=[json.loads(line) for line in args.jsonl.read_text(encoding="utf-8").splitlines() if line.strip()]
    if not items:raise ValueError("No examples in dataset")
    import torch
    import whisper
    device="cuda" if torch.cuda.is_available() else "cpu"
    print(f"Loading {args.model} on {device}. This may download model WEIGHTS once; voice audio is not uploaded.")
    model=whisper.load_model(args.model,device=device)
    summary=defaultdict(lambda:{"errors":0,"words":0,"utterances":0,"exact":0})
    rows=[]
    for i,rec in enumerate(items,1):
        truth=rec["text"]
        predicted=model.transcribe(rec["audio"],language="en",task="transcribe",
                                   fp16=(device=="cuda"),condition_on_previous_text=False)["text"].strip()
        a,b=word_tokens(truth),word_tokens(predicted)
        edits=edit_distance(a,b)
        condition=rec.get("condition","unknown")
        rows.append({"condition":condition,"prompt_id":rec.get("prompt_id",""),
                     "reference":truth,"prediction":predicted,"word_errors":edits,"reference_words":len(a)})
        for key in ["ALL",condition]:
            target=summary[key];target["errors"]+=edits;target["words"]+=len(a)
            target["utterances"]+=1;target["exact"]+=int(edits==0)
        print(f"{i}/{len(items)} {condition}: {edits}/{len(a)} word errors")
    args.out.parent.mkdir(parents=True,exist_ok=True)
    with args.out.open("w",encoding="utf-8-sig",newline="") as fp:
        writer=csv.DictWriter(fp,fieldnames=list(rows[0]))
        writer.writeheader();writer.writerows(rows)
    print("\nUncorrected STT results (not paragraph retrieval accuracy):")
    for key,stat in sorted(summary.items()):
        wer=stat["errors"]/max(1,stat["words"])
        exact=stat["exact"]/stat["utterances"]
        print(f"{key:10}  WER={100*wer:.1f}%  exact-utterance={100*exact:.1f}%  N={stat['utterances']}")
    print("CSV:",args.out.resolve())
if __name__=="__main__":
    main()
