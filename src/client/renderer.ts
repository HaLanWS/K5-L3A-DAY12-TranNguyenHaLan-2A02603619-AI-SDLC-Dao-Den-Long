import * as THREE from "three";
import type { NightMapConfig } from "../core/maps.js";
import type { GameTuning, SnapshotRecord } from "../core/types.js";

// Official Ticket-02 color palette
const PALETTE = {
  sky: 0x0e1430,
  fog: 0x1b2350,
  grass: 0x2f5d50,
  sand: 0xc9b48a,
  wood: 0x6b4a2f,
  cloudSea: 0x12384a,
  lanternLit: 0xffb347,
  lanternCore: 0xffe9b0,
  lanternUnlit: 0x5b5f6e,
  moteCore: 0xfff6c2,
  moteHalo: 0xffe58a,
  shadeBody: 0x120a1a,
  shadeRim: 0x7a3cff,
  shadeStunned: 0x3a3450,
  mayTunic: 0xe8e2d0,
  mayScarf: 0xc8102e,
  gold: 0xf2c14e,
  drifter: 0x8fa3b8,
};

interface LanternVisual {
  group: THREE.Group;
  paperMat: THREE.MeshStandardMaterial;
  light: THREE.PointLight;
  safeRing: THREE.Mesh;
  progressRing: THREE.Mesh;
  wasLit: boolean;
}

interface ShadeVisual {
  group: THREE.Group;
  bodyMat: THREE.MeshStandardMaterial;
  rimMat: THREE.MeshBasicMaterial;
}

interface PulseWave {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  age: number;
  maxAge: number;
  maxRadius: number;
}

interface SkyLantern {
  mesh: THREE.Mesh;
  baseX: number;
  baseZ: number;
  speedY: number;
  phase: number;
  age: number;
}

