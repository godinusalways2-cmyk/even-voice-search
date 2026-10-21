# Whispered English recognition — model-development track (v0.7)

This is a *data collection and baseline evaluation* workflow, not an already-trained model.
No audio is automatically uploaded to GitHub or a third-party server. Training remains to be done after sufficient consented labeled recordings are collected.

## 1. Record real speech on iPhone
1. Open the site's whisper-lab.html in mobile Safari.
2. Load the local private English/Korean JSON if not already cached.
3. Start with **12 phrases × 3 speaking styles** (normal/quiet/whisper = 36 clips).
4. Keep the iPhone at a fixed 20–30 cm distance, in the same quiet room, using the same phone orientation.
5. Record every phrase manually. Listen to a sample before moving on. Save the resulting ZIP in iPhone Files.
6. For real fine-tuning, increase collection to at least 30–60 distinct phrases and repeat sessions on different days. More accurately labeled data is usually better; 36 utterances are only an initial feasibility experiment, not a robust training set.

## 2. Prepare waveform dataset on PC
Requires Python 3.10+ and [FFmpeg](https://ffmpeg.org/).

    python training/prepare_dataset.py even-whisper-lab-2026-10-21.zip --out whisper-dataset

Creates mono 16 kHz PCM WAV files and train.jsonl, validation.jsonl, test.jsonl.
The split groups by prompt_id so identical utterances aren't simultaneously in both training and test.

## 3. Evaluate existing deep-learning ASR locally
Requires FFmpeg and PyTorch. Install [openai-whisper](https://github.com/openai/whisper):

    python -m pip install -U openai-whisper
    python training/evaluate_baseline.py whisper-dataset/test.jsonl --model base.en

Outputs whisper-baseline-results.csv and word error rate separately for normal, soft and whispered speech. Model weights are downloaded once; voice audio is not uploaded.

## 4. Fine-tuning plan (after recorded data exists)
- Establish tiny.en and base.en baselines first, on a held-out text set.
- Use a proven [Hugging Face Whisper fine-tuning example](https://github.com/huggingface/transformers/tree/main/examples/pytorch/speech-recognition) to adapt openai/whisper-base.en or a smaller checkpoint on labeled audio.
- Train with a GPU-capable environment; compare to an unmodified base model on the exact same held-out examples. Avoid claiming improvement from training loss alone.
- If recordings are insufficient, consider openly licensed whispered speech datasets such as wTIMIT/CHAINS subject to each dataset's licensing conditions, or pseudo-whisper augmentation. This project includes none of these datasets.
- Test generalization to unseen text and ideally other speakers; single-person results do not establish population-wide performance.
- After validation, deploy an inference service or supported local runtime and connect it to the existing English→Korean retrieval system.

## 5. Metrics
Track at least: WER, phrase-level exact transcript rate, correct bilingual paragraph top-1 retrieval, top-3 retrieval, false-confident match rate, and speech-end to display latency. Compare all by speaking condition, same hardware, and same phrases.

## 6. Safety and privacy
The ZIP contains voice recordings and English copyrighted book excerpts. Keep private. Do not publish the corpus or recordings in this public GitHub repository. Record only with clear consent in a place where voice recording and any display of material are permitted. Safari recordings use the file format it supports (commonly AAC in MP4); FFmpeg converts those files to PCM for evaluation, but cannot reverse compression artifacts.
