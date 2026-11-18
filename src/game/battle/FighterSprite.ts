import Phaser from 'phaser';

const POSES = { idle: 0, attack: 1, defend: 2, hit: 3 };
type Pose = keyof typeof POSES;

export class FighterSprite {
  private readonly sprite: Phaser.GameObjects.Sprite;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly x: number,
    private readonly y: number,
    private readonly baseFrame: number,
    private readonly direction: 1 | -1,
    private readonly reducedMotion: boolean,
  ) {
    scene.add.ellipse(x, y + 1, 34, 7, 0x743d45, 0.65);
    this.sprite = scene.add.sprite(x, y, 'fighters', baseFrame).setOrigin(0.5, 1).setFlipX(direction < 0);
  }

  reset(): void {
    this.pose('idle');
    this.sprite.setPosition(this.x, this.y).setAlpha(1).clearTint();
  }

  pose(pose: Pose): void {
    this.sprite.setFrame(this.baseFrame + POSES[pose]);
  }

  async strike(staff: boolean): Promise<void> {
    this.pose('attack');
    const direction = this.direction;
    await this.tween({ x: this.x + direction * (staff ? 24 : 60), duration: 120 });
    const staffGraphic = staff
      ? this.scene.add.rectangle(this.sprite.x + direction * 26, this.y - 15, 35, 2, 0xc62438).setStrokeStyle(1, 0x67263c)
      : undefined;
    await this.wait(100);
    staffGraphic?.destroy();
    await this.tween({ x: this.x, duration: 130 });
    this.pose('idle');
  }

  async hit(guarded: boolean): Promise<void> {
    this.pose(guarded ? 'defend' : 'hit');
    this.sprite.setTint(guarded ? 0xbedfff : 0xffdfab).setTintMode(Phaser.TintModes.FILL);
    this.burst(guarded ? 0xc7eaff : 0xffcf80, 5);
    await this.tween({ x: this.x - this.direction * 5, duration: 70, yoyo: true });
    this.sprite.clearTint();
    if (!guarded) this.pose('idle');
  }

  async faint(): Promise<void> {
    this.pose('hit');
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
