import * as THREE from "three";
import { ISLAND_RADIUS } from "../core/simulation.js";
import type { GameTuning, SnapshotRecord } from "../core/types.js";

interface LanternVisual {
  group: THREE.Group;
  paperMesh: THREE.Mesh;
  paperMat: THREE.MeshStandardMaterial;
  light: THREE.PointLight;
  safeRing: THREE.Mesh;
  progressRing: THREE.Mesh;
  wasLit: boolean;
}

interface ShadeVisual {
  group: THREE.Group;
  bodyMat: THREE.MeshStandardMaterial;
  eyeMat: THREE.MeshBasicMaterial;
  haloMesh: THREE.Mesh;
}

interface FloatingPaperLantern {
  mesh: THREE.Group;
  speedY: number;
  driftPhase: number;
  baseX: number;
  baseZ: number;
  age: number;
}

interface PulseWave {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  age: number;
  maxAge: number;
  maxRadius: number;
}

/**
 * Three.js 3D renderer for Đảo Đèn Lồng (Night 1: Đảo Bến).
 * Purely visual presentation of Simulation snapshots + client-only creative visuals.
 */
export class IslandRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;

  private ambientLight: THREE.AmbientLight;
  private hemiLight: THREE.HemisphereLight;
  private moonLight: THREE.DirectionalLight;
  private fog: THREE.FogExp2;

  private mayGroup: THREE.Group;
  private mayLanternLight: THREE.PointLight;
  private mayBodyMesh: THREE.Mesh;
  private orbitingMotes: THREE.Mesh[] = [];

  private lanternMap = new Map<string, LanternVisual>();
  private moteMap = new Map<string, THREE.Group>();
  private shadeMap = new Map<string, ShadeVisual>();

  private pulseWaves: PulseWave[] = [];
  private skyLanterns: FloatingPaperLantern[] = [];
  private cloudRing: THREE.Group;
  private elapsed = 0;

  private tuning: GameTuning;

  constructor(container: HTMLElement, tuning: GameTuning) {
    this.tuning = tuning;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b1024);
    this.fog = new THREE.FogExp2(0x0b1024, 0.013);
    this.scene.fog = this.fog;

    this.camera = new THREE.PerspectiveCamera(
      55,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.2,
      260
    );

    // Lighting — starts dark night, warms up as lanterns are lit
    this.ambientLight = new THREE.AmbientLight(0x2d3a68, 0.55);
    this.scene.add(this.ambientLight);

    this.hemiLight = new THREE.HemisphereLight(0x4b5f9e, 0x161b2e, 0.55);
    this.scene.add(this.hemiLight);

    this.moonLight = new THREE.DirectionalLight(0x9bb6ff, 0.7);
    this.moonLight.position.set(28, 46, -24);
    this.moonLight.castShadow = true;
    this.moonLight.shadow.mapSize.set(1024, 1024);
    this.moonLight.shadow.camera.near = 5;
    this.moonLight.shadow.camera.far = 140;
    const d = 50;
    this.moonLight.shadow.camera.left = -d;
    this.moonLight.shadow.camera.right = d;
    this.moonLight.shadow.camera.top = d;
    this.moonLight.shadow.camera.bottom = -d;
    this.scene.add(this.moonLight);

    this.buildSkyAndMoon();
    this.buildIsland();
    this.cloudRing = this.buildSeaOfClouds();
    this.scene.add(this.cloudRing);

    const may = this.buildMayCharacter();
    this.mayGroup = may.group;
    this.mayLanternLight = may.lanternLight;
    this.mayBodyMesh = may.bodyMesh;
    this.scene.add(this.mayGroup);

    window.addEventListener("resize", this.handleResize);
  }

  private handleResize = (): void => {
    const parent = this.renderer.domElement.parentElement;
    if (!parent) return;
    const w = parent.clientWidth;
    const h = Math.max(1, parent.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  private buildSkyAndMoon(): void {
    // Twinkling starfield dome
    const starCount = 450;
    const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const theta = ((i * 137.508) % 360) * (Math.PI / 180);
      const phi = Math.acos(0.15 + ((i * 0.6180339) % 0.85));
      const r = 140;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi);
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xffeec8,
      size: 1.25,
      transparent: true,
      opacity: 0.85,
      fog: false,
    });
    this.scene.add(new THREE.Points(starGeo, starMat));

    // Warm fairytale moon
    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(7.5, 24, 24),
      new THREE.MeshBasicMaterial({ color: 0xfff0c4, fog: false })
    );
    moon.position.set(58, 72, -64);
    this.scene.add(moon);
  }

  private buildIsland(): void {
    // Main circular grassy hilltop of Đảo Bến (top surface at Y = 0)
    const topGeo = new THREE.CylinderGeometry(ISLAND_RADIUS, ISLAND_RADIUS + 2.5, 5, 48);
    const topMat = new THREE.MeshStandardMaterial({
      color: 0x20323e,
      roughness: 0.92,
      metalness: 0.04,
    });
    const islandMesh = new THREE.Mesh(topGeo, topMat);
    islandMesh.position.y = -2.5;
    islandMesh.receiveShadow = true;
    this.scene.add(islandMesh);

    // Underside cliff rock floating in the sea of clouds
    const rockGeo = new THREE.ConeGeometry(ISLAND_RADIUS + 1.5, 24, 24);
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x151a2b,
      roughness: 0.95,
    });
    const rock = new THREE.Mesh(rockGeo, rockMat);
    rock.rotation.x = Math.PI;
    rock.position.y = -17;
    this.scene.add(rock);

    // Central stone plaza at (0, 0, 0)
    const plaza = new THREE.Mesh(
      new THREE.CylinderGeometry(4.2, 4.6, 0.12, 24),
      new THREE.MeshStandardMaterial({ color: 0x3b4859, roughness: 0.85 })
    );
    plaza.position.y = 0.02;
    plaza.receiveShadow = true;
    this.scene.add(plaza);

    // Soft wooden pier railing posts around the circular edge
    const postCount = 36;
    const postGeo = new THREE.CylinderGeometry(0.18, 0.22, 1.35, 8);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x4b382a, roughness: 0.9 });
    for (let i = 0; i < postCount; i++) {
      const a = (i / postCount) * Math.PI * 2;
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(Math.cos(a) * (ISLAND_RADIUS - 0.6), 0.65, Math.sin(a) * (ISLAND_RADIUS - 0.6));
      post.castShadow = true;
      this.scene.add(post);
    }

    // Ring railing rope
    const ropeGeo = new THREE.TorusGeometry(ISLAND_RADIUS - 0.6, 0.07, 8, 72);
    const ropeMat = new THREE.MeshStandardMaterial({ color: 0x7d6247, roughness: 0.85 });
    const rope = new THREE.Mesh(ropeGeo, ropeMat);
    rope.rotation.x = Math.PI / 2;
    rope.position.y = 1.05;
    this.scene.add(rope);

    // Stylized trees & warm rocks decorating outer perimeter
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3e2d24, roughness: 0.9 });
    const foliageMat = new THREE.MeshStandardMaterial({ color: 0x1d3b3f, roughness: 0.85 });
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + 0.28;
      const r = 34 + (i % 3) * 2.2;
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 2.6, 7), trunkMat);
      trunk.position.y = 1.3;
      trunk.castShadow = true;
      tree.add(trunk);

      const crown1 = new THREE.Mesh(new THREE.ConeGeometry(1.9, 3.2, 8), foliageMat);
      crown1.position.y = 3.4;
      crown1.castShadow = true;
      tree.add(crown1);

      const crown2 = new THREE.Mesh(new THREE.ConeGeometry(1.35, 2.5, 8), foliageMat);
      crown2.position.y = 5.0;
      crown2.castShadow = true;
      tree.add(crown2);

      tree.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      this.scene.add(tree);
    }
  }

  private buildSeaOfClouds(): THREE.Group {
    const group = new THREE.Group();
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0x252c4a,
      roughness: 1.0,
      transparent: true,
      opacity: 0.72,
    });
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      const dist = ISLAND_RADIUS + 14 + (i % 4) * 7;
      const puff = new THREE.Mesh(
        new THREE.SphereGeometry(7 + (i % 3) * 3, 12, 10),
        cloudMat
      );
      puff.scale.set(1.6, 0.45, 1.3);
      puff.position.set(Math.cos(a) * dist, -4.5 + (i % 3) * 1.2, Math.sin(a) * dist);
      group.add(puff);
    }
    return group;
  }

  private buildMayCharacter(): {
    group: THREE.Group;
    lanternLight: THREE.PointLight;
    bodyMesh: THREE.Mesh;
  } {
    const group = new THREE.Group();

    // Tunic / robe body
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x356478,
      roughness: 0.7,
    });
    const bodyMesh = new THREE.Mesh(new THREE.ConeGeometry(0.48, 1.15, 12), bodyMat);
    bodyMesh.position.y = 0.62;
    bodyMesh.castShadow = true;
    group.add(bodyMesh);

    // Warm orange scarf
    const scarf = new THREE.Mesh(
      new THREE.TorusGeometry(0.28, 0.09, 8, 16),
      new THREE.MeshStandardMaterial({ color: 0xe87b35, roughness: 0.65 })
    );
    scarf.rotation.x = Math.PI / 2;
    scarf.position.y = 1.18;
    group.add(scarf);

    // Head
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.27, 14, 14),
      new THREE.MeshStandardMaterial({ color: 0xf6d4b3, roughness: 0.75 })
    );
    head.position.y = 1.42;
    head.castShadow = true;
    group.add(head);

    // Nón lá (Vietnamese conical leaf hat)
    const nonLa = new THREE.Mesh(
      new THREE.ConeGeometry(0.76, 0.46, 18),
      new THREE.MeshStandardMaterial({
        color: 0xd9b878,
        roughness: 0.85,
        side: THREE.DoubleSide,
      })
    );
    nonLa.position.y = 1.72;
    nonLa.castShadow = true;
    group.add(nonLa);

    // Small lantern hanging from front brim of Mây's nón lá
    const cord = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, 0.28, 6),
      new THREE.MeshBasicMaterial({ color: 0x7a5533 })
    );
    cord.position.set(0, 1.38, 0.66);
    group.add(cord);

    const miniLantern = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 12, 12),
      new THREE.MeshStandardMaterial({
        color: 0xffd066,
        emissive: 0xff9b26,
        emissiveIntensity: 2.2,
      })
    );
    miniLantern.scale.set(0.85, 1.15, 0.85);
    miniLantern.position.set(0, 1.2, 0.66);
    group.add(miniLantern);

    const lanternLight = new THREE.PointLight(0xffaa44, 4.5, 13, 1.5);
    lanternLight.position.set(0, 1.45, 0.75);
    group.add(lanternLight);

    // Creative feature: orbiting carried firefly wisps around Mây's nón lá
    for (let i = 0; i < this.tuning.carry_capacity; i++) {
      const orb = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 10, 10),
        new THREE.MeshBasicMaterial({ color: 0xffd56b })
      );
      orb.visible = false;
      group.add(orb);
      this.orbitingMotes.push(orb);
    }

    return { group, lanternLight, bodyMesh };
  }

  private createLanternVisual(id: string, pos: [number, number, number]): LanternVisual {
    const group = new THREE.Group();
    group.position.set(pos[0], pos[1], pos[2]);

    // Stone base
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.95, 1.2, 0.65, 8),
      new THREE.MeshStandardMaterial({ color: 0x3b4457, roughness: 0.9 })
    );
    base.position.y = 0.32;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    // Wooden pillar
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.32, 2.4, 8),
      new THREE.MeshStandardMaterial({ color: 0x52392b, roughness: 0.85 })
    );
    pillar.position.y = 1.8;
    pillar.castShadow = true;
    group.add(pillar);

    // Paper lantern chamber
    const paperMat = new THREE.MeshStandardMaterial({
      color: 0x454d66,
      emissive: 0xff9a28,
      emissiveIntensity: 0.05,
      roughness: 0.45,
    });
    const paperMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.62, 1.35, 8), paperMat);
    paperMesh.position.y = 3.5;
    group.add(paperMesh);

    // Pagoda roof
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(1.25, 0.85, 8),
      new THREE.MeshStandardMaterial({ color: 0x2c364c, roughness: 0.8 })
    );
    roof.position.y = 4.55;
    roof.castShadow = true;
    group.add(roof);

    // Lantern point light
    const light = new THREE.PointLight(0xffa438, 0, 26, 1.4);
    light.position.y = 3.5;
    group.add(light);

    // Safe radius warm ground circle (visible when lit)
    const safeRing = new THREE.Mesh(
      new THREE.RingGeometry(this.tuning.safe_radius - 0.14, this.tuning.safe_radius, 48),
      new THREE.MeshBasicMaterial({
        color: 0xffbb55,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
      })
    );
    safeRing.rotation.x = -Math.PI / 2;
    safeRing.position.y = 0.06;
    group.add(safeRing);

    // Partial deposit progress ring around lantern base
    const progressRing = new THREE.Mesh(
      new THREE.RingGeometry(1.4, 1.68, 32),
      new THREE.MeshBasicMaterial({
        color: 0xffc45e,
        transparent: true,
        opacity: 0.25,
        side: THREE.DoubleSide,
      })
    );
    progressRing.rotation.x = -Math.PI / 2;
    progressRing.position.y = 0.05;
    group.add(progressRing);

    // Stepping stone path from center toward this lantern
    const dist = Math.hypot(pos[0], pos[2]);
    const steps = 6;
    for (let i = 1; i < steps; i++) {
      const f = i / steps;
      const stone = new THREE.Mesh(
        new THREE.CylinderGeometry(0.6, 0.65, 0.08, 7),
        new THREE.MeshStandardMaterial({ color: 0x333f52, roughness: 0.9 })
      );
      stone.position.set(pos[0] * f, 0.02, pos[2] * f);
      stone.receiveShadow = true;
      this.scene.add(stone);
    }
    void dist;

    this.scene.add(group);
    const visual: LanternVisual = {
      group,
      paperMesh,
      paperMat,
      light,
      safeRing,
      progressRing,
      wasLit: false,
    };
    this.lanternMap.set(id, visual);
    return visual;
  }

  private createMoteVisual(id: string): THREE.Group {
    const group = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xffe484 })
    );
    core.position.y = 0.9;
    group.add(core);

    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.4, 10, 10),
      new THREE.MeshBasicMaterial({
        color: 0xffa62b,
        transparent: true,
        opacity: 0.35,
      })
    );
    halo.position.y = 0.9;
    group.add(halo);

    this.scene.add(group);
    this.moteMap.set(id, group);
    return group;
  }

  private createShadeVisual(id: string): ShadeVisual {
    const group = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x160726,
      emissive: 0x3d0d6e,
      emissiveIntensity: 0.75,
      roughness: 0.4,
    });
    const body = new THREE.Mesh(new THREE.DodecahedronGeometry(0.75, 1), bodyMat);
    body.scale.set(0.95, 1.25, 0.95);
    body.castShadow = true;
    group.add(body);

    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xd47bff });
    const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), eyeMat);
    leftEye.position.set(-0.22, 0.2, 0.62);
    group.add(leftEye);

    const rightEye = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), eyeMat);
    rightEye.position.set(0.22, 0.2, 0.62);
    group.add(rightEye);

    const haloMesh = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.15, 24),
      new THREE.MeshBasicMaterial({
        color: 0x8a2be2,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
      })
    );
    haloMesh.rotation.x = -Math.PI / 2;
    haloMesh.position.y = -0.82;
    group.add(haloMesh);

    this.scene.add(group);
    const vis: ShadeVisual = { group, bodyMat, eyeMat, haloMesh };
    this.shadeMap.set(id, vis);
    return vis;
  }

  /** Spawns expanding golden ring visual when Mây activates Pulse. */
  triggerPulseEffect(x: number, z: number): void {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffd066,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.75, 1.0, 48), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.22, z);
    this.scene.add(mesh);
    this.pulseWaves.push({
      mesh,
      mat,
      age: 0,
      maxAge: 0.55,
      maxRadius: this.tuning.pulse_radius,
    });
  }

  /** Creative feature: spawns rising warm sky paper lanterns above a lit Great Lantern. */
  private spawnFloatingSkyLanterns(x: number, z: number): void {
    for (let i = 0; i < 3; i++) {
      const group = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.18, 0.44, 8),
        new THREE.MeshBasicMaterial({ color: 0xffc663 })
      );
      group.add(body);
      group.position.set(
        x + (i - 1) * 1.1,
        4.6 + i * 0.7,
        z + ((i % 2) * 2 - 1) * 0.8
      );
      this.scene.add(group);
      this.skyLanterns.push({
        mesh: group,
        speedY: 1.4 + i * 0.35,
        driftPhase: i * 2.1,
        baseX: group.position.x,
        baseZ: group.position.z,
        age: 0,
      });
    }
  }

  syncAndRender(
    snapshot: SnapshotRecord,
    camYawDeg: number,
    facingYawRad: number,
    invulnTicks: number,
    dt: number
  ): void {
    this.elapsed += dt;

    // 1. Update Mây position & animations
    const [px, py, pz] = snapshot.player.pos;
    this.mayGroup.position.set(px, py, pz);
    this.mayGroup.rotation.y = facingYawRad;

    // Flash softly when invulnerable
    const bodyMat = this.mayBodyMesh.material as THREE.MeshStandardMaterial;
    if (invulnTicks > 0) {
      bodyMat.emissive.setHex(0xff7744);
      bodyMat.emissiveIntensity = Math.sin(this.elapsed * 28) > 0 ? 0.65 : 0.05;
    } else {
      bodyMat.emissive.setHex(0x000000);
      bodyMat.emissiveIntensity = 0;
    }

    // Mây's hat lantern brightens slightly with carried motes
    this.mayLanternLight.intensity = 3.8 + snapshot.player.carried * 0.65;

    // Orbiting carried fireflies around Mây's nón lá
    for (let i = 0; i < this.orbitingMotes.length; i++) {
      const orb = this.orbitingMotes[i];
      if (i < snapshot.player.carried) {
        orb.visible = true;
        const a = this.elapsed * 2.6 + (i * Math.PI * 2) / Math.max(1, snapshot.player.carried);
        orb.position.set(
          Math.cos(a) * 0.95,
          1.78 + Math.sin(this.elapsed * 4 + i) * 0.14,
          Math.sin(a) * 0.95
        );
      } else {
        orb.visible = false;
      }
    }

    // 2. Sync lanterns & compute island illumination factor (0..1)
    let litCount = 0;
    for (const l of snapshot.lanterns) {
      let vis = this.lanternMap.get(l.id);
      if (!vis) {
        vis = this.createLanternVisual(l.id, l.pos);
      } else {
        vis.group.position.set(l.pos[0], l.pos[1], l.pos[2]);
      }

      if (l.lit) {
        litCount += 1;
        vis.paperMat.color.setHex(0xffe19c);
        vis.paperMat.emissiveIntensity = 1.9 + Math.sin(this.elapsed * 4 + l.pos[0]) * 0.25;
        vis.light.intensity = 22;
        (vis.safeRing.material as THREE.MeshBasicMaterial).opacity = 0.26;
        (vis.progressRing.material as THREE.MeshBasicMaterial).opacity = 0;
        if (!vis.wasLit) {
          vis.wasLit = true;
          this.spawnFloatingSkyLanterns(l.pos[0], l.pos[2]);
        }
      } else {
        vis.wasLit = false;
        const frac = l.deposited / Math.max(1, this.tuning.lantern_cost);
        vis.paperMat.color.setHex(frac > 0 ? 0x8f7458 : 0x454d66);
        vis.paperMat.emissiveIntensity = 0.05 + frac * 0.85;
        vis.light.intensity = frac * 6;
        (vis.safeRing.material as THREE.MeshBasicMaterial).opacity = 0;
        (vis.progressRing.material as THREE.MeshBasicMaterial).opacity = 0.2 + frac * 0.55;
      }
    }

    // Island brightens warmly as lanterns light up
    const lightRatio = litCount / Math.max(1, snapshot.lanterns.length);
    const nightBg = new THREE.Color(0x0b1024);
    const warmBg = new THREE.Color(0x2b243f);
    const blendedBg = nightBg.lerp(warmBg, lightRatio);
    this.scene.background = blendedBg;
    this.fog.color.copy(blendedBg);
    this.fog.density = 0.0135 - lightRatio * 0.0055;
    this.ambientLight.intensity = 0.52 + lightRatio * 0.62;
    this.ambientLight.color.setRGB(
      0.18 + lightRatio * 0.35,
      0.23 + lightRatio * 0.24,
      0.41 - lightRatio * 0.08
    );

    // 3. Sync motes
    const activeMoteIds = new Set<string>();
    for (const m of snapshot.motes) {
      activeMoteIds.add(m.id);
      let vis = this.moteMap.get(m.id);
      if (!vis) vis = this.createMoteVisual(m.id);
      const bob = Math.sin(this.elapsed * 3.4 + m.pos[0] * 0.7 + m.pos[2] * 0.5) * 0.22;
      vis.position.set(m.pos[0], bob, m.pos[2]);
    }
    for (const [id, vis] of this.moteMap.entries()) {
      if (!activeMoteIds.has(id)) {
        this.scene.remove(vis);
        this.moteMap.delete(id);
      }
    }

    // 4. Sync shades
    const activeShadeIds = new Set<string>();
    for (const s of snapshot.shades) {
      activeShadeIds.add(s.id);
      let vis = this.shadeMap.get(s.id);
      if (!vis) vis = this.createShadeVisual(s.id);

      const hover = Math.sin(this.elapsed * 4.2 + s.pos[0]) * 0.16;
      vis.group.position.set(s.pos[0], Math.max(0.85, s.pos[1]) + hover, s.pos[2]);

      // Face player
      const dx = px - s.pos[0];
      const dz = pz - s.pos[2];
      vis.group.rotation.y = Math.atan2(dx, dz);

      if (s.state === "stunned") {
        vis.bodyMat.color.setHex(0x635580);
        vis.bodyMat.emissive.setHex(0xffe088);
        vis.bodyMat.emissiveIntensity = 0.55;
        vis.eyeMat.color.setHex(0xfff0aa);
        vis.group.rotation.z = Math.sin(this.elapsed * 20) * 0.22;
      } else {
        vis.bodyMat.color.setHex(0x160726);
        vis.bodyMat.emissive.setHex(s.state === "flee" ? 0x6a1bb8 : 0x3d0d6e);
        vis.bodyMat.emissiveIntensity = 0.78;
        vis.eyeMat.color.setHex(0xd47bff);
        vis.group.rotation.z = 0;
      }
    }
    for (const [id, vis] of this.shadeMap.entries()) {
      if (!activeShadeIds.has(id)) {
        this.scene.remove(vis.group);
        this.shadeMap.delete(id);
      }
    }

    // 5. Update pulse wave rings
    for (let i = this.pulseWaves.length - 1; i >= 0; i--) {
      const w = this.pulseWaves[i];
      w.age += dt;
      const t = w.age / w.maxAge;
      if (t >= 1) {
        this.scene.remove(w.mesh);
        w.mesh.geometry.dispose();
        w.mat.dispose();
        this.pulseWaves.splice(i, 1);
      } else {
        const scale = 0.5 + t * w.maxRadius;
        w.mesh.scale.set(scale, scale, 1);
        w.mat.opacity = (1 - t) * 0.8;
      }
    }

    // 6. Update floating sky paper lanterns
    for (let i = this.skyLanterns.length - 1; i >= 0; i--) {
      const sl = this.skyLanterns[i];
      sl.age += dt;
      sl.mesh.position.y += sl.speedY * dt;
      sl.mesh.position.x = sl.baseX + Math.sin(this.elapsed * 0.9 + sl.driftPhase) * 1.4;
      sl.mesh.position.z = sl.baseZ + Math.cos(this.elapsed * 0.7 + sl.driftPhase) * 1.4;
      if (sl.age > 26) {
        this.scene.remove(sl.mesh);
        this.skyLanterns.splice(i, 1);
      }
    }

    // Gentle cloud drift
    this.cloudRing.rotation.y += dt * 0.018;

    // 7. Third-person camera following Mây along cam_yaw_deg
    const theta = (camYawDeg * Math.PI) / 180;
    const camDist = 11.5;
    const camHeight = 6.2;
    const desiredCamX = px - Math.sin(theta) * camDist;
    const desiredCamY = py + camHeight;
    const desiredCamZ = pz - Math.cos(theta) * camDist;

    this.camera.position.lerp(new THREE.Vector3(desiredCamX, desiredCamY, desiredCamZ), Math.min(1, dt * 10));
    this.camera.lookAt(px, py + 1.5, pz);

    this.renderer.render(this.scene, this.camera);
  }

  resetEffects(): void {
    for (const w of this.pulseWaves) {
      this.scene.remove(w.mesh);
      w.mesh.geometry.dispose();
      w.mat.dispose();
    }
    this.pulseWaves = [];
    for (const sl of this.skyLanterns) {
      this.scene.remove(sl.mesh);
    }
    this.skyLanterns = [];
    for (const vis of this.lanternMap.values()) {
      vis.wasLit = false;
    }
  }
}
