import * as THREE from 'three';

export class Arena {
  constructor(scene) {
    this.scene = scene;
    this._buildEnvironment();
    this._buildLighting();
    this._buildFloor();
    this._buildWalls();
    this._buildPillars();
    this._buildParticles();
  }

  _buildEnvironment() {
    // Lighter fog so arena is visible further out
    this.scene.fog = new THREE.FogExp2(0x0d0818, 0.018);
    this.scene.background = new THREE.Color(0x0d0818);
  }

  _buildLighting() {
    // ── Ambient — much brighter so you can actually see the arena ──
    const ambient = new THREE.AmbientLight(0x9988cc, 1.8);
    this.scene.add(ambient);

    // ── Main overhead directional (like stadium light) ──
    const dir = new THREE.DirectionalLight(0xffffff, 2.0);
    dir.position.set(5, 25, 10);
    dir.castShadow = true;
    dir.shadow.mapSize.width  = 2048;
    dir.shadow.mapSize.height = 2048;
    dir.shadow.camera.near   = 0.5;
    dir.shadow.camera.far    = 120;
    dir.shadow.camera.left   = -35;
    dir.shadow.camera.right  = 35;
    dir.shadow.camera.top    = 35;
    dir.shadow.camera.bottom = -35;
    this.scene.add(dir);

    // ── Second fill light from opposite side ──
    const fill = new THREE.DirectionalLight(0xaabbff, 0.8);
    fill.position.set(-10, 15, -10);
    this.scene.add(fill);

    // ── Boss pedestal glow (center) ──
    this.bossLight = new THREE.PointLight(0xff3300, 5.0, 22);
    this.bossLight.position.set(0, 2, 0);
    this.scene.add(this.bossLight);

    // ── Rim lights — corner purple accents ──
    const corners = [[-16,6,-16],[16,6,-16],[-16,6,16],[16,6,16]];
    corners.forEach(([x,y,z]) => {
      const rimLight = new THREE.PointLight(0x9933ff, 2.5, 28);
      rimLight.position.set(x, y, z);
      this.scene.add(rimLight);
    });

    // ── Wall torches — 8 warm orange lights at mid-wall height ──
    //    These are what make the walls readable
    const torchPositions = [
      [ 0, 4, -19.5], [ 0, 4,  19.5],   // north/south walls center
      [-19.5, 4, 0],  [ 19.5, 4, 0],   // east/west walls center
      [-14, 4, -19.5],[ 14, 4, -19.5], // north wall sides
      [-14, 4,  19.5],[ 14, 4,  19.5], // south wall sides
    ];
    this.torchLights = [];
    torchPositions.forEach(([x,y,z]) => {
      const t = new THREE.PointLight(0xff8833, 3.5, 14);
      t.position.set(x, y, z);
      this.scene.add(t);
      this.torchLights.push(t);
    });

    // ── Floor pulse light (animated) ──
    this.pulseLight = new THREE.PointLight(0xff3355, 3.0, 20);
    this.pulseLight.position.set(0, 0.5, 0);
    this.scene.add(this.pulseLight);
  }

  _buildFloor() {
    const size = 40;
    const geo  = new THREE.PlaneGeometry(size, size, 40, 40);
    geo.rotateX(-Math.PI / 2);

    // Ensure floor is perfectly flat to match physics floor at Y=0
    const positions = geo.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      positions.setY(i, 0);
    }
    positions.needsUpdate = true;
    geo.computeVertexNormals();

    // Visible stone floor — dark grey-purple
    const mat = new THREE.MeshStandardMaterial({
      color:     0x3a2e44,   // dark stone purple — readable under lights
      roughness: 0.92,
      metalness: 0.05,
    });
    const floor = new THREE.Mesh(geo, mat);
    floor.receiveShadow = true;
    floor.name = 'floor';
    this.scene.add(floor);

