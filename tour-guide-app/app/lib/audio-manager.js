// lib/audio-manager.js
export class PCMStreamPlayer {
    constructor(sampleRate = 24000) {
      this.sampleRate = sampleRate;
      this.context = null;
      this.startTime = 0;
    }
  
    async init() {
      this.context = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: this.sampleRate,
      });
      if (this.context.state === 'suspended') {
        await this.context.resume();
      }
      this.startTime = this.context.currentTime;
    }
  
    feed(base64Data) {
      if (!this.context) return;
      
      // Decode base64 to binary
      const binaryString = window.atob(base64Data);
      const len = binaryString.length;
      const bytes = new Int16Array(len / 2);
      for (let i = 0; i < len; i += 2) {
        bytes[i / 2] = (binaryString.charCodeAt(i+1) << 8) | binaryString.charCodeAt(i);
      }
  
      // Convert to Float32 for Web Audio
      const float32Data = new Float32Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) {
        float32Data[i] = bytes[i] / 32768.0;
      }
  
      const buffer = this.context.createBuffer(1, float32Data.length, this.sampleRate);
      buffer.getChannelData(0).set(float32Data);
  
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      source.connect(this.context.destination);
  
      // Schedule playback to avoid gaps/pops
      const currentTime = this.context.currentTime;
      if (this.startTime < currentTime) {
        this.startTime = currentTime;
      }
      source.start(this.startTime);
      this.startTime += buffer.duration;
    }
  }