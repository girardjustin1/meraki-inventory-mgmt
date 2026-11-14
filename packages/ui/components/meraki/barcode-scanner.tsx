"use client";

import { useEffect, useRef, useState } from "react";
import { CameraOff, Flash, FlashOff, Keyboard01, RefreshCcw01, Scan, XClose } from "@untitledui/icons";
import { Button as AriaButton } from "react-aria-components";
import { cx } from "@/utils/cx";

/** Formats the salon needs: retail barcodes, Code 128 / 39 for supplier cartons, QR for Meraki shelf and item labels. */
export const SCAN_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"] as const;

const DETECT_INTERVAL_MS = 125; // about 8 reads a second
const DUPLICATE_WINDOW_MS = 1500;

export type ScannerState = "requesting" | "scanning" | "denied" | "no-camera";

interface DetectedCode {
    rawValue: string;
    format: string;
}
interface DetectorLike {
    detect(source: HTMLVideoElement): Promise<DetectedCode[]>;
}
interface DetectorConstructor {
    new (options?: { formats?: string[] }): DetectorLike;
    getSupportedFormats?: () => Promise<readonly string[]>;
}

/**
 * Native BarcodeDetector where the browser has one that reads every format we need (Chrome on Android and macOS).
 * Everywhere else, including iPhone Safari, the ZXing WebAssembly ponyfill from `barcode-detector`.
 */
const createDetector = async (): Promise<DetectorLike> => {
    if ("BarcodeDetector" in globalThis) {
        try {
            const Native = (globalThis as unknown as { BarcodeDetector: DetectorConstructor }).BarcodeDetector;
            const supported = (await Native.getSupportedFormats?.()) ?? [];
            if (SCAN_FORMATS.every((f) => supported.includes(f))) return new Native({ formats: [...SCAN_FORMATS] });
        } catch {
            // Fall through to the ponyfill.
        }
    }
    const { BarcodeDetector } = await import("barcode-detector/ponyfill");
    return new BarcodeDetector({ formats: [...SCAN_FORMATS] });
};

export interface BarcodeScannerProps {
    /** Called once per read. `format` is the barcode format, "manual" for typed codes or "simulated" for demo scans. */
    onDetect: (code: string, format: string) => void;
    /** Keep the camera open but ignore reads, for example while a sheet is asking a question. */
    paused?: boolean;
    /** Skip the camera and offer these codes as buttons. Used in Storybook and on machines without a camera. */
    simulate?: { codes: string[]; label?: (code: string) => string };
    /** Show one state without touching the camera. For stories and tests. */
    forceState?: ScannerState;
    /** Line under the frame. */
    hint?: string;
    className?: string;
}

const STATUS: Record<ScannerState, string> = {
    requesting: "Starting camera",
    scanning: "Scanning",
    denied: "Camera blocked",
    "no-camera": "No camera",
};

const Corner = ({ className }: { className: string }) => <span aria-hidden="true" className={cx("absolute size-7 border-white drop-shadow-md", className)} />;

/** After this many failed reads in a row the reader is treated as broken (for example the WebAssembly file could not be fetched). */
const MAX_DETECT_FAILURES = 8;

/**
 * Camera barcode scanner.
 *
 * Opens the rear camera, reads about eight frames a second and reports each code once
 * (the same code is ignored until it has been out of view for 1.5 seconds). The torch button
 * appears when the camera supports it, and "Type the code" always works as a fallback.
 * Safe to render on the server: nothing touches `navigator` until the effect runs.
 */
