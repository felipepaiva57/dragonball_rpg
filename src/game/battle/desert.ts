import Phaser from 'phaser';
import { createSeededRng } from '@/shared/random';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';

export function drawDesert(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  const rect = (color: number, x: number, y: number, width: number, height: number) =>
    g.fillStyle(color).fillRect(x, y, width, height);
  const polygon = (color: number, coordinates: number[]) => {
    const points = [];
    for (let i = 0; i < coordinates.length; i += 2) {
      points.push(new Phaser.Math.Vector2(coordinates[i]!, coordinates[i + 1]!));
    }
    g.fillStyle(color).fillPoints(points, true);
  };

  const sky = [0x362343, 0x512d4a, 0x773b52, 0xa04a54, 0xc06258, 0xe08264, 0xf3aa75];
  sky.forEach((color, index) => rect(color, 0, index * 14, GAME_WIDTH, 14));

  g.fillStyle(0xffd197).fillCircle(128, 57, 20);
  rect(0xffdfaa, 109, 52, 38, 2);
  rect(0xffbc81, 110, 64, 36, 2);
  rect(0xea916d, 104, 70, 49, 2);
  rect(0xd57560, 20, 62, 30, 2);
  rect(0xd57560, 13, 64, 46, 2);
  rect(0xd57560, 183, 51, 28, 2);
  rect(0xc96c5c, 193, 53, 32, 2);

  polygon(0x9c4f57, [0, 80, 34, 75, 51, 82, 77, 83, 96, 78, 115, 81, 131, 87, 147, 82, 181, 82, 201, 74, 240, 78, 240, 108, 0, 108]);
  polygon(0x6c3b4e, [0, 55, 21, 55, 28, 62, 35, 62, 44, 78, 55, 78, 69, 95, 0, 116]);
  polygon(0x854658, [0, 60, 19, 60, 25, 68, 34, 68, 45, 88, 58, 92, 0, 98]);
  polygon(0x512f45, [0, 73, 18, 76, 36, 93, 54, 99, 0, 108]);

  polygon(0x693d4f, [154, 99, 174, 83, 185, 83, 198, 71, 204, 71, 211, 59, 240, 59, 240, 105]);
  polygon(0x814653, [173, 98, 187, 86, 197, 86, 212, 68, 240, 68, 240, 97]);
  polygon(0x553346, [196, 93, 220, 88, 229, 78, 240, 78, 240, 108, 197, 105]);

  rect(0x8c4650, 0, 99, GAME_WIDTH, GAME_HEIGHT - 99);
  polygon(0xa55b52, [0, 111, 46, 105, 94, 101, 166, 100, 240, 102, 240, 160, 0, 160]);
  polygon(0xc47b5b, [0, 125, 68, 115, 132, 109, 201, 107, 240, 109, 240, 160, 0, 160]);
  polygon(0xd58b62, [0, 143, 65, 124, 144, 117, 240, 115, 240, 135, 170, 141, 128, 160, 0, 160]);
  polygon(0xb46855, [228, 130, 240, 129, 240, 160, 131, 160, 160, 151]);

  const rng = createSeededRng(54);
  for (let i = 0; i < 83; i++) {
    const x = Math.floor(rng.next() * GAME_WIDTH);
    const y = 103 + Math.floor(rng.next() * 57);
    rect(i % 3 === 0 ? 0xe39b6d : 0xb57059, x, y, 1 + Math.floor(rng.next() * 7), 1);
  }

  polygon(0x804752, [5, 148, 9, 142, 16, 142, 20, 147, 26, 150, 3, 151]);
  polygon(0xa15c55, [7, 146, 10, 142, 16, 142, 19, 146]);
  polygon(0x864850, [215, 141, 218, 137, 224, 137, 227, 141, 233, 143, 212, 143]);
  polygon(0xab6556, [217, 140, 218, 137, 224, 137, 226, 140]);
}