    this._buildRuneCircle();
    this.bounds = size / 2 - 1;
  }

  _buildRuneCircle() {
    // Inner ring
    const ringGeo = new THREE.RingGeometry(7.8, 8.2, 64);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff2200,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.4,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.01;
    this.scene.add(ring);

    // Outer ring
    const outerGeo = new THREE.RingGeometry(14.8, 15.2, 64);
    outerGeo.rotateX(-Math.PI / 2);
    const outerMat = new THREE.MeshBasicMaterial({
      color: 0x8800ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.25,
    });
    const outerRing = new THREE.Mesh(outerGeo, outerMat);
    outerRing.position.y = 0.01;
    this.scene.add(outerRing);

    // Store for animation
    this.runeRings = [ring, outerRing];

    // Cross lines (rune pattern)
    const lineMat = new THREE.LineBasicMaterial({ color: 0xff2200, transparent: true, opacity: 0.3 });
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const pts = [
        new THREE.Vector3(Math.cos(angle) * 2, 0.01, Math.sin(angle) * 2),
        new THREE.Vector3(Math.cos(angle) * 15, 0.01, Math.sin(angle) * 15),
      ];
      const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
      this.scene.add(new THREE.Line(lineGeo, lineMat));
    }
  }

  _buildWalls() {
    // ── Stone wall material — visible grey-brown color ──
    const wallMat = new THREE.MeshStandardMaterial({
      color:     0x5c4a6e,   // medium purple-stone
      roughness: 0.9,
      metalness: 0.05,
    });
    // Slightly lighter top band for depth
    const wallTopMat = new THREE.MeshStandardMaterial({
      color:     0x7a6490,
      roughness: 0.8,
      metalness: 0.0,
    });

    const wallH    = 8;
    const halfSize = 20;

    // Four walls
    const wallDefs = [
      { size: [40, wallH, 1.2], pos: [0, wallH / 2, -halfSize] },
      { size: [40, wallH, 1.2], pos: [0, wallH / 2,  halfSize] },
      { size: [1.2, wallH, 40], pos: [-halfSize, wallH / 2, 0] },
      { size: [1.2, wallH, 40], pos: [ halfSize, wallH / 2, 0] },
    ];
    wallDefs.forEach(({ size, pos }) => {
      const geo  = new THREE.BoxGeometry(...size);
      const mesh = new THREE.Mesh(geo, wallMat);
      mesh.position.set(...pos);
      mesh.receiveShadow = true;
      mesh.castShadow    = true;
      this.scene.add(mesh);
    });

    // Crenellated top edge (battlements) — decorative boxes on top of each wall
    const merlonMat = new THREE.MeshStandardMaterial({ color: 0x6b5880, roughness: 0.9 });
    const merlonDefs = [
      { axis: 'x', z: -halfSize }, { axis: 'x', z: halfSize },
      { axis: 'z', x: -halfSize }, { axis: 'z', x: halfSize },
    ];
    merlonDefs.forEach(({ axis, x: wx, z: wz }) => {
      for (let i = -18; i <= 18; i += 3) {
        const mg  = new THREE.BoxGeometry(axis === 'x' ? 1.8 : 1.2, 1.2, axis === 'x' ? 1.2 : 1.8);
        const mm  = new THREE.Mesh(mg, merlonMat);
        mm.position.set(
          axis === 'x' ? i : wx,
          wallH + 0.6,
          axis === 'x' ? wz : i,
        );
        this.scene.add(mm);
      }
    });

    // Visible torch sconces on walls (small emissive boxes)
    const sconcePositions = [
      [ 0, 4.5, -19.6], [ 0, 4.5,  19.6],
      [-19.6, 4.5, 0],  [ 19.6, 4.5, 0],
      [-14, 4.5, -19.6],[ 14, 4.5, -19.6],
      [-14, 4.5,  19.6],[ 14, 4.5,  19.6],
    ];
    const sconceMat = new THREE.MeshStandardMaterial({
      color:            0xff7700,
      emissive:         0xff5500,
      emissiveIntensity: 2.5,
    });
    sconcePositions.forEach(([x, y, z]) => {
      const sg = new THREE.SphereGeometry(0.22, 6, 6);
      const sm = new THREE.Mesh(sg, sconceMat);
      sm.position.set(x, y, z);
      this.scene.add(sm);
    });
  }

  _buildPillars() {
    // Visible stone pillar material
    const pillarMat = new THREE.MeshStandardMaterial({
      color:     0x5a4870,
      roughness: 0.85,
      metalness: 0.1,
    });
    // Glowing purple cap
    const capMat = new THREE.MeshStandardMaterial({
      color:             0xaa44ff,
      emissive:          0xaa44ff,
      emissiveIntensity: 2.0,
      roughness:         0.2,
    });

    const pillarPositions = [
      [-12, 0, -12], [12, 0, -12],
      [-12, 0,  12], [12, 0,  12],
      [-17, 0,   0], [17, 0,   0],
      [  0, 0, -17], [ 0, 0,  17],
    ];

    pillarPositions.forEach(([x, , z]) => {
      // Main pillar body
      const geo    = new THREE.CylinderGeometry(0.6, 0.85, 7, 10);
      const pillar = new THREE.Mesh(geo, pillarMat);
      pillar.position.set(x, 3.5, z);
      pillar.castShadow    = true;
      pillar.receiveShadow = true;
      this.scene.add(pillar);

      // Glowing cap
      const capGeo = new THREE.CylinderGeometry(0.75, 0.6, 0.5, 10);
      const cap    = new THREE.Mesh(capGeo, capMat);
      cap.position.set(x, 7.25, z);
      this.scene.add(cap);

      // Bright point light at each pillar cap
      const capLight = new THREE.PointLight(0xaa44ff, 3.0, 9);
      capLight.position.set(x, 7.6, z);
      this.scene.add(capLight);
    });
  }

  _buildParticles() {
    // Floating ember particles
    const count = 300;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = [];

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 3 + Math.random() * 16;
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = Math.random() * 8;
      positions[i * 3 + 2] = Math.sin(angle) * radius;
      velocities.push({
        x: (Math.random() - 0.5) * 0.01,
        y: 0.005 + Math.random() * 0.015,
        z: (Math.random() - 0.5) * 0.01,
      });
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      color: 0xff4400,
      size: 0.08,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.particles = new THREE.Points(geo, mat);
    this.particleVelocities = velocities;
    this.scene.add(this.particles);
  }

  update(delta) {
    const time = performance.now() * 0.001;

    // Pulse the center boss light
    this.pulseLight.intensity  = 2.5 + Math.sin(time * 2.5) * 1.0;
    this.bossLight.intensity   = 4.5 + Math.sin(time * 1.3) * 0.8;

    // Flicker wall torches slightly (like real fire)
    if (this.torchLights) {
      this.torchLights.forEach((t, i) => {
        t.intensity = 3.0 + Math.sin(time * 7 + i * 1.3) * 0.6
                         + Math.sin(time * 13 + i * 2.1) * 0.3;
      });
    }

    // Rune ring glow pulse
    if (this.runeRings) {
      this.runeRings[0].material.opacity = 0.45 + Math.sin(time * 2) * 0.2;
      this.runeRings[1].material.opacity = 0.28 + Math.sin(time * 1.5 + 1) * 0.12;
    }

    // Update particles
    if (this.particles) {
      const positions = this.particles.geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        let x = positions.getX(i) + this.particleVelocities[i].x;
        let y = positions.getY(i) + this.particleVelocities[i].y;
        let z = positions.getZ(i) + this.particleVelocities[i].z;

        // Reset if too high
        if (y > 9) {
          y = 0;
          const angle = Math.random() * Math.PI * 2;
          const radius = 3 + Math.random() * 16;
          x = Math.cos(angle) * radius;
          z = Math.sin(angle) * radius;
        }

        positions.setXYZ(i, x, y, z);
      }
      positions.needsUpdate = true;
    }
  }

  // Set boss enrage visual (called by BossAI at phase 3)
  setEnrageMode(active) {
    if (active) {
      this.bossLight.color.set(0xff0000);
      this.bossLight.intensity = 5;
      this.pulseLight.color.set(0xff0000);
      this.particles.material.color.set(0xff0000);
      this.scene.fog.color.set(0x1a0000);
    }
  }
}
