class VisualEngine {
  constructor() {
    this.canvas = document.getElementById('bgCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.video = document.getElementById('bgVideo');
    this.particles = [];
    this.mouse = { x: -1000, y: -1000 };
    this.analyser = null;
    this.dataArray = null;
    this.audioReactive = true;
    this.visScale = 1.0;

    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
    });

    this.initParticles(75);
    this.animate();
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  initParticles(count) {
    this.particles = [];
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: Math.random() * this.canvas.width,
        y: Math.random() * this.canvas.height,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        r: Math.random() * 2 + 1
      });
    }
  }

  connectAudio(audioElement) {
    if (this.analyser) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const src = ctx.createMediaElementSource(audioElement);
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 128;
      src.connect(this.analyser);
      this.analyser.connect(ctx.destination);
      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    } catch (e) {
      console.warn('Web Audio API init skipped:', e);
    }
  }

  setVideoWallpaper(file) {
    const url = URL.createObjectURL(file);
    this.video.src = url;
    this.video.classList.remove('hidden');
    this.video.play();
  }

  getBassEnergy() {
    if (!this.analyser || !this.audioReactive) return 0;
    this.analyser.getByteFrequencyData(this.dataArray);
    let sum = 0;
    for (let i = 0; i < 8; i++) sum += this.dataArray[i];
    return (sum / (8 * 255)); // от 0.0 до 1.0
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const bass = this.getBassEnergy();

    // Передаем пульсацию баса на обложку
    const cover = document.getElementById('coverImg');
    if (cover) {
      const scale = 1 + bass * 0.08 * this.visScale;
      cover.style.transform = `scale(${scale.toFixed(3)})`;
    }

    // Рисуем созвездия
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.x += p.vx * (1 + bass * 2);
      p.y += p.vy * (1 + bass * 2);

      if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
      if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r + bass * 2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(180, 130, 255, ${0.4 + bass * 0.5})`;
      ctx.fill();

      for (let j = i + 1; j < this.particles.length; j++) {
        const p2 = this.particles[j];
        const dist = Math.hypot(p.x - p2.x, p.y - p2.y);
        if (dist < 130) {
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.strokeStyle = `rgba(138, 43, 226, ${(1 - dist / 130) * 0.25})`;
          ctx.stroke();
        }
      }

      const mDist = Math.hypot(p.x - this.mouse.x, p.y - this.mouse.y);
      if (mDist < 160) {
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(this.mouse.x, this.mouse.y);
        ctx.strokeStyle = `rgba(0, 210, 255, ${(1 - mDist / 160) * 0.4})`;
        ctx.stroke();
      }
    }

    // Нижний спектральный эквалайзер
    if (this.analyser) {
      const bars = 40;
      const barWidth = (canvas.width * 0.5 * this.visScale) / bars;
      const startX = (canvas.width - bars * barWidth) / 2;

      for (let i = 0; i < bars; i++) {
        const val = this.audioReactive
          ? this.dataArray[i] / 255
          : (Math.sin(Date.now() * 0.003 + i * 0.3) + 1) * 0.15;

        const barHeight = val * 90 * this.visScale;
        const x = startX + i * barWidth;
        const y = canvas.height - 115 - barHeight;

        const grad = ctx.createLinearGradient(x, y, x, canvas.height - 115);
        grad.addColorStop(0, 'rgba(0, 225, 255, 0.75)');
        grad.addColorStop(1, 'rgba(138, 43, 226, 0.05)');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(x + 2, y, Math.max(2, barWidth - 4), barHeight, 4);
        ctx.fill();
      }
    }
  }
}

window.visualEngine = new VisualEngine();