export const BarcodeScanner = ({ onDetect, paused = false, simulate, forceState, hint, className }: BarcodeScannerProps) => {
    const simulated = Boolean(simulate);
    const live = !simulated && !forceState;

    const videoRef = useRef<HTMLVideoElement>(null);
    const trackRef = useRef<MediaStreamTrack | null>(null);
    const lastRead = useRef<{ code: string; at: number }>({ code: "", at: 0 });
    const onDetectRef = useRef(onDetect);
    const pausedRef = useRef(paused);

    const [cameraState, setCameraState] = useState<ScannerState>("requesting");
    const [insecure, setInsecure] = useState(false);
    const [detectorFailed, setDetectorFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const [torchSupported, setTorchSupported] = useState(false);
    const [torchOn, setTorchOn] = useState(false);
    const [flash, setFlash] = useState(false);
    const [manualOpen, setManualOpen] = useState(false);
    const [manual, setManual] = useState("");

    const state: ScannerState = forceState ?? (simulated ? "scanning" : cameraState);

    useEffect(() => {
        onDetectRef.current = onDetect;
        pausedRef.current = paused;
    });

    const report = (code: string, format: string) => {
        setFlash(true);
        window.setTimeout(() => setFlash(false), 350);
        if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(40);
        onDetectRef.current(code, format);
    };
    const reportRef = useRef(report);
    useEffect(() => {
        reportRef.current = report;
    });

    useEffect(() => {
        if (!live) return;
        let cancelled = false;
        let stream: MediaStream | undefined;
        let frame = 0;
        const video = videoRef.current;

        const start = async () => {
            if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
                // Browsers only expose the camera on https (or localhost).
                setInsecure(typeof window !== "undefined" && !window.isSecureContext);
                setCameraState("no-camera");
                return;
            }
            try {
                stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
            } catch (error) {
                if (cancelled) return;
                const name = error instanceof DOMException ? error.name : "";
                setCameraState(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "no-camera");
                return;
            }
            if (cancelled || !video) {
                stream.getTracks().forEach((t) => t.stop());
                return;
            }
            video.srcObject = stream;
            await video.play().catch(() => undefined);
            if (cancelled) return;

            const track = stream.getVideoTracks()[0] ?? null;
            trackRef.current = track;
            const capabilities = track?.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined;
            setTorchSupported(Boolean(capabilities?.torch));
            setCameraState("scanning");

            let detector: DetectorLike;
            try {
                detector = await createDetector();
            } catch {
                if (!cancelled) setDetectorFailed(true);
                return;
            }

            let lastAttempt = 0;
            let busy = false;
            let failures = 0;
            const tick = (now: number) => {
                if (cancelled) return;
                frame = requestAnimationFrame(tick);
                if (busy || pausedRef.current || now - lastAttempt < DETECT_INTERVAL_MS || video.readyState < 2) return;
                lastAttempt = now;
                busy = true;
                detector
                    .detect(video)
                    .then((found) => {
                        if (failures >= MAX_DETECT_FAILURES && !cancelled) setDetectorFailed(false);
                        failures = 0;
                        const hit = found[0];
                        if (!hit || cancelled) return;
                        const seen = lastRead.current;
                        const repeat = hit.rawValue === seen.code && now - seen.at < DUPLICATE_WINDOW_MS;
                        // Refresh the timestamp on every sighting, so a code held in frame is reported once.
                        lastRead.current = { code: hit.rawValue, at: now };
                        if (!repeat) reportRef.current(hit.rawValue, hit.format);
                    })
                    .catch(() => {
                        failures += 1;
                        if (failures === MAX_DETECT_FAILURES && !cancelled) setDetectorFailed(true);
                    })
                    .finally(() => {
                        busy = false;
                    });
            };
            frame = requestAnimationFrame(tick);
        };

        void start();

        return () => {
            cancelled = true;
            cancelAnimationFrame(frame);
            stream?.getTracks().forEach((t) => t.stop());
            trackRef.current = null;
            if (video) video.srcObject = null;
        };
    }, [live, attempt]);

    const retry = () => {
        setCameraState("requesting");
        setDetectorFailed(false);
        setTorchOn(false);
        setTorchSupported(false);
        setAttempt((n) => n + 1);
    };

    const toggleTorch = async () => {
        const next = !torchOn;
        try {
            await trackRef.current?.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
            setTorchOn(next);
        } catch {
            setTorchSupported(false);
        }
    };

    const submitManual = () => {
        const code = manual.trim();
        if (!code) return;
        setManual("");
        setManualOpen(false);
        report(code, "manual");
    };

    const blocked = state === "denied" || state === "no-camera";
    const statusText = paused ? "Paused" : simulated ? "Demo scanner" : STATUS[state];
    // Over live video the controls sit on a dark translucent fill so they stay readable on a bright shelf.
    const chip = cx(
        "flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-white ring-1 ring-white/25 outline-focus-ring transition duration-100 ease-linear ring-inset focus-visible:outline-2 focus-visible:outline-offset-2",
        live && state === "scanning" ? "bg-overlay/70 hover:bg-overlay/90" : "bg-white/15 hover:bg-white/25",
    );

    return (
        <div className={cx("relative isolate flex min-h-72 w-full flex-col overflow-hidden bg-primary-solid text-white", className)}>
            {live && (
                <video
                    ref={videoRef}
                    playsInline
                    muted
                    autoPlay
                    aria-hidden="true"
                    className={cx("absolute inset-0 -z-10 size-full object-cover", state !== "scanning" && "opacity-0")}
                />
            )}
            {/* A light dim over the picture keeps the white frame and labels readable against a bright shelf. */}
            {live && state === "scanning" && <div aria-hidden="true" className="absolute inset-0 -z-10 bg-overlay/25" />}

            {/* Status and torch */}
            <div className="flex items-center justify-between gap-2 px-4 pt-3">
                <p role="status" className="flex items-center gap-2 rounded-full bg-overlay/60 px-3 py-1.5 text-xs font-semibold">
                    <span
                        aria-hidden="true"
                        className={cx(
                            "size-2 rounded-full",
                            blocked
                                ? "bg-fg-error-secondary"
                                : paused || state === "requesting"
                                  ? "bg-fg-warning-secondary"
                                  : "animate-pulse bg-fg-success-secondary",
                        )}
                    />
                    {statusText}
                </p>
                {torchSupported && state === "scanning" && (
                    <AriaButton
                        aria-label={torchOn ? "Turn torch off" : "Turn torch on"}
                        aria-pressed={torchOn}
                        onPress={toggleTorch}
                        className={cx(
                            "flex size-11 cursor-pointer items-center justify-center rounded-full ring-1 ring-white/25 outline-focus-ring ring-inset focus-visible:outline-2 focus-visible:outline-offset-2",
                            torchOn ? "bg-brand-400 text-ink" : "bg-overlay/60 text-white",
                        )}
                    >
                        {torchOn ? <Flash className="size-5" aria-hidden="true" /> : <FlashOff className="size-5" aria-hidden="true" />}
                    </AriaButton>
                )}
            </div>

            {/* Frame, or the reason there is no picture */}
            <div className="flex min-h-28 flex-1 items-center justify-center px-6 py-3">
                {blocked ? (
                    <div className="flex max-w-sm flex-col items-center gap-2 text-center">
                        <span className="flex size-10 items-center justify-center rounded-full bg-white/15">
                            <CameraOff className="size-5" aria-hidden="true" />
                        </span>
                        {state === "denied" ? (
                            <>
                                <p className="text-md font-semibold">Camera access is off for this site</p>
                                <p className="text-sm text-white/80">
                                    On iPhone, open Settings, then Apps, Safari, Camera, and choose Allow. In Safari you can also tap the page menu in the
                                    address bar, then Website Settings, and set Camera to Allow. Come back and try again.
                                </p>
                            </>
                        ) : (
                            <>
                                <p className="text-md font-semibold">{insecure ? "The camera needs a secure connection" : "No camera found on this device"}</p>
                                <p className="text-sm text-white/80">
                                    {insecure
                                        ? "Open the app over https to scan. Until then, type the code."
                                        : "Type the code printed under the barcode, or use a phone to scan."}
                                </p>
                            </>
                        )}
                        <AriaButton onPress={retry} className={cx(chip, "mt-1 cursor-pointer")}>
                            <RefreshCcw01 className="size-4" aria-hidden="true" />
                            Try again
                        </AriaButton>
                    </div>
                ) : (
                    <div className={cx("relative h-32 w-full max-w-72 transition duration-100 ease-linear", flash && "scale-105", paused && "opacity-40")}>
                        <Corner className={cx("top-0 left-0 rounded-tl-xl border-t-4 border-l-4", flash && "border-brand-300")} />
                        <Corner className={cx("top-0 right-0 rounded-tr-xl border-t-4 border-r-4", flash && "border-brand-300")} />
                        <Corner className={cx("bottom-0 left-0 rounded-bl-xl border-b-4 border-l-4", flash && "border-brand-300")} />
                        <Corner className={cx("right-0 bottom-0 rounded-br-xl border-r-4 border-b-4", flash && "border-brand-300")} />
                        {simulated && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-white/70">
                                <Scan className="size-7" aria-hidden="true" />
                                <p className="text-xs font-medium">Camera preview is simulated here</p>
                            </div>
                        )}
                        {state === "requesting" && (
                            <p className="absolute inset-0 flex items-center justify-center text-sm font-medium text-white/80">Waiting for camera permission</p>
                        )}
                    </div>
                )}
            </div>

            {/* Controls */}
            <div className="flex flex-col gap-2 px-4 pb-4">
                {detectorFailed && (
                    <p className="rounded-lg bg-overlay/60 px-3 py-2 text-center text-xs">
                        The barcode reader could not load. Check the connection, or type the code.
                    </p>
                )}

                {manualOpen ? (
                    <div className="flex items-end gap-2 rounded-xl bg-primary p-2 shadow-lg">
                        <label className="flex min-w-0 flex-1 flex-col gap-1">
                            <span className="px-1 text-xs font-medium text-secondary">Code under the barcode</span>
                            <input
                                autoFocus
                                value={manual}
                                onChange={(e) => setManual(e.currentTarget.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") submitManual();
                                    if (e.key === "Escape") setManualOpen(false);
                                }}
                                inputMode="text"
                                autoCapitalize="characters"
                                autoCorrect="off"
                                autoComplete="off"
                                spellCheck={false}
                                enterKeyHint="search"
                                placeholder="0 12345 67890 5"
                                className="h-11 w-full min-w-0 rounded-lg bg-primary px-3 text-md text-primary ring-1 ring-primary outline-hidden ring-inset placeholder:text-placeholder focus:ring-2 focus:ring-brand"
                            />
                        </label>
                        <AriaButton
                            onPress={submitManual}
                            isDisabled={!manual.trim()}
                            className="flex h-11 shrink-0 cursor-pointer items-center rounded-lg bg-brand-400 px-4 text-sm font-semibold text-ink outline-focus-ring hover:bg-brand-300 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            Look up
                        </AriaButton>
                        <AriaButton
                            aria-label="Close typing"
                            onPress={() => setManualOpen(false)}
                            className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-fg-quaternary outline-focus-ring hover:bg-primary_hover focus-visible:outline-2"
                        >
                            <XClose className="size-5" aria-hidden="true" />
                        </AriaButton>
                    </div>
                ) : (
                    <>
                        {!blocked && (
                            <p
                                className={cx(
                                    "self-center rounded-full text-center text-sm",
                                    live && state === "scanning" ? "bg-overlay/70 px-3 py-1 text-white" : "text-white/80",
                                )}
                            >
                                {hint ?? "Hold the barcode or shelf label inside the frame"}
                            </p>
                        )}
                        {simulate && (
                            <div className="-mx-4 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Simulate a scan">
                                {simulate.codes.map((code) => (
                                    <AriaButton
                                        key={code}
                                        isDisabled={paused}
                                        onPress={() => report(code, "simulated")}
                                        className={cx(chip, "shrink-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50")}
                                    >
                                        <Scan className="size-4" aria-hidden="true" />
                                        <span className="max-w-44 truncate">{simulate.label?.(code) ?? code}</span>
                                    </AriaButton>
                                ))}
                            </div>
                        )}
                        <AriaButton onPress={() => setManualOpen(true)} className={cx(chip, "cursor-pointer justify-center self-center")}>
                            <Keyboard01 className="size-4" aria-hidden="true" />
                            Type the code
                        </AriaButton>
                    </>
                )}
            </div>
        </div>
    );
};
