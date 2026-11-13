class AudioCore {
  constructor() {
    this.audio = new Audio();
    this.audio.crossOrigin = 'anonymous';
    this.audio.volume = 0.5;
  }

  playUrl(url) {
    this.audio.src = url;
    return this.audio.play();
  }

  toggle() {
    if (!this.audio.src) return false;
    if (this.audio.paused) {
      this.audio.play();
      return true;
    } else {
      this.audio.pause();
      return false;
    }
  }

  setVolume(val) {
    this.audio.volume = Math.max(0, Math.min(1, val));
  }

  seek(percent) {
    if (this.audio.duration) {
      this.audio.currentTime = (percent / 100) * this.audio.duration;
    }
  }

  onTimeUpdate(callback) {
    this.audio.addEventListener('timeupdate', () => {
      const progress = this.audio.duration ? (this.audio.currentTime / this.audio.duration) * 100 : 0;
      callback(progress, this.audio.currentTime, this.audio.duration || 0);
    });
  }

  onEnded(callback) {
    this.audio.addEventListener('ended', callback);
  }
}

window.audioCore = new AudioCore();