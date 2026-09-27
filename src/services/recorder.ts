/** Grabación de audio con MediaRecorder (iOS 14.3+). */
export class VoiceRecorder {
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private ctx: AudioContext | null = null;
  startedAt = 0;

  static supported() {
    return typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const types = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'];
    const mimeType = types.find((t) => MediaRecorder.isTypeSupported?.(t));
    this.rec = new MediaRecorder(this.stream, mimeType ? { mimeType, audioBitsPerSecond: 64_000 } : undefined);
    this.chunks = [];
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.rec.start(1000);
    this.startedAt = Date.now();
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
      const src = this.ctx.createMediaStreamSource(this.stream);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      src.connect(this.analyser);
    } catch {
      this.analyser = null;
    }
  }

  /** Nivel 0–1 para la onda. */
  level(): number {
    if (!this.analyser) return 0.2;
    const buf = new Uint8Array(this.analyser.fftSize);
    this.analyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (const v of buf) sum += ((v - 128) / 128) ** 2;
    return Math.min(1, Math.sqrt(sum / buf.length) * 6);
  }

  stop(): Promise<Blob> {
    return new Promise((resolve) => {
      if (!this.rec) return resolve(new Blob());
      const type = this.rec.mimeType || 'audio/mp4';
      this.rec.onstop = () => {
        resolve(new Blob(this.chunks, { type }));
        this.cleanup();
      };
      this.rec.stop();
    });
  }

  cancel() {
    try {
      this.rec?.stop();
    } catch {
      /* no-op */
    }
    this.cleanup();
  }

  private cleanup() {
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close().catch(() => undefined);
    this.rec = null;
    this.stream = null;
    this.analyser = null;
    this.ctx = null;
  }
}
