import base64
import os
import tempfile
import requests
import cv2


from fastapi import FastAPI, UploadFile, File, HTTPException  # pyright: ignore[reportMissingImports]

app = FastAPI(title="Campus Sentinel AI Backend")

OLLAMA_URL = "http://localhost:11434/api/chat"
MODEL = "qwen2.5vl:7b-q4_K_M"

MAX_VIDEO_SIZE = 100 * 1024 * 1024
MAX_IMAGE_SIZE = 10 * 1024 * 1024
MAX_FRAMES = 3
MAX_DIMENSION = 448
CONTEXT_SIZE = 4096


def analyse_with_qwen(prompt, images):
    payload = {
        "model": MODEL,
        "messages": [{
            "role": "user",
            "content": prompt,
            "images": images
        }],
        "stream": False,
        "keep_alive": "10m",
        "options": {
            "num_ctx": CONTEXT_SIZE
        }
    }

    response = requests.post(
        OLLAMA_URL,
        json=payload,
        timeout=600
    )

    response.raise_for_status()
    return response.json()["message"]["content"]


def encode_image(image_bytes):
    encoded = base64.b64encode(image_bytes).decode("utf-8")
    return encoded


def prepare_frame(frame):
    height, width = frame.shape[:2]

    scale = min(
        1.0,
        MAX_DIMENSION / max(height, width)
    )

    if scale < 1:
        frame = cv2.resize(
            frame,
            (int(width * scale), int(height * scale))
        )

    success, buffer = cv2.imencode(
        ".jpg",
        frame,
        [cv2.IMWRITE_JPEG_QUALITY, 65]
    )

    if not success:
        return None

    return encode_image(buffer.tobytes())


@app.get("/")
def home():
    return {
        "system": "Campus Sentinel AI",
        "status": "running"
    }


@app.get("/health")
def health():
    try:
        response = requests.get(
            "http://localhost:11434/api/tags",
            timeout=5
        )
        response.raise_for_status()

        return {
            "backend": "online",
            "ollama": "connected",
            "model": MODEL
        }

    except requests.RequestException as error:
        raise HTTPException(
            503,
            detail=f"Ollama unavailable: {error}"
        )


@app.post("/analyze-image")
def analyze_image(file: UploadFile = File(...)):

    if file.content_type not in [
        "image/jpeg",
        "image/png",
        "image/webp"
    ]:
        raise HTTPException(
            400,
            "Upload JPG, PNG or WEBP"
        )

    image_bytes = file.file.read(MAX_IMAGE_SIZE + 1)

    if len(image_bytes) > MAX_IMAGE_SIZE:
        raise HTTPException(413, "Image exceeds 10 MB")

    if not image_bytes:
        raise HTTPException(400, "Empty image")

    image_base64 = encode_image(image_bytes)

    prompt = (
        "Describe visible people, their observable activities, "
        "interactions and surroundings. Separate observations "
        "from uncertain interpretations. Do not infer intent."
    )

    try:
        analysis = analyse_with_qwen(
            prompt,
            [image_base64]
        )

        return {
            "status": "success",
            "filename": file.filename,
            "analysis": analysis,
            "model": MODEL
        }

    except requests.RequestException as error:
        details = (
            error.response.text
            if error.response is not None
            else str(error)
        )
        raise HTTPException(502, detail=details)


@app.post("/analyze-video")
def analyze_video(file: UploadFile = File(...)):

    filename = file.filename or "video.mp4"
    extension = os.path.splitext(filename)[1].lower()

    allowed = {
        ".mp4", ".avi", ".mov", ".mkv", ".webm"
    }

    if extension not in allowed:
        raise HTTPException(
            400,
            "Supported formats: MP4, AVI, MOV, MKV, WEBM"
        )

    video_bytes = file.file.read(MAX_VIDEO_SIZE + 1)

    if len(video_bytes) > MAX_VIDEO_SIZE:
        raise HTTPException(413, "Video exceeds 100 MB")

    if not video_bytes:
        raise HTTPException(400, "Empty video")

    temp_path = None
    capture = None

    try:
        with tempfile.NamedTemporaryFile(
            suffix=extension,
            delete=False
        ) as temp:
            temp.write(video_bytes)
            temp_path = temp.name

        capture = cv2.VideoCapture(temp_path)

        if not capture.isOpened():
            raise HTTPException(
                400,
                "Cannot read video"
            )

        fps = capture.get(cv2.CAP_PROP_FPS)
        total_frames = int(
            capture.get(cv2.CAP_PROP_FRAME_COUNT)
        )

        if fps <= 0 or total_frames <= 0:
            raise HTTPException(
                400,
                "Invalid video metadata"
            )

        duration = total_frames / fps

        sample_count = min(
            MAX_FRAMES,
            max(1, int(duration) + 1)
        )

        if sample_count == 1:
            timestamps = [0.0]
        else:
            timestamps = [
                i * duration / (sample_count - 1)
                for i in range(sample_count)
            ]

        extracted = []

        for timestamp in timestamps:

            frame_number = min(
                int(timestamp * fps),
                total_frames - 1
            )

            capture.set(
                cv2.CAP_PROP_POS_FRAMES,
                frame_number
            )

            success, frame = capture.read()

            if not success:
                continue

            encoded = prepare_frame(frame)

            if encoded:
                extracted.append({
                    "timestamp": round(timestamp, 2),
                    "image": encoded
                })

        capture.release()
        capture = None

        if not extracted:
            raise HTTPException(
                400,
                "No frames extracted"
            )

        # Analyse each frame separately to reduce
        # the context load on the vision model.
        observations = []

        for index, item in enumerate(extracted):

            prompt = (
                "You are analysing a sampled frame from a "
                "campus security video. Describe only visible "
                "people, their observable actions and the "
                "environment. Note possible safety concerns "
                "without assuming intent. This is frame "
                f"{index + 1} of {len(extracted)}, at "
                f"{item['timestamp']} seconds."
            )

            analysis = analyse_with_qwen(
                prompt,
                [item["image"]]
            )

            observations.append({
                "timestamp": item["timestamp"],
                "observation": analysis
            })

        # Compare the individual observations.
        # Send text only, not all images again.
        temporal_prompt = (
            "Review these chronological observations "
            "from a campus security video:\n\n"
            + str(observations)
            + "\n\nDescribe changes over time. Identify "
            "possible falls, physical altercations, "
            "unauthorized entry or other safety concerns "
            "only when supported by evidence. Give relevant "
            "timestamps. Distinguish observations from "
            "uncertainty. Do not infer intent. Mark possible "
            "incidents REQUIRES HUMAN REVIEW."
        )

        temporal_analysis = analyse_with_qwen(
            temporal_prompt,
            []
        )

        return {
            "status": "success",
            "filename": filename,
            "duration_seconds": round(duration, 2),
            "frames_analysed": len(observations),
            "observations": observations,
            "temporal_analysis": temporal_analysis,
            "review_status": "REQUIRES HUMAN REVIEW",
            "model": MODEL
        }

    except requests.RequestException as error:

        details = (
            error.response.text
            if error.response is not None
            else str(error)
        )

        raise HTTPException(
            502,
            detail=f"Ollama inference failed: {details}"
        )

    finally:

        if capture is not None:
            capture.release()

        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)