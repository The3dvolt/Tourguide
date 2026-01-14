
import {-nextjs} from '@clerk/nextjs';
import {Speech} from 'lucide-react';

// NOTE: This is a placeholder for a real TTS implementation.
// The current implementation uses the browser's SpeechSynthesis API.
// It is not guaranteed to work on all browsers and devices.
// For a production-ready solution, consider using a cloud-based TTS service.

class TTSManager {
  private static instance: TTSManager;
  private synth: SpeechSynthesis | null = null;
  private voices: SpeechSynthesisVoice[] = [];
  private speechQueue: string[] = [];
  private isSpeaking = false;
  private isInitialized = false;

  private constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.synth = window.speechSynthesis;
      this.loadVoices();
    } else {
      console.error('Text-to-Speech not supported in this browser.');
    }
  }

  public static getInstance(): TTSManager {
    if (!TTSManager.instance) {
      TTSManager.instance = new TTSManager();
    }
    return TTSManager.instance;
  }

  private loadVoices() {
    if (this.synth) {
      this.voices = this.synth.getVoices();
      if (this.voices.length > 0) {
        this.isInitialized = true;
        this.processQueue();
      } else {
        this.synth.onvoiceschanged = () => {
          this.voices = this.synth!.getVoices();
          this.isInitialized = true;
          this.processQueue();
        };
      }
    }
  }

  public speak(text: string) {
    if (this.isInitialized) {
      this.addToQueue(text);
    } else {
      this.speechQueue.push(text);
    }
  }

  private addToQueue(text: string) {
    this.speechQueue.push(text);
    if (!this.isSpeaking) {
      this.processQueue();
    }
  }

  private processQueue() {
    if (this.speechQueue.length === 0) {
      return;
    }

    if (this.isSpeaking) {
      return;
    }

    this.isSpeaking = true;
    const text = this.speechQueue.shift();
    if (text) {
      this.performSpeak(text);
    }
  }

  private performSpeak(text: string) {
    if (this.synth) {
      const utterance = new SpeechSynthesisUtterance(text);
      // a placeholder for a voice selection logic
      // for now, we use the first available voice
      utterance.voice = this.voices[0];
      utterance.onend = () => {
        this.isSpeaking = false;
        this.processQueue();
      };
      utterance.onerror = (event) => {
        console.error('SpeechSynthesisUtterance.onerror', event);
        this.isSpeaking = false;
        this.processQueue();
      };
      this.synth.speak(utterance);
    }
  }

  public shutdown() {
    if (this.synth) {
      this.synth.cancel();
    }
  }
}

export default TTSManager;
