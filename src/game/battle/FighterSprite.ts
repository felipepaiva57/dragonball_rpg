import Phaser from 'phaser';

// fighters.png: uma linha de 12 células por lutador, olhando para a direita.
const ROW = { 'goku-kid': 0, yamcha: 12 } as const;
const POSES = {
  idle: 0, defend: 1, hit: 2, faint: 3,
  punchReady: 4, punch: 5, kickReady: 6, kick: 7,
  // Nas duas últimas poses de golpe, cada linha tem desenhos próprios.
  staffReady: 8, staff: 9, recoil: 8, kickReturn: 9,
  charge: 10, item: 11,
} as const;
type Pose = keyof typeof POSES;

export class FighterSprite {
  private readonly sprite: Phaser.GameObjects.Sprite;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly x: number,
    private readonly y: number,
    private readonly character: keyof typeof ROW,
    private readonly direction: 1 | -1,
    private readonly reducedMotion: boolean,
  ) {
    scene.add.ellipse(x, y + 1, 34, 7, 0x743d45, 0.65);
    this.sprite = scene.add.sprite(x, y, 'fighters', ROW[character]).setOrigin(0.5, 1).setFlipX(direction < 0);
  }

  reset(): void {
    this.pose('idle');
    this.sprite.setPosition(this.x, this.y).setAlpha(1).clearTint();
  }

  pose(pose: Pose): void {
    this.sprite.setFrame(ROW[this.character] + POSES[pose]);
  }

  async strike(moveId: string): Promise<void> {
    let ready: Pose = 'punchReady';
    let contact: Pose = 'punch';
    let recovery: Pose = 'punchReady';
    if (moveId === 'kick') {
      ready = 'kickReady';
      contact = 'kick';
      recovery = this.character === 'yamcha' ? 'kickReturn' : 'kickReady';
    } else if (moveId === 'power-pole-strike' && this.character === 'goku-kid') {
      ready = recovery = 'staffReady';
      contact = 'staff';
    }

    this.pose(ready);
    await this.wait(95);
    this.pose(contact);
    const reach = contact === 'staff' ? 72 : 78;
    await this.tween({ x: this.x + this.direction * reach, duration: 115 });
    await this.wait(95);
    this.pose(recovery);
    await this.tween({ x: this.x, duration: 115 });
    this.pose('idle');
  }

  async useItem(): Promise<void> {
    this.pose('item');
    await this.wait(210);
    this.pose('idle');
  }

  async charge(): Promise<void> {
    this.pose('charge');
    await this.pulse(0x84ccff);
    this.pose('idle');
  }

  async hit(guarded: boolean): Promise<void> {
    this.pose(guarded ? 'defend' : 'hit');
    this.sprite.setTint(guarded ? 0xbedfff : 0xffdfab).setTintMode(Phaser.TintModes.FILL);
    this.burst(guarded ? 0xc7eaff : 0xffcf80, 5);
    await this.tween({ x: this.x - this.direction * 5, duration: 70, yoyo: true });
    this.sprite.clearTint();
    if (!guarded) {
      if (this.character === 'yamcha') {
        this.pose('recoil');
        await this.wait(75);
      }
      this.pose('idle');
    }
  }

  async faint(): Promise<void> {
    this.pose('faint');
    await this.tween({ alpha: 0.38, y: this.y + 5, duration: 220 });
  }

  async pulse(color: number): Promise<void> {
    this.burst(color, 6);
    await this.wait(160);
  }

  private burst(color: number, amount: number): void {
    if (this.reducedMotion) return;
    for (let i = 0; i < amount; i++) {
      const angle = i * Math.PI * 2 / amount;
      const x = this.x + Math.cos(angle) * 13;
      const y = this.y - 21 + Math.sin(angle) * 13;
      const spark = this.scene.add.rectangle(x, y, 2, 2, color);
      this.scene.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * 13,
        y: y + Math.sin(angle) * 13,
        alpha: 0,
        duration: 220,
        onComplete: () => { spark.destroy(); },
      });
    }
  }

  private wait(duration: number): Promise<void> {
    if (this.reducedMotion) return Promise.resolve();
    return new Promise((resolve) => this.scene.time.delayedCall(duration, resolve));
  }

  private tween(config: { x?: number; y?: number; alpha?: number; duration: number; yoyo?: boolean }): Promise<void> {
    if (this.reducedMotion) {
      if (!config.yoyo) {
        this.sprite.setPosition(config.x ?? this.sprite.x, config.y ?? this.sprite.y);
        if (config.alpha !== undefined) this.sprite.setAlpha(config.alpha);
      }
      return Promise.resolve();
    }
    return new Promise((resolve) => this.scene.tweens.add({ targets: this.sprite, ...config, onComplete: () => resolve() }));
  }
}