export class IslandRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;

  private ambientLight: THREE.AmbientLight;
  private hemiLight: THREE.HemisphereLight;
  private moonLight: THREE.DirectionalLight;
  private fog: THREE.FogExp2;

  private mapGroup = new THREE.Group();
  private mayGroup: THREE.Group;
  private mayLanternLight: THREE.PointLight;
  private mayBodyMesh: THREE.Mesh;
  private orbitingMotes: THREE.Mesh[] = [];

  private lanternMap = new Map<string, LanternVisual>();
  private moteMap = new Map<string, THREE.Group>();
  private shadeMap = new Map<string, ShadeVisual>();
  private drifterMap = new Map<string, THREE.Group>();
  private charmMap = new Map<string, THREE.Group>();
  private pulseWaves: PulseWave[] = [];
  private skyLanterns: SkyLantern[] = [];
  private windLeaves: THREE.Points;

  private tuning: GameTuning;
  private currentNight = 0;
  private elapsed = 0;

  constructor(container: HTMLElement, tuning: GameTuning) {
    this.tuning = tuning;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(PALETTE.sky);
    this.fog = new THREE.FogExp2(PALETTE.fog, 0.009);
    this.scene.fog = this.fog;

    this.camera = new THREE.PerspectiveCamera(
      55,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.2,
      320
    );

    // Ambient intensity follows exact Ticket-02 formula: 0.15 + 0.55 * (lit / total)
    this.ambientLight = new THREE.AmbientLight(0xffe9b0, 0.15);
    this.scene.add(this.ambientLight);

    this.hemiLight = new THREE.HemisphereLight(0x6d7fb8, PALETTE.cloudSea, 0.45);
    this.scene.add(this.hemiLight);

    this.moonLight = new THREE.DirectionalLight(0xcfd8ff, 0.65);
    this.moonLight.position.set(35, 55, -25);
    this.moonLight.castShadow = true;
    this.moonLight.shadow.mapSize.set(1024, 1024);
    this.scene.add(this.moonLight);

    this.scene.add(this.mapGroup);
    this.buildSkyAndSea();

    const may = this.buildMay();
    this.mayGroup = may.group;
    this.mayLanternLight = may.lanternLight;
    this.mayBodyMesh = may.bodyMesh;
    this.scene.add(this.mayGroup);

    this.windLeaves = this.buildWindLeaves();
    this.scene.add(this.windLeaves);

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

  private buildSkyAndSea(): void {
    const starCount = 420;
    const pos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const th = ((i * 137.508) % 360) * (Math.PI / 180);
      const ph = Math.acos(0.15 + ((i * 0.61803) % 0.85));
      const r = 180;
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = r * Math.cos(ph);
      pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.scene.add(
      new THREE.Points(
        geo,
        new THREE.PointsMaterial({ color: PALETTE.lanternCore, size: 1.3, fog: false })
      )
    );

    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(500, 500),
      new THREE.MeshStandardMaterial({ color: PALETTE.cloudSea, roughness: 1.0 })
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -11.5;
    this.scene.add(sea);
  }

  private buildWindLeaves(): THREE.Points {
    const count = 90;
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = ((i * 37) % 80) - 40;
      arr[i * 3 + 1] = 1 + (i % 10);
      arr[i * 3 + 2] = ((i * 53) % 80) - 40;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    const pts = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: PALETTE.sand, size: 0.45, transparent: true, opacity: 0.85 })
    );
    pts.visible = false;
    return pts;
  }

  private buildMay(): {
    group: THREE.Group;
    lanternLight: THREE.PointLight;
    bodyMesh: THREE.Mesh;
  } {
    const group = new THREE.Group();

    const bodyMesh = new THREE.Mesh(
      new THREE.ConeGeometry(0.46, 1.15, 12),
      new THREE.MeshStandardMaterial({ color: PALETTE.mayTunic, roughness: 0.7 })
    );
    bodyMesh.position.y = 0.6;
    bodyMesh.castShadow = true;
    group.add(bodyMesh);

    const scarf = new THREE.Mesh(
      new THREE.TorusGeometry(0.28, 0.09, 8, 16),
      new THREE.MeshStandardMaterial({ color: PALETTE.mayScarf, roughness: 0.6 })
    );
    scarf.rotation.x = Math.PI / 2;
    scarf.position.y = 1.18;
    group.add(scarf);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.26, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0xf5d4b0, roughness: 0.75 })
    );
    head.position.y = 1.42;
    group.add(head);

    const nonLa = new THREE.Mesh(
      new THREE.ConeGeometry(0.76, 0.44, 18),
      new THREE.MeshStandardMaterial({ color: PALETTE.sand, roughness: 0.85, side: THREE.DoubleSide })
    );
    nonLa.position.y = 1.72;
    nonLa.castShadow = true;
    group.add(nonLa);

    const miniLantern = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 10, 10),
      new THREE.MeshStandardMaterial({
        color: PALETTE.lanternCore,
        emissive: PALETTE.lanternLit,
        emissiveIntensity: 2.0,
      })
    );
    miniLantern.position.set(0, 1.24, 0.65);
    group.add(miniLantern);

    const lanternLight = new THREE.PointLight(PALETTE.lanternLit, 4.0, 14, 1.5);
    lanternLight.position.set(0, 1.5, 0.7);
    group.add(lanternLight);

    // Creative feature: orbiting carried fireflies around Mây's nón lá
    for (let i = 0; i < 10; i++) {
      const orb = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 8, 8),
        new THREE.MeshBasicMaterial({ color: PALETTE.moteCore })
      );
      orb.visible = false;
      group.add(orb);
      this.orbitingMotes.push(orb);
    }

    return { group, lanternLight, bodyMesh };
  }

  private rebuildMapGeometry(map: NightMapConfig): void {
    this.currentNight = map.night;
    while (this.mapGroup.children.length > 0) {
      this.mapGroup.remove(this.mapGroup.children[0]);
    }
    for (const v of this.lanternMap.values()) this.scene.remove(v.group);
    this.lanternMap.clear();
    for (const v of this.charmMap.values()) this.scene.remove(v);
    this.charmMap.clear();
    this.resetEffects();

    const grassMat = new THREE.MeshStandardMaterial({ color: PALETTE.grass, roughness: 0.9 });
    const sandMat = new THREE.MeshStandardMaterial({ color: PALETTE.sand, roughness: 0.88 });
    const woodMat = new THREE.MeshStandardMaterial({ color: PALETTE.wood, roughness: 0.85 });

    if (map.night === 1) {
      const top = new THREE.Mesh(new THREE.CylinderGeometry(40, 41.5, 5, 48), grassMat);
      top.position.y = -2.5;
      top.receiveShadow = true;
      this.mapGroup.add(top);

      const rim = new THREE.Mesh(new THREE.RingGeometry(38.2, 40, 48), sandMat);
      rim.rotation.x = -Math.PI / 2;
      rim.position.y = 0.03;
      this.mapGroup.add(rim);
    } else if (map.night === 2) {
      for (const cx of [0, 70]) {
        const isl = new THREE.Mesh(new THREE.CylinderGeometry(28, 29.5, 5, 40), grassMat);
        isl.position.set(cx, -2.5, 0);
        isl.receiveShadow = true;
        this.mapGroup.add(isl);
      }
      // Bamboo bridge x in [26, 44], z in [-2, 2]
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(18, 0.4, 4), woodMat);
      bridge.position.set(35, -0.2, 0);
      bridge.receiveShadow = true;
      this.mapGroup.add(bridge);
    } else if (map.night === 3) {
      // Tier 0 (Y = 0, r = 45)
      const t0 = new THREE.Mesh(new THREE.CylinderGeometry(45, 46.5, 5, 56), grassMat);
      t0.position.y = -2.5;
      t0.receiveShadow = true;
      this.mapGroup.add(t0);

      // Tier 1 (Y = 3, semi-annulus r 12..24, z > 0)
      const shape = new THREE.Shape();
      shape.absarc(0, 0, 24, 0, Math.PI, false);
      shape.absarc(0, 0, 12, Math.PI, 0, true);
      const extrude = new THREE.ExtrudeGeometry(shape, { depth: 3, bevelEnabled: false });
      const t1 = new THREE.Mesh(extrude, grassMat);
      t1.rotation.x = Math.PI / 2;
      t1.position.y = 3;
      t1.receiveShadow = true;
      this.mapGroup.add(t1);

      // Tier 2 (Y = 6, r = 8)
      const t2 = new THREE.Mesh(new THREE.CylinderGeometry(8, 8.2, 1.2, 32), sandMat);
      t2.position.y = 5.4;
      t2.receiveShadow = true;
      this.mapGroup.add(t2);

      // Supporting pillars under Tier 2
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2 + Math.PI / 4;
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 5.4, 8), woodMat);
        p.position.set(Math.cos(a) * 6.2, 2.7, Math.sin(a) * 6.2);
        this.mapGroup.add(p);
      }

      // Bell tower at center of Tier 2 (r = 2, h = 8 -> Y 6..14)
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.0, 8.0, 16), woodMat);
      tower.position.set(0, 10, 0);
      tower.castShadow = true;
      this.mapGroup.add(tower);

      const roof = new THREE.Mesh(
        new THREE.ConeGeometry(3.1, 2.4, 8),
        new THREE.MeshStandardMaterial({ color: PALETTE.lanternUnlit, roughness: 0.75 })
      );
      roof.position.set(0, 15.1, 0);
      this.mapGroup.add(roof);

      // 2 Ramps at 30° and 150° (r=30 Y=0 to r=24 Y=3, width 3m)
      for (const deg of [30, 150]) {
        const rad = (deg * Math.PI) / 180;
        const rampLen = Math.hypot(6, 3);
        const slopeAngle = Math.atan2(3, 6);
        const ramp = new THREE.Mesh(new THREE.BoxGeometry(rampLen, 0.35, 3.0), woodMat);
        const midR = 27;
        ramp.position.set(Math.cos(rad) * midR, 1.45, Math.sin(rad) * midR);
        ramp.rotation.y = -rad;
        ramp.rotation.z = -slopeAngle;
        ramp.receiveShadow = true;
        this.mapGroup.add(ramp);
      }
    }

    // Render Jump Pads
    for (const pad of map.jumpPads) {
      const padMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(pad.radius, pad.radius * 1.1, 0.22, 20),
        new THREE.MeshStandardMaterial({
          color: PALETTE.gold,
          emissive: PALETTE.lanternLit,
          emissiveIntensity: 0.75,
        })
      );
      padMesh.position.set(pad.pos[0], pad.pos[1] + 0.11, pad.pos[2]);
      this.mapGroup.add(padMesh);
    }
  }

  private createLanternVisual(id: string, pos: [number, number, number]): LanternVisual {
    const group = new THREE.Group();
    group.position.set(pos[0], pos[1], pos[2]);

    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.34, 2.8, 8),
      new THREE.MeshStandardMaterial({ color: PALETTE.wood, roughness: 0.85 })
    );
    pillar.position.y = 1.4;
    group.add(pillar);

    const paperMat = new THREE.MeshStandardMaterial({
      color: PALETTE.lanternUnlit,
      emissive: PALETTE.lanternLit,
      emissiveIntensity: 0.05,
    });
    const paper = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.58, 1.35, 8), paperMat);
    paper.position.y = 3.35;
    group.add(paper);

    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(1.15, 0.75, 8),
      new THREE.MeshStandardMaterial({ color: PALETTE.wood, roughness: 0.8 })
    );
    roof.position.y = 4.3;
    group.add(roof);

    const light = new THREE.PointLight(PALETTE.lanternLit, 0, 24, 1.4);
    light.position.y = 3.4;
    group.add(light);

    const safeRing = new THREE.Mesh(
      new THREE.RingGeometry(this.tuning.safe_radius - 0.14, this.tuning.safe_radius, 40),
      new THREE.MeshBasicMaterial({
        color: PALETTE.lanternLit,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
      })
    );
    safeRing.rotation.x = -Math.PI / 2;
    safeRing.position.y = 0.06;
    group.add(safeRing);

    const progressRing = new THREE.Mesh(
      new THREE.RingGeometry(1.3, 1.58, 28),
      new THREE.MeshBasicMaterial({
        color: PALETTE.gold,
        transparent: true,
        opacity: 0.25,
        side: THREE.DoubleSide,
      })
    );
    progressRing.rotation.x = -Math.PI / 2;
    progressRing.position.y = 0.05;
    group.add(progressRing);

    this.scene.add(group);
    const vis: LanternVisual = { group, paperMat, light, safeRing, progressRing, wasLit: false };
    this.lanternMap.set(id, vis);
    return vis;
  }

  private createShadeVisual(id: string): ShadeVisual {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({
      color: PALETTE.shadeBody,
      emissive: PALETTE.shadeRim,
      emissiveIntensity: 0.55,
      roughness: 0.45,
    });
    const body = new THREE.Mesh(new THREE.DodecahedronGeometry(0.7, 1), bodyMat);
    body.scale.set(0.95, 1.2, 0.95);
    group.add(body);

    const rimMat = new THREE.MeshBasicMaterial({
      color: PALETTE.shadeRim,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.05, 20), rimMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.7;
    group.add(ring);

    this.scene.add(group);
    const vis: ShadeVisual = { group, bodyMat, rimMat };
    this.shadeMap.set(id, vis);
    return vis;
  }

  private createDrifterVisual(id: string): THREE.Group {
    const group = new THREE.Group();
    const ribbon = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.22, 0.55),
      new THREE.MeshStandardMaterial({
        color: PALETTE.drifter,
        emissive: PALETTE.drifter,
        emissiveIntensity: 0.4,
        transparent: true,
        opacity: 0.85,
      })
    );
    group.add(ribbon);
    this.scene.add(group);
    this.drifterMap.set(id, group);
    return group;
  }

  private createCharmVisual(id: string): THREE.Group {
    const group = new THREE.Group();
    const talisman = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 0.72, 0.08),
      new THREE.MeshStandardMaterial({
        color: PALETTE.mayScarf,
        emissive: PALETTE.mayScarf,
        emissiveIntensity: 0.6,
      })
    );
    talisman.position.y = 1.0;
    group.add(talisman);

    const border = new THREE.Mesh(
      new THREE.BoxGeometry(0.52, 0.8, 0.05),
      new THREE.MeshBasicMaterial({ color: PALETTE.gold })
    );
    border.position.y = 1.0;
    group.add(border);

    this.scene.add(group);
    this.charmMap.set(id, group);
    return group;
  }

  triggerPulseEffect(x: number, y: number, z: number): void {
    const mat = new THREE.MeshBasicMaterial({
      color: PALETTE.lanternLit,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.75, 1.0, 40), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y + 0.3, z);
    this.scene.add(mesh);
    this.pulseWaves.push({ mesh, mat, age: 0, maxAge: 0.48, maxRadius: this.tuning.pulse_radius });
  }

  private spawnSkyLanterns(x: number, y: number, z: number): void {
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.16, 0.4, 8),
        new THREE.MeshBasicMaterial({ color: PALETTE.lanternLit })
      );
      m.position.set(x + (i - 1) * 1.1, y + 4.5 + i * 0.6, z);
      this.scene.add(m);
      this.skyLanterns.push({
        mesh: m,
        baseX: m.position.x,
        baseZ: m.position.z,
        speedY: 1.5 + i * 0.3,
        phase: i * 2.0,
        age: 0,
      });
    }
  }

  /** Projects nearest unlit lantern to screen space for off-screen HUD arrow. */
  getNearestUnlitLanternScreen(
    snapshot: SnapshotRecord
  ): { x: number; y: number; angleDeg: number; offscreen: boolean } | null {
    const [px, , pz] = snapshot.player.pos;
    let best: SnapshotRecord["lanterns"][number] | null = null;
    let bestD = Infinity;
    for (const l of snapshot.lanterns) {
      if (l.lit) continue;
      const d = Math.hypot(l.pos[0] - px, l.pos[2] - pz);
      if (d < bestD) {
        bestD = d;
        best = l;
      }
    }
    if (!best) return null;

    const v = new THREE.Vector3(best.pos[0], best.pos[1] + 2.5, best.pos[2]);
    v.project(this.camera);
    const inFront = v.z < 1;
    const onScreen = inFront && Math.abs(v.x) <= 0.94 && Math.abs(v.y) <= 0.9;
    if (onScreen) return { x: 0, y: 0, angleDeg: 0, offscreen: false };

    let nx = inFront ? v.x : -v.x;
    let ny = inFront ? v.y : -v.y;
    const mag = Math.max(Math.abs(nx), Math.abs(ny), 0.001);
    nx = (nx / mag) * 0.88;
    ny = (ny / mag) * 0.82;

    const w = this.renderer.domElement.clientWidth;
    const h = this.renderer.domElement.clientHeight;
    const sx = (nx * 0.5 + 0.5) * w;
    const sy = (-ny * 0.5 + 0.5) * h;
    const angleDeg = (Math.atan2(-ny, nx) * 180) / Math.PI;
    return { x: sx, y: sy, angleDeg, offscreen: true };
  }

  syncAndRender(
    snapshot: SnapshotRecord,
    map: NightMapConfig,
    camYawDeg: number,
    facingYawRad: number,
    windWarning: boolean,
    dt: number
  ): void {
    if (this.currentNight !== map.night) {
      this.rebuildMapGeometry(map);
    }
    this.elapsed += dt;

    // 1. Mây
    const [px, py, pz] = snapshot.player.pos;
    this.mayGroup.position.set(px, py, pz);
    this.mayGroup.rotation.y = facingYawRad;

    const bodyMat = this.mayBodyMesh.material as THREE.MeshStandardMaterial;
    bodyMat.emissive.setHex(snapshot.player.invuln ? PALETTE.lanternLit : 0x000000);
    bodyMat.emissiveIntensity =
      snapshot.player.invuln && Math.sin(this.elapsed * 28) > 0 ? 0.6 : 0;
    this.mayLanternLight.intensity = 3.5 + snapshot.player.carried * 0.35;

    for (let i = 0; i < this.orbitingMotes.length; i++) {
      const orb = this.orbitingMotes[i];
      if (i < snapshot.player.carried) {
        orb.visible = true;
        const a = this.elapsed * 2.8 + (i * Math.PI * 2) / Math.max(1, snapshot.player.carried);
        orb.position.set(Math.cos(a) * 0.92, 1.75 + Math.sin(this.elapsed * 4 + i) * 0.12, Math.sin(a) * 0.92);
      } else {
        orb.visible = false;
      }
    }

    // 2. Lanterns & exact Ticket-02 ambient formula: 0.15 + 0.55 * (lit / total)
    let litCount = 0;
    for (const l of snapshot.lanterns) {
      let vis = this.lanternMap.get(l.id);
      if (!vis) vis = this.createLanternVisual(l.id, l.pos);
      if (l.lit) {
        litCount += 1;
        vis.paperMat.color.setHex(PALETTE.lanternCore);
        vis.paperMat.emissiveIntensity = 1.9;
        vis.light.intensity = 22;
        (vis.safeRing.material as THREE.MeshBasicMaterial).opacity = 0.25;
        (vis.progressRing.material as THREE.MeshBasicMaterial).opacity = 0;
        if (!vis.wasLit) {
          vis.wasLit = true;
          this.spawnSkyLanterns(l.pos[0], l.pos[1], l.pos[2]);
        }
      } else {
        vis.wasLit = false;
        const frac = l.deposited / Math.max(1, this.tuning.lantern_cost);
        vis.paperMat.color.setHex(PALETTE.lanternUnlit);
        vis.paperMat.emissiveIntensity = 0.05 + frac * 0.9;
        vis.light.intensity = frac * 6;
        (vis.safeRing.material as THREE.MeshBasicMaterial).opacity = 0;
        (vis.progressRing.material as THREE.MeshBasicMaterial).opacity = 0.2 + frac * 0.5;
      }
    }
    const progress = litCount / Math.max(1, snapshot.lanterns.length);
    this.ambientLight.intensity = 0.15 + 0.55 * progress;

    // 3. Motes
    const activeMotes = new Set<string>();
    for (const m of snapshot.motes) {
      activeMotes.add(m.id);
      let vis = this.moteMap.get(m.id);
      if (!vis) {
        vis = new THREE.Group();
        const c = new THREE.Mesh(
          new THREE.SphereGeometry(0.2, 8, 8),
          new THREE.MeshBasicMaterial({ color: PALETTE.moteCore })
        );
        c.position.y = 0.85;
        vis.add(c);
        const h = new THREE.Mesh(
          new THREE.SphereGeometry(0.36, 8, 8),
          new THREE.MeshBasicMaterial({ color: PALETTE.moteHalo, transparent: true, opacity: 0.35 })
        );
        h.position.y = 0.85;
        vis.add(h);
        this.scene.add(vis);
        this.moteMap.set(m.id, vis);
      }
      vis.position.set(m.pos[0], m.pos[1] + Math.sin(this.elapsed * 3.5 + m.pos[0]) * 0.18, m.pos[2]);
    }
    for (const [id, vis] of this.moteMap.entries()) {
      if (!activeMotes.has(id)) {
        this.scene.remove(vis);
        this.moteMap.delete(id);
      }
    }

    // 4. Shades
    const activeShades = new Set<string>();
    for (const s of snapshot.shades) {
      activeShades.add(s.id);
      let vis = this.shadeMap.get(s.id);
      if (!vis) vis = this.createShadeVisual(s.id);
      vis.group.position.set(s.pos[0], s.pos[1] + Math.sin(this.elapsed * 4 + s.pos[0]) * 0.12, s.pos[2]);
      if (s.state === "stunned") {
        vis.bodyMat.color.setHex(PALETTE.shadeStunned);
        vis.bodyMat.emissive.setHex(PALETTE.gold);
        vis.rimMat.color.setHex(PALETTE.gold);
      } else {
        vis.bodyMat.color.setHex(PALETTE.shadeBody);
        vis.bodyMat.emissive.setHex(PALETTE.shadeRim);
        vis.rimMat.color.setHex(PALETTE.shadeRim);
      }
    }
    for (const [id, vis] of this.shadeMap.entries()) {
      if (!activeShades.has(id)) {
        this.scene.remove(vis.group);
        this.shadeMap.delete(id);
      }
    }

    // 5. Drifters
    const activeDrifters = new Set<string>();
    for (const d of snapshot.drifters) {
      if (d.state === "removed") continue;
      activeDrifters.add(d.id);
      let vis = this.drifterMap.get(d.id);
      if (!vis) vis = this.createDrifterVisual(d.id);
      vis.position.set(d.pos[0], d.pos[1] + Math.sin(this.elapsed * 6) * 0.25, d.pos[2]);
      vis.rotation.y = this.elapsed * 2.5;
    }
    for (const [id, vis] of this.drifterMap.entries()) {
      if (!activeDrifters.has(id)) {
        this.scene.remove(vis);
        this.drifterMap.delete(id);
      }
    }

    // 6. Charms
    for (const c of snapshot.charms) {
      let vis = this.charmMap.get(c.id);
      if (!vis) vis = this.createCharmVisual(c.id);
      vis.visible = c.available;
      vis.position.set(c.pos[0], c.pos[1] + Math.sin(this.elapsed * 3) * 0.18, c.pos[2]);
      vis.rotation.y = this.elapsed * 1.8;
    }

    // 7. Wind leaf particles (Night 3 warning or active)
    this.windLeaves.visible = windWarning || snapshot.wind.active;
    if (this.windLeaves.visible) {
      const windRad = (snapshot.wind.dir_deg * Math.PI) / 180;
      const speed = snapshot.wind.active ? 14 : 6;
      const attr = this.windLeaves.geometry.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < attr.count; i++) {
        let lx = attr.getX(i) + Math.cos(windRad) * speed * dt;
        let lz = attr.getZ(i) + Math.sin(windRad) * speed * dt;
        if (lx > 45) lx -= 90;
        if (lx < -45) lx += 90;
        if (lz > 45) lz -= 90;
        if (lz < -45) lz += 90;
        attr.setXYZ(i, lx, attr.getY(i), lz);
      }
      attr.needsUpdate = true;
    }

    // 8. Pulse waves & sky lanterns
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
        const sc = 0.5 + t * w.maxRadius;
        w.mesh.scale.set(sc, sc, 1);
        w.mat.opacity = (1 - t) * 0.85;
      }
    }

    for (let i = this.skyLanterns.length - 1; i >= 0; i--) {
      const sl = this.skyLanterns[i];
      sl.age += dt;
      sl.mesh.position.y += sl.speedY * dt;
      sl.mesh.position.x = sl.baseX + Math.sin(this.elapsed + sl.phase) * 1.2;
      if (sl.age > 22) {
        this.scene.remove(sl.mesh);
        this.skyLanterns.splice(i, 1);
      }
    }

    // 9. Third-person camera
    const theta = (camYawDeg * Math.PI) / 180;
    const desired = new THREE.Vector3(
      px - Math.sin(theta) * 12,
      py + 6.5,
      pz - Math.cos(theta) * 12
    );
    this.camera.position.lerp(desired, Math.min(1, dt * 10));
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
    for (const sl of this.skyLanterns) this.scene.remove(sl.mesh);
    this.skyLanterns = [];
    for (const v of this.lanternMap.values()) v.wasLit = false;
  }
}
