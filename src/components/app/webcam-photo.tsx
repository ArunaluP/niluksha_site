"use client";

import { Camera, ImageUp, RefreshCw, Trash2, UserRound, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, cn } from "@/components/ui";
import { PHOTO_SIZE } from "@/features/employees/registration";

/**
 * Employee photo taken with the computer's webcam (or, if there is no camera, chosen from a file).
 * The picture is cropped to a square, resized to PHOTO_SIZE and sent as a small JPEG data URL.
 *
 *  value:    the new photo (data URL), "" = removed, null = unchanged (shows `current`)
 *  current:  URL of the saved photo, if any
 */
export function WebcamPhoto({
  value,
  current,
  onChange,
  error,
}: {
  value: string | null;
  current?: string | null;
  onChange: (v: string | null) => void;
  error?: string | string[];
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [live, setLive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const shown = value === null ? current : value || null;
  const msg = problem ?? (Array.isArray(error) ? error[0] : error);

  function stop() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setLive(false);
  }
  useEffect(() => stop, []); // turn the camera off when leaving the page

  async function start() {
    setProblem(null);
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setProblem("The camera only works on a secure (https://) address or on localhost. Use “Choose file” instead.");
      return;
    }
    setStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" }, audio: false });
      streamRef.current = stream;
      setLive(true);
      // the <video> is rendered once live = true
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      });
    } catch (e) {
      const name = (e as DOMException)?.name;
      setProblem(
        name === "NotAllowedError"
          ? "Camera access was blocked. Click the camera icon in the browser's address bar, allow it, then try again."
          : name === "NotFoundError" || name === "OverconstrainedError"
            ? "No webcam was found on this computer. Connect one, or use “Choose file”."
            : name === "NotReadableError"
              ? "The webcam is being used by another program (Zoom, Teams…). Close it and try again."
              : "The camera could not be started. Try again, or use “Choose file”.",
      );
    } finally {
      setStarting(false);
    }
  }

  /** Centre square of the source, scaled to PHOTO_SIZE, as JPEG. */
  function toJpeg(src: CanvasImageSource, w: number, h: number, mirror: boolean) {
    const side = Math.min(w, h);
    const canvas = document.createElement("canvas");
    canvas.width = PHOTO_SIZE;
    canvas.height = PHOTO_SIZE;
    const ctx = canvas.getContext("2d")!;
    if (mirror) {
      ctx.translate(PHOTO_SIZE, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(src, (w - side) / 2, (h - side) / 2, side, side, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
    return canvas.toDataURL("image/jpeg", 0.85);
  }

  function capture() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    onChange(toJpeg(v, v.videoWidth, v.videoHeight, true)); // mirrored, like the preview
    stop();
  }

  function pickFile(file: File | undefined) {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      setProblem("Choose a JPG or PNG picture.");
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      onChange(toJpeg(img, img.naturalWidth, img.naturalHeight, false));
      URL.revokeObjectURL(url);
      setProblem(null);
    };
    img.onerror = () => setProblem("That picture could not be opened.");
    img.src = url;
  }

  return (
    <div className="space-y-3">
      <div className="relative mx-auto aspect-square w-full max-w-[260px] overflow-hidden rounded-2xl border border-white bg-white/60 shadow-inner">
        {live ? (
          <>
            <video ref={videoRef} muted playsInline className="h-full w-full -scale-x-100 object-cover" />
            {/* face guide */}
            <div className="pointer-events-none absolute inset-[14%] rounded-full border-2 border-dashed border-white/80" />
          </>
        ) : shown ? (
          // eslint-disable-next-line @next/next/no-img-element -- data URL or our own photo API
          <img src={shown} alt="Employee photo" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-muted">
            <UserRound size={56} strokeWidth={1.2} />
            <span className="text-xs">No photo yet</span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        {live ? (
          <>
            <Button type="button" onClick={capture}>
              <Camera size={15} /> Take photo
            </Button>
            <Button type="button" variant="secondary" onClick={stop}>
              <X size={15} /> Cancel
            </Button>
          </>
        ) : (
          <>
            <Button type="button" variant={shown ? "secondary" : "primary"} onClick={start} disabled={starting}>
              {shown ? <RefreshCw size={15} /> : <Camera size={15} />} {starting ? "Starting camera…" : shown ? "Retake" : "Open webcam"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => fileRef.current?.click()}>
              <ImageUp size={15} /> Choose file
            </Button>
            {shown && (
              <Button type="button" variant="ghost" onClick={() => onChange(current ? "" : null)} title="Remove the photo">
                <Trash2 size={15} />
              </Button>
            )}
          </>
        )}
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
      </div>

      {msg ? <p className={cn("text-center text-xs", "text-rose-600")}>{msg}</p> : <p className="text-center text-xs text-muted">Face the camera, inside the circle, with good light.</p>}
    </div>
  );
}
