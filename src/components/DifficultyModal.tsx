import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Difficulty } from '../types.ts';
import { Shield, Flame, RotateCcw } from 'lucide-react';
import { sound } from '../utils/audio.ts';

interface Props {
  onSelect: (diff: Difficulty) => void;
}

type CutscenePhase = 'warp' | 'asteroids' | 'impact' | 'blackhole' | 'menu';

// Procedural rocky displacement + vertex coloring for realistic craggy 3D asteroids
function createRockyAsteroidGeometry(radius: number, detail: number, seed: number): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(radius, detail);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  const col = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n1 = Math.sin(v.x * 2.5 + seed) * Math.cos(v.y * 3.1 - seed * 0.7) * Math.sin(v.z * 2.3 + seed * 1.3);
    const n2 = Math.cos(v.x * 5.9 - seed * 1.9) * Math.sin(v.y * 6.3 + seed * 1.1) * 0.35;
    const crater = Math.max(0, Math.sin(v.x * 1.8 + v.y * 1.6 + seed * 2.2)) ** 3 * -0.34;
    const displacement = 1 + n1 * 0.34 + n2 * 0.16 + crater;

    v.x *= displacement * 1.18;
    v.y *= displacement * 0.84;
    v.z *= displacement * 1.02;
    pos.setXYZ(i, v.x, v.y, v.z);

    // Deep dark charcoal in craters, warm iron-basalt on ridges
    const ridgeFactor = THREE.MathUtils.clamp((displacement - 0.72) / 0.62, 0, 1);
    col.setRGB(
      0.14 + ridgeFactor * 0.28,
      0.13 + ridgeFactor * 0.25,
      0.12 + ridgeFactor * 0.23
    );
    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

export const DifficultyModal: React.FC<Props> = ({ onSelect }) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [phase, setPhase] = useState<CutscenePhase>('warp');
  const [menuFadeIn, setMenuFadeIn] = useState<boolean>(false);

  const phaseRef = useRef<CutscenePhase>('warp');
  const startTimeRef = useRef<number>(-1);
  const warpTriggeredRef = useRef<boolean>(false);
  const impactTriggeredRef = useRef<boolean>(false);
  const pullSoundTriggeredRef = useRef<boolean>(false);

  const updatePhase = (next: CutscenePhase) => {
    if (phaseRef.current !== next) {
      phaseRef.current = next;
      setPhase(next);
      if (next === 'menu') {
        requestAnimationFrame(() => {
          setMenuFadeIn(true);
        });
      } else {
        setMenuFadeIn(false);
      }
    }
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const urlParams = new URLSearchParams(window.location.search);
    const forcedTimeParam = urlParams.get('cutsceneTime');
    const forcedTime = forcedTimeParam !== null ? parseFloat(forcedTimeParam) : null;

    // --- 1. SCENE, CAMERA & RENDERER ---
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x010308);
    scene.fog = new THREE.FogExp2(0x010308, 0.0025);

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const camera = new THREE.PerspectiveCamera(48, width / height, 0.1, 1200);
    camera.position.set(22, 2.5, 14);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);

    // Detect software WebGL (SwiftShader / headless browser) per Three.js skill guidelines
    const gl = renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const rendererStr = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
    const isSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(rendererStr);

    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;

    container.appendChild(renderer.domElement);

    // Environment reflections for metallic spacecraft hull & rocky surfaces
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;

    // --- 2. LIGHTING ---
    const ambientLight = new THREE.AmbientLight(0x1e293b, 0.95);
    scene.add(ambientLight);

    // Accretion Disk Golden-Orange Key Light (emanating from the Black Hole at -42, 3, -55)
    const bhKeyLight = new THREE.PointLight(0xff7b29, 460, 320, 1.35);
    bhKeyLight.position.set(-40, 5, -50);
    scene.add(bhKeyLight);

    // Cool Rim Light from Deep Space Nebula
    const rimLight = new THREE.DirectionalLight(0x38bdf8, 2.4);
    rimLight.position.set(28, 18, 24);
    scene.add(rimLight);

    // Ship dynamic status light (Cyan in warp/evasion -> Fiery orange/red on asteroid impact)
    const shipStatusLight = new THREE.PointLight(0x00f0ff, 26, 36, 1.4);
    scene.add(shipStatusLight);

    // --- 3. DEEP SPACE STARFIELD ---
    const starCount = isSoftwareGl ? 1400 : 2800;
    const starGeo = new THREE.BufferGeometry();
    const starPositions = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount; i++) {
      const r = 130 + Math.random() * 340;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      starPositions[i * 3 + 2] = r * Math.cos(phi);

      const palette = Math.random();
      const c = new THREE.Color();
      if (palette < 0.55) c.setHex(0xf8fafc);
      else if (palette < 0.8) c.setHex(0x7dd3fc);
      else if (palette < 0.93) c.setHex(0xfde68a);
      else c.setHex(0xfda4af);

      starColors[i * 3] = c.r;
      starColors[i * 3 + 1] = c.g;
      starColors[i * 3 + 2] = c.b;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));

    const starMat = new THREE.PointsMaterial({
      size: 0.9,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const starField = new THREE.Points(starGeo, starMat);
    scene.add(starField);

    // --- 4. HYPERSPACE WARP TUNNEL & SHOCKWAVE FLASH ---
    const warpGroup = new THREE.Group();
    scene.add(warpGroup);

    const warpStreakCount = isSoftwareGl ? 45 : 75;
    const warpStreakGeo = new THREE.BoxGeometry(10, 0.032, 0.032);
    const warpStreakMat = new THREE.MeshBasicMaterial({
      color: 0x7dd3fc,
      transparent: true,
      opacity: 0.36,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const warpStreaks = new THREE.InstancedMesh(warpStreakGeo, warpStreakMat, warpStreakCount);
    const warpData: { x: number; y: number; z: number; speed: number; scaleX: number }[] = [];
    const dummy = new THREE.Object3D();

    // Keep a wide clear cylindrical corridor (radius >= 10.5) around the ship and 3rd-person camera line-of-sight
    // so warp streaks NEVER obscure the spacecraft!
    for (let i = 0; i < warpStreakCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 10.5 + Math.random() * 13.0;
      const x = -40 + Math.random() * 65;
      const y = Math.sin(angle) * radius * 0.72;
      const z = Math.cos(angle) * radius;
      const speed = 75 + Math.random() * 65;
      const scaleX = 0.5 + Math.random() * 1.1;
      warpData.push({ x, y, z, speed, scaleX });
      dummy.position.set(x, y, z);
      dummy.scale.set(scaleX, 1, 1);
      dummy.updateMatrix();
      warpStreaks.setMatrixAt(i, dummy.matrix);
    }
    warpGroup.add(warpStreaks);

    // --- 5. GARGANTUA 3D BLACK HOLE (Positioned at -44, 3, -58) ---
    // Geometrically symmetric, camera-aligned "Interstellar" Gargantua:
    // 1) Back Lensed Halo & Back Equatorial Disk (z = -1.2)
    // 2) Pitch-Black 3D Event Horizon Sphere (z = 0, r = 4.45) + Fresnel Photon Ring (r = 4.60)
    // 3) Foreground Equatorial Accretion Disk Bridge (z = +4.8) sweeping horizontally IN FRONT OF the black sphere!
    const blackHoleGroup = new THREE.Group();
    blackHoleGroup.position.set(-44, 3, -58);
    scene.add(blackHoleGroup);

    const lensingUniforms = {
      uTime: { value: 0 },
    };

    // 5a. Back Gravitational Lensing Halo (continuous 360° Einstein arch) + Back Half of Equatorial Disk (z = -1.2)
    const backLensedMat = new THREE.ShaderMaterial({
      uniforms: lensingUniforms,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending,
      vertexShader: `
        varying vec2 vPos;
        void main() {
          vPos = position.xy;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vPos;
        uniform float uTime;

        void main() {
          // 1. Symmetrical 360-degree Gravitational Lensing Halo wrapping smoothly around the Event Horizon (r = 4.45)
          vec2 lensP = vec2(vPos.x * 0.88, vPos.y * 1.02);
          float rLens = length(lensP);

          // 2. Wide Equatorial Accretion Disk in the horizontal plane (compressed vertically by 4.6x)
          vec2 eqP = vec2(vPos.x, vPos.y * 4.6);
          float rEq = length(eqP);

          // Smooth concentric Keplerian shear rings (100% centered & symmetric)
          float rings = 0.85 + 0.15 * sin(rEq * 2.2 - uTime * 2.4);

          // Lensing arch intensity (peaks tightly around r = 4.5 .. 8.8, fades smoothly outward)
          float lensInner = smoothstep(3.9, 4.55, rLens);
          float lensOuter = exp(-max(0.0, rLens - 4.45) * 0.34);
          float lensIntensity = lensInner * lensOuter * 1.12;

          // Back equatorial disk intensity (rEq = 4.4 .. 26.5)
          float diskInner = smoothstep(4.2, 4.9, rEq);
          float diskNorm = clamp((rEq - 4.45) / (26.5 - 4.45), 0.0, 1.0);
          float diskOuter = pow(1.0 - diskNorm, 1.75) + exp(-diskNorm * 8.0) * 0.45;
          float diskIntensity = (rEq <= 26.5 ? diskInner * diskOuter * rings : 0.0);

          float totalI = clamp(max(lensIntensity, diskIntensity), 0.0, 1.35);
          if (totalI < 0.015) discard;

          // Rich astrophysical blackbody palette: White-Gold Core -> Luminous Amber -> Deep Orange -> Dark Crimson
          float radialT = clamp(min(max(0.0, rLens - 4.4) / 7.5, diskNorm), 0.0, 1.0);
          vec3 colWhite = vec3(1.0, 0.98, 0.88);
          vec3 colAmber = vec3(1.0, 0.62, 0.16);
          vec3 colOrange = vec3(0.86, 0.24, 0.04);
          vec3 colCrimson = vec3(0.28, 0.04, 0.01);

          vec3 col = mix(colWhite, colAmber, smoothstep(0.0, 0.22, radialT));
          col = mix(col, colOrange, smoothstep(0.18, 0.58, radialT));
          col = mix(col, colCrimson, smoothstep(0.55, 0.96, radialT));

          float alpha = clamp(smoothstep(0.015, 0.38, totalI) * 0.96, 0.0, 0.96);
          gl_FragColor = vec4(col * (0.62 + totalI * 0.62), alpha);
        }
      `,
    });
    const backLensedMesh = new THREE.Mesh(new THREE.PlaneGeometry(58, 58), backLensedMat);
    backLensedMesh.position.z = -1.2;
    blackHoleGroup.add(backLensedMesh);

    // 5b. Schwarzschild Event Horizon (3D Pitch-Black Sphere at z = 0 occluding the center of the back halo)
    const horizonGeo = new THREE.SphereGeometry(4.45, 64, 64);
    const horizonMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      depthWrite: true,
      depthTest: true,
    });
    const horizonMesh = new THREE.Mesh(horizonGeo, horizonMat);
    blackHoleGroup.add(horizonMesh);

    // 5c. 3D Spherical Fresnel Einstein Photon Ring (razor-sharp golden-white rim around the Event Horizon)
    const photonShellMat = new THREE.ShaderMaterial({
      uniforms: lensingUniforms,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vViewPosition = -mvPosition.xyz;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        void main() {
          vec3 viewDir = normalize(vViewPosition);
          float ndotv = abs(dot(vNormal, viewDir));
          float rim = pow(clamp(1.0 - ndotv, 0.0, 1.0), 4.8);
          vec3 col = mix(vec3(1.0, 0.58, 0.14), vec3(1.0, 0.98, 0.88), rim);
          gl_FragColor = vec4(col * rim * 2.1, rim * 0.95);
        }
      `,
    });
    const photonShellMesh = new THREE.Mesh(
      new THREE.SphereGeometry(4.60, 64, 64),
      photonShellMat
    );
    blackHoleGroup.add(photonShellMesh);

    // 5d. Foreground Equatorial Accretion Disk Bridge (z = +4.8, in front of the black sphere!)
    //     Sweeps horizontally from left to right across the front-lower equator of the black sphere
    const frontBridgeMat = new THREE.ShaderMaterial({
      uniforms: lensingUniforms,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending,
      vertexShader: `
        varying vec2 vPos;
        void main() {
          vPos = position.xy;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vPos;
        uniform float uTime;

        void main() {
          // Only render the front half of the tilted equatorial disk (vPos.y <= 0.35)
          if (vPos.y > 0.35) discard;

          vec2 eqP = vec2(vPos.x, vPos.y * 4.6);
          float rEq = length(eqP);
          if (rEq < 4.30 || rEq > 26.5) discard;

          float diskNorm = clamp((rEq - 4.30) / (26.5 - 4.30), 0.0, 1.0);
          float innerEdge = smoothstep(4.30, 4.85, rEq);
          float topSeamFade = smoothstep(0.35, -0.35, vPos.y);

          // Concentric Keplerian plasma shear rings matching the back disk
          float rings = 0.85 + 0.15 * sin(rEq * 2.2 - uTime * 2.4);
          float radialProfile = innerEdge * topSeamFade * (pow(1.0 - diskNorm, 1.65) + exp(-diskNorm * 8.5) * 0.55);
          float intensity = clamp(radialProfile * rings * 1.18, 0.0, 1.4);
          if (intensity < 0.015) discard;

          vec3 colWhite = vec3(1.0, 0.98, 0.88);
          vec3 colAmber = vec3(1.0, 0.62, 0.16);
          vec3 colOrange = vec3(0.86, 0.24, 0.04);
          vec3 colCrimson = vec3(0.28, 0.04, 0.01);

          vec3 col = mix(colWhite, colAmber, smoothstep(0.0, 0.22, diskNorm));
          col = mix(col, colOrange, smoothstep(0.18, 0.58, diskNorm));
          col = mix(col, colCrimson, smoothstep(0.55, 0.96, diskNorm));

          float alpha = clamp(smoothstep(0.015, 0.32, intensity) * 0.98, 0.0, 0.98);
          gl_FragColor = vec4(col * (0.65 + intensity * 0.65), alpha);
        }
      `,
    });
    const frontBridgeMesh = new THREE.Mesh(new THREE.PlaneGeometry(58, 16), frontBridgeMat);
    frontBridgeMesh.position.z = 4.8;
    blackHoleGroup.add(frontBridgeMesh);

    // --- 6. NEW SLEEK WINGED SCI-FI CRUISER: "USSC HYPERION" ---
    const shipGroup = new THREE.Group();
    shipGroup.scale.setScalar(1.38);
    scene.add(shipGroup);

    const hullTitaniumMat = new THREE.MeshStandardMaterial({
      color: 0xdbe4f0,
      metalness: 0.85,
      roughness: 0.24,
    });
    const darkArmorMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.88,
      roughness: 0.32,
    });
    const goldTrimMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.92,
      roughness: 0.2,
    });
    const cockpitGlassMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      emissive: new THREE.Color(0x00d8ff),
      emissiveIntensity: 1.6,
      metalness: 0.95,
      roughness: 0.08,
    });
    const warpCoilMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: new THREE.Color(0x00f0ff),
      emissiveIntensity: 3.4,
      roughness: 0.15,
    });
    const thrusterFlameMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
    });

    // 6a. Sleek Angular Central Fuselage Spine (oriented along -X = Forward, +X = Aft)
    const fuselageCore = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.56, 1.35), hullTitaniumMat);
    shipGroup.add(fuselageCore);

    const dorsalSpine = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.36, 0.78), darkArmorMat);
    dorsalSpine.position.set(0.2, 0.38, 0);
    shipGroup.add(dorsalSpine);

    // 6b. Sharp Faceted Needle Nose Cone & Sensor Lance
    const noseConeGeo = new THREE.ConeGeometry(0.68, 2.3, 4);
    const noseCone = new THREE.Mesh(noseConeGeo, hullTitaniumMat);
    noseCone.rotation.z = Math.PI / 2;
    noseCone.rotation.x = Math.PI / 4;
    noseCone.scale.set(1, 1, 0.62);
    noseCone.position.set(-3.2, 0.02, 0);
    shipGroup.add(noseCone);

    const sensorLance = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.06, 1.1, 8), goldTrimMat);
    sensorLance.rotation.z = Math.PI / 2;
    sensorLance.position.set(-4.5, 0.02, 0);
    shipGroup.add(sensorLance);

    // 6c. Armored Panoramic Bridge Canopy
    const canopyMesh = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.34, 0.66), cockpitGlassMat);
    canopyMesh.position.set(-1.35, 0.42, 0);
    canopyMesh.rotation.z = -0.14;
    shipGroup.add(canopyMesh);

    // 6d. Dorsal Tokamak Fusion Core Dome (glowing reactor heart in the upper hull)
    const tokamakRing = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.09, 16, 32), goldTrimMat);
    tokamakRing.rotation.x = Math.PI / 2;
    tokamakRing.position.set(0.55, 0.58, 0);
    shipGroup.add(tokamakRing);

    const tokamakCoreDome = new THREE.Mesh(new THREE.SphereGeometry(0.32, 24, 16), warpCoilMat);
    tokamakCoreDome.scale.set(1.2, 0.55, 1.2);
    tokamakCoreDome.position.set(0.55, 0.56, 0);
    shipGroup.add(tokamakCoreDome);

    // 6e. Swept-Back Main Delta Wings (Port -Z and Starboard +Z)
    const portWingGroup = new THREE.Group();
    shipGroup.add(portWingGroup);

    const portWingBlade = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.14, 2.5), hullTitaniumMat);
    portWingBlade.position.set(0.35, -0.04, -1.65);
    portWingBlade.rotation.y = -0.38;
    portWingGroup.add(portWingBlade);

    const portWingArmor = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.18, 1.6), darkArmorMat);
    portWingArmor.position.set(0.5, 0.02, -1.35);
    portWingArmor.rotation.y = -0.38;
    portWingGroup.add(portWingArmor);

    // Port Wing-Tip Alcubierre Warp Nacelle
    const nacelleGeo = new THREE.CylinderGeometry(0.24, 0.3, 3.3, 16);
    const portNacelle = new THREE.Mesh(nacelleGeo, darkArmorMat);
    portNacelle.rotation.z = Math.PI / 2;
    portNacelle.position.set(0.75, 0.02, -2.75);
    portWingGroup.add(portNacelle);

    const portWarpStrip = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.12, 0.52), warpCoilMat);
    portWarpStrip.position.set(0.7, 0.05, -2.75);
    portWingGroup.add(portWarpStrip);

    // Starboard Wing & Nacelle (+Z)
    const stbdWingBlade = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.14, 2.5), hullTitaniumMat);
    stbdWingBlade.position.set(0.35, -0.04, 1.65);
    stbdWingBlade.rotation.y = 0.38;
    shipGroup.add(stbdWingBlade);

    const stbdWingArmor = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.18, 1.6), darkArmorMat);
    stbdWingArmor.position.set(0.5, 0.02, 1.35);
    stbdWingArmor.rotation.y = 0.38;
    shipGroup.add(stbdWingArmor);

    const stbdNacelle = new THREE.Mesh(nacelleGeo, darkArmorMat);
    stbdNacelle.rotation.z = Math.PI / 2;
    stbdNacelle.position.set(0.75, 0.02, 2.75);
    shipGroup.add(stbdNacelle);

    const stbdWarpStrip = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.12, 0.52), warpCoilMat);
    stbdWarpStrip.position.set(0.7, 0.05, 2.75);
    shipGroup.add(stbdWarpStrip);

    // 6f. Forward Swept Canard Winglets
    const canardGeo = new THREE.BoxGeometry(1.0, 0.09, 0.9);
    const portCanard = new THREE.Mesh(canardGeo, goldTrimMat);
    portCanard.position.set(-1.95, 0.0, -0.82);
    portCanard.rotation.y = 0.45;
    shipGroup.add(portCanard);

    const stbdCanard = new THREE.Mesh(canardGeo, goldTrimMat);
    stbdCanard.position.set(-1.95, 0.0, 0.82);
    stbdCanard.rotation.y = -0.45;
    shipGroup.add(stbdCanard);

    // 6g. Twin Angled V-Tail Stabilizer Fins
    const tailFinGeo = new THREE.BoxGeometry(1.35, 1.05, 0.1);
    const portTailFin = new THREE.Mesh(tailFinGeo, hullTitaniumMat);
    portTailFin.position.set(1.75, 0.65, -0.68);
    portTailFin.rotation.x = -0.42;
    portTailFin.rotation.z = -0.28;
    shipGroup.add(portTailFin);

    const stbdTailFin = new THREE.Mesh(tailFinGeo, hullTitaniumMat);
    stbdTailFin.position.set(1.75, 0.65, 0.68);
    stbdTailFin.rotation.x = 0.42;
    stbdTailFin.rotation.z = -0.28;
    shipGroup.add(stbdTailFin);

    // 6h. Quad Heavy Ion-Plasma Thruster Nozzles & Dynamic Plume Cones
    const thrusterGroup = new THREE.Group();
    shipGroup.add(thrusterGroup);

    const nozzleOffsets: [number, number, number, number][] = [
      [2.35, 0.08, -0.42, 1.0],
      [2.35, 0.08, 0.42, 1.0],
      [2.45, 0.02, -2.75, 0.82],
      [2.45, 0.02, 2.75, 0.82],
    ];
    const flameCones: THREE.Mesh[] = [];

    nozzleOffsets.forEach(([nx, ny, nz, sc]) => {
      const bell = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18 * sc, 0.28 * sc, 0.55, 16),
        darkArmorMat
      );
      bell.rotation.z = Math.PI / 2;
      bell.position.set(nx, ny, nz);
      shipGroup.add(bell);

      const coreGlow = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16 * sc, 0.16 * sc, 0.12, 16),
        warpCoilMat
      );
      coreGlow.rotation.z = Math.PI / 2;
      coreGlow.position.set(nx + 0.25, ny, nz);
      shipGroup.add(coreGlow);

      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(0.22 * sc, 1.65 * sc, 16),
        thrusterFlameMat
      );
      cone.rotation.z = -Math.PI / 2;
      cone.position.set(nx + 0.98 * sc, ny, nz);
      thrusterGroup.add(cone);
      flameCones.push(cone);
    });

    // --- 7. 3D ASTEROID BELT (Craggy Meteoroids + Close-Call Boulders + Glowing Impactor) ---
    const asteroidBeltGroup = new THREE.Group();
    scene.add(asteroidBeltGroup);

    const rockMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.9,
      metalness: 0.12,
      flatShading: true,
    });

    const beltCount = isSoftwareGl ? 38 : 60;
    const baseRockGeo = createRockyAsteroidGeometry(1.0, 2, 13.7);
    const beltInstanced = new THREE.InstancedMesh(baseRockGeo, rockMat, beltCount);
    const beltItems: {
      basePos: THREE.Vector3;
      vel: THREE.Vector3;
      rotAxis: THREE.Vector3;
      rotSpeed: number;
      scale: number;
    }[] = [];

    for (let i = 0; i < beltCount; i++) {
      const bx = -42 + Math.random() * 90;
      const by = (Math.random() - 0.5) * 32;
      const bz = -36 + Math.random() * 50;
      // Keep a clear corridor right in front of the Black Hole core so it isn't occluded by giant rocks
      if (bx < -15 && Math.abs(by - 2) < 9 && bz < -12) continue;

      const scale = 0.35 + Math.random() * 1.15;
      beltItems.push({
        basePos: new THREE.Vector3(bx, by, bz),
        vel: new THREE.Vector3(15 + Math.random() * 16, (Math.random() - 0.5) * 2.5, (Math.random() - 0.5) * 2.5),
        rotAxis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
        rotSpeed: 0.9 + Math.random() * 2.4,
        scale,
      });
    }
    asteroidBeltGroup.add(beltInstanced);

    // 4 Hero "Near-Miss" Asteroids that streak right past USSC HYPERION during Act II (1.8s - 5.2s)
    const nearMissConfigs = [
      { passTime: 2.35, offsetY: 1.55, offsetZ: -2.1, radius: 1.25, seed: 3.1 },
      { passTime: 3.15, offsetY: -1.45, offsetZ: 2.2, radius: 1.45, seed: 7.4 },
      { passTime: 3.95, offsetY: 1.75, offsetZ: 1.6, radius: 1.35, seed: 19.2 },
      { passTime: 4.55, offsetY: -1.65, offsetZ: -1.8, radius: 1.55, seed: 31.8 },
    ];
    const nearMissMeshes = nearMissConfigs.map((cfg) => {
      const mesh = new THREE.Mesh(createRockyAsteroidGeometry(cfg.radius, 2, cfg.seed), rockMat);
      asteroidBeltGroup.add(mesh);
      return { mesh, ...cfg };
    });

    // THE ROGUE IMPACTOR ASTEROID (Slams directly into USSC HYPERION's port wing at t = 5.20s!)
    const impactorGeo = createRockyAsteroidGeometry(1.5, 3, 42.5);
    const impactorMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      emissive: new THREE.Color(0x9a3412),
      emissiveIntensity: 0.55,
      roughness: 0.82,
      metalness: 0.22,
      flatShading: true,
    });
    const impactorMesh = new THREE.Mesh(impactorGeo, impactorMat);
    impactorMesh.visible = false;
    scene.add(impactorMesh);

    // --- 8. IMPACT EXPLOSION FIREBALL, DEBRIS SHRAPNEL & ELECTRICAL ARCS ---
    const explosionFlashMat = new THREE.MeshBasicMaterial({
      color: 0xff9e2c,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const explosionSphere = new THREE.Mesh(new THREE.SphereGeometry(1.35, 24, 24), explosionFlashMat);
    scene.add(explosionSphere);

    const debrisCount = isSoftwareGl ? 36 : 56;
    const debrisGeo = new THREE.DodecahedronGeometry(0.18, 0);
    const debrisMat = new THREE.MeshStandardMaterial({
      color: 0xf97316,
      emissive: new THREE.Color(0xff5500),
      emissiveIntensity: 2.5,
      metalness: 0.75,
      roughness: 0.3,
    });
    const debrisInstanced = new THREE.InstancedMesh(debrisGeo, debrisMat, debrisCount);
    const debrisItems: {
      relPos: THREE.Vector3;
      vel: THREE.Vector3;
      rotAxis: THREE.Vector3;
      rotSpeed: number;
      scale: number;
      angle: number;
    }[] = [];

    for (let i = 0; i < debrisCount; i++) {
      debrisItems.push({
        relPos: new THREE.Vector3(0.4, 0.0, -2.2),
        vel: new THREE.Vector3(
          (Math.random() - 0.3) * 14,
          (Math.random() - 0.4) * 12,
          -3 - Math.random() * 14
        ),
        rotAxis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
        rotSpeed: 4 + Math.random() * 9,
        scale: 0.5 + Math.random() * 1.45,
        angle: Math.random() * Math.PI * 2,
      });
      dummy.position.set(0, -999, 0);
      dummy.scale.setScalar(0.001);
      dummy.updateMatrix();
      debrisInstanced.setMatrixAt(i, dummy.matrix);
    }
    scene.add(debrisInstanced);

    // Electrical Short-Circuit Arcs on Disabled Hull
    const sparkLinesGroup = new THREE.Group();
    sparkLinesGroup.visible = false;
    shipGroup.add(sparkLinesGroup);

    const sparkMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
    });
    const sparkGeos: THREE.BufferGeometry[] = [];
    for (let s = 0; s < 4; s++) {
      const pts = new Float32Array(6 * 3);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pts, 3));
      const line = new THREE.Line(g, sparkMat);
      sparkLinesGroup.add(line);
      sparkGeos.push(g);
    }

    // --- 9. GRAVITATIONAL INFLOW STREAM PARTICLES (Pulled from Ship into Gargantua) ---
    const streamCount = isSoftwareGl ? 100 : 200;
    const streamGeo = new THREE.BufferGeometry();
    const streamPos = new Float32Array(streamCount * 3);
    const streamCol = new Float32Array(streamCount * 3);
    const streamPhase = new Float32Array(streamCount);

    for (let i = 0; i < streamCount; i++) {
      streamPhase[i] = Math.random();
      const c = new THREE.Color().setHSL(0.06 + Math.random() * 0.06, 1.0, 0.58);
      streamCol[i * 3] = c.r;
      streamCol[i * 3 + 1] = c.g;
      streamCol[i * 3 + 2] = c.b;
    }
    streamGeo.setAttribute('position', new THREE.BufferAttribute(streamPos, 3));
    streamGeo.setAttribute('color', new THREE.BufferAttribute(streamCol, 3));

    const streamMat = new THREE.PointsMaterial({
      size: 0.38,
      vertexColors: true,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const gravityStream = new THREE.Points(streamGeo, streamMat);
    scene.add(gravityStream);

    // --- 10. RESIZE HANDLER ---
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // --- 11. SOFTWARE WEBGL FENCE-PACED RENDER LOOP ---
    let disposed = false;
    let rafId = 0;

    function afterDraw(cb: () => void) {
      if (!isSoftwareGl) {
        rafId = requestAnimationFrame(cb);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        if (!sync) {
          cb();
          return;
        }
        const status = gl.clientWaitSync(sync, 0, 0);
        if (status === gl.ALREADY_SIGNALED || status === gl.CONDITION_SATISFIED) {
          gl.deleteSync(sync);
          cb();
        } else {
          setTimeout(poll, 80);
        }
      };
      setTimeout(poll, 80);
    }

    // Trajectory helper for USSC HYPERION across all 4 acts
    const getShipFlightState = (t: number) => {
      const pos = new THREE.Vector3();
      const rot = new THREE.Euler();

      if (t < 1.8) {
        // ACT I: Hyperspace Warp Jump & Drop-Out
        const p = Math.min(1, t / 1.8);
        const easeOut = 1 - Math.pow(1 - p, 4);
        pos.x = 58 - easeOut * 38; // Streaks in from +58 to +20
        pos.y = 1.2 + Math.sin(t * 16) * 0.08 * (1 - p);
        pos.z = 4.5;
        rot.x = 0.08;
        rot.y = 0.14;
        rot.z = 0.04;
      } else if (t < 5.2) {
        // ACT II: High-Speed Asteroid Belt Evasive Maneuvers
        const u = (t - 1.8) / 3.4; // 0..1
        pos.x = 20 - u * 24; // Flies from +20 to -4 through the dense belt

        // Sharp evasive S-turns and dives around the 4 incoming close-call boulders
        const dodgeY =
          Math.sin(u * Math.PI * 3.0) * 2.4 +
          Math.cos(u * Math.PI * 6.0) * 0.6;
        const dodgeZ =
          4.5 +
          Math.cos(u * Math.PI * 2.5) * 2.8 -
          Math.sin(u * Math.PI * 5.0) * 0.85;

        pos.y = 1.2 + dodgeY;
        pos.z = dodgeZ;

        // Aggressive barrel-roll banking & pitch response matching the evasive turns
        rot.x = Math.sin(u * Math.PI * 2.5) * 1.15; // Up to 65 deg bank!
        rot.y = 0.14 - Math.sin(u * Math.PI * 2.5) * 0.28;
        rot.z = -Math.cos(u * Math.PI * 3.0) * 0.25;
      } else if (t < 7.0) {
        // ACT III: Direct Asteroid Impact at t = 5.2s! Propulsion Offline!
        const u = (t - 5.2) / 1.8; // 0..1
        pos.x = -4.0 - u * 5.2;
        pos.y = 1.8 - u * 1.3 + Math.sin(u * Math.PI * 5) * 0.35 * (1 - u);
        pos.z = 4.5 + u * 1.4;

        // Violent rotational spin knocked into the ship by the port-wing impact
        rot.x = -0.35 + u * 2.35;
        rot.y = 0.14 + u * 1.25;
        rot.z = 0.22 + u * 0.82;
      } else {
        // ACT IV: Crippled & Adrift — Pulled into Gargantua Black Hole (-44, 3, -58)
        const u = Math.min(1, (t - 7.0) / 16.0);
        const pull = u * u * (3 - 2 * u);
        pos.x = -9.2 - pull * 26.5 + Math.sin(t * 0.8) * 0.35;
        pos.y = 0.5 + pull * 2.1 + Math.cos(t * 0.65) * 0.3;
        pos.z = 5.9 - pull * 42.0;

        // Helpless zero-G tumble as tidal gravity drags the dead ship inward
        rot.x = 2.0 + (t - 7.0) * 0.55;
        rot.y = 1.39 + (t - 7.0) * 0.38;
        rot.z = 1.04 + (t - 7.0) * 0.29;
      }

      return { pos, rot };
    };

    const tick = () => {
      if (disposed) return;

      const now = performance.now();
      if (startTimeRef.current < 0) {
        startTimeRef.current = now;
      }
      const winForced = (window as unknown as { __cutsceneTime?: number }).__cutsceneTime;
      const activeForced =
        typeof winForced === 'number' && !Number.isNaN(winForced) ? winForced : forcedTime;
      const rawElapsed =
        activeForced !== null && !Number.isNaN(activeForced)
          ? activeForced
          : (now - startTimeRef.current) / 1000;

      // Trigger Audio Cues & Phase Transitions (never revert once in 'menu')
      if (phaseRef.current !== 'menu') {
        if (rawElapsed >= 0.05 && !warpTriggeredRef.current) {
          warpTriggeredRef.current = true;
          sound.playWarpJump();
        }
        if (rawElapsed >= 1.8 && rawElapsed < 5.2 && phaseRef.current !== 'asteroids') {
          updatePhase('asteroids');
        }
        if (rawElapsed >= 5.2 && !impactTriggeredRef.current) {
          impactTriggeredRef.current = true;
          sound.playAsteroidImpact();
          if (rawElapsed < 7.0) updatePhase('impact');
        }
        if (rawElapsed >= 7.0 && !pullSoundTriggeredRef.current) {
          pullSoundTriggeredRef.current = true;
          sound.playBlackHoleIntro();
          if (rawElapsed < 8.6) updatePhase('blackhole');
        }
        if (rawElapsed >= 8.6) {
          updatePhase('menu');
        }
      }

      // Dramatic Post-Accident Time-Freeze ("Заморозка сцены"):
      // After t = 7.4s, time smoothly decelerates and freezes completely at t = 8.40s when the menu appears!
      let elapsed = rawElapsed;
      if (phaseRef.current === 'menu' && activeForced === null) {
        elapsed = 8.40;
      } else if (rawElapsed > 7.4) {
        const freezeProgress = Math.min(1, (rawElapsed - 7.4) / 1.4);
        const easedFreeze = 1 - Math.pow(1 - freezeProgress, 3);
        elapsed = 7.4 + easedFreeze * 1.0; // Smoothly decelerates to a complete freeze at 8.40s
      }

      // Update Black Hole Shader Uniforms (frozen at 8.40s when scene is frozen)
      lensingUniforms.uTime.value = elapsed;

      // 1. Update USSC HYPERION Position & Attitude
      const { pos: shipPos, rot: shipRot } = getShipFlightState(elapsed);
      shipGroup.position.copy(shipPos);
      shipGroup.rotation.copy(shipRot);
      shipStatusLight.position.set(shipPos.x - 0.5, shipPos.y + 1.8, shipPos.z + 2.4);

      // 2. Update Subtle Peripheral Hyperspace Warp Lines (strictly outside a 10.5u radius so the ship is 100% clear)
      if (elapsed < 2.0) {
        warpGroup.visible = true;
        const warpFade = elapsed < 1.35 ? 1.0 : Math.max(0, 1 - (elapsed - 1.35) / 0.65);
        warpStreakMat.opacity = warpFade * 0.36;

        for (let i = 0; i < warpStreakCount; i++) {
          const wd = warpData[i];
          const curX = ((wd.x + elapsed * wd.speed + 35) % 65) - 40;
          dummy.position.set(shipPos.x + curX, shipPos.y + wd.y, shipPos.z + wd.z);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.set(wd.scaleX * (0.4 + warpFade * 0.8), 1, 1);
          dummy.updateMatrix();
          warpStreaks.setMatrixAt(i, dummy.matrix);
        }
        warpStreaks.instanceMatrix.needsUpdate = true;
      } else {
        warpGroup.visible = false;
      }

      // 3. Update Main Ion-Plasma Thrusters & Hull Status Lighting
      if (elapsed < 5.2) {
        // Engines roaring at full thrust during Warp & Asteroid Evasion
        thrusterGroup.visible = true;
        const thrustPulse = 1.0 + Math.sin(elapsed * 42) * 0.22;
        flameCones.forEach((cone) => {
          cone.scale.set(1, thrustPulse, 1);
        });
        warpCoilMat.emissive.setHex(0x00f0ff);
        warpCoilMat.emissiveIntensity = 3.4 + Math.sin(elapsed * 20) * 0.5;
        cockpitGlassMat.emissive.setHex(0x00d8ff);
        shipStatusLight.color.setHex(0x00f0ff);
        shipStatusLight.intensity = 26;
        portWingGroup.rotation.set(0, 0, 0);
        portWingGroup.position.set(0, 0, 0);
        sparkLinesGroup.visible = false;
      } else {
        // AFTER ASTEROID IMPACT (t >= 5.2s): Complete Engine Failure!
        const timeSinceHit = elapsed - 5.2;
        if (timeSinceHit < 0.65) {
          thrusterGroup.visible = Math.sin(elapsed * 75) > 0;
          flameCones.forEach((cone) => {
            cone.scale.set(0.6, Math.max(0.05, 1 - timeSinceHit * 1.5), 0.6);
          });
        } else {
          thrusterGroup.visible = false;
        }

        // Port wing & warp nacelle visibly bent/sheared from the asteroid collision
        portWingGroup.rotation.set(0.34, 0.2, -0.26);
        portWingGroup.position.set(0.25, -0.34, -0.48);

        // Emergency red/amber critical hull status
        const alarmPulse = 0.5 + 0.5 * Math.sin(elapsed * 14);
        warpCoilMat.emissive.setHex(0xff2a00);
        warpCoilMat.emissiveIntensity = 0.4 + alarmPulse * 1.5;
        cockpitGlassMat.emissive.setHex(0xff3b00);
        cockpitGlassMat.emissiveIntensity = 0.8 + alarmPulse * 1.2;

        if (timeSinceHit < 0.85) {
          shipStatusLight.color.setHex(0xffaa33);
          shipStatusLight.intensity = 75 * (1 - timeSinceHit / 0.85);
        } else {
          shipStatusLight.color.setHex(0xff1e00);
          shipStatusLight.intensity = 12 + alarmPulse * 18;
        }

        // Flickering electrical arcs across the damaged port wing & dorsal reactor
        sparkLinesGroup.visible = Math.sin(elapsed * 47) > -0.25;
        if (sparkLinesGroup.visible) {
          sparkGeos.forEach((g, idx) => {
            const attr = g.attributes.position as THREE.BufferAttribute;
            let sx = idx % 2 === 0 ? 0.5 : -0.4;
            let sy = 0.25;
            let sz = idx < 2 ? -1.8 : -0.6;
            for (let p = 0; p < 6; p++) {
              attr.setXYZ(
                p,
                sx + (Math.random() - 0.5) * 0.55,
                sy + (Math.random() - 0.5) * 0.55,
                sz + (Math.random() - 0.5) * 0.55
              );
              sx += (Math.random() - 0.5) * 0.4;
              sy += (Math.random() - 0.5) * 0.4;
              sz += (Math.random() - 0.5) * 0.4;
            }
            attr.needsUpdate = true;
          });
        }
      }

      // 4. Update 3D Asteroid Belt (appears as ship drops out of warp)
      asteroidBeltGroup.visible = elapsed > 1.35;
      for (let i = 0; i < beltItems.length; i++) {
        const item = beltItems[i];
        const pullFactor = elapsed > 7.0 ? Math.min(1, (elapsed - 7.0) / 14.0) : 0;
        const ax = ((item.basePos.x + elapsed * item.vel.x + 42) % 90) - 42;
        const ay = item.basePos.y + Math.sin(elapsed * 0.6 + i) * 1.1;
        const az = item.basePos.z;

        dummy.position.set(
          ax * (1 - pullFactor * 0.45) - pullFactor * 38,
          ay * (1 - pullFactor * 0.45) + pullFactor * 3,
          az * (1 - pullFactor * 0.45) - pullFactor * 52
        );
        dummy.rotation.set(
          item.rotAxis.x * elapsed * item.rotSpeed,
          item.rotAxis.y * elapsed * item.rotSpeed,
          item.rotAxis.z * elapsed * item.rotSpeed
        );
        dummy.scale.setScalar(item.scale);
        dummy.updateMatrix();
        beltInstanced.setMatrixAt(i, dummy.matrix);
      }
      beltInstanced.instanceMatrix.needsUpdate = true;

      // Update the 4 Hero "Near-Miss" Asteroids during Act II
      nearMissMeshes.forEach((nm) => {
        const dt = elapsed - nm.passTime;
        if (Math.abs(dt) < 2.0) {
          nm.mesh.visible = true;
          const refState = getShipFlightState(nm.passTime);
          nm.mesh.position.set(
            refState.pos.x + dt * 34,
            refState.pos.y + nm.offsetY + dt * 2.2,
            refState.pos.z + nm.offsetZ - dt * 2.6
          );
          nm.mesh.rotation.set(elapsed * 2.4, elapsed * 1.9, elapsed * 1.3);
        } else {
          nm.mesh.visible = false;
        }
      });

      // 5. Update the Rogue Impactor Asteroid & 3D Explosion at t = 5.20s
      if (elapsed >= 4.1 && elapsed < 5.22) {
        impactorMesh.visible = true;
        const hitState = getShipFlightState(5.2);
        const targetHitPoint = new THREE.Vector3(
          hitState.pos.x + 0.4,
          hitState.pos.y + 0.1,
          hitState.pos.z - 2.2
        );
        const approachStart = new THREE.Vector3(
          targetHitPoint.x - 32,
          targetHitPoint.y + 10,
          targetHitPoint.z - 12
        );
        const u = Math.min(1, (elapsed - 4.1) / (5.2 - 4.1));
        impactorMesh.position.lerpVectors(approachStart, targetHitPoint, u);
        impactorMesh.rotation.set(elapsed * 4.5, elapsed * 3.8, elapsed * 2.9);
      } else {
        impactorMesh.visible = false;
      }

      // Expanding 3D Fireball & Flying Shrapnel after impact (t >= 5.2s)
      if (elapsed >= 5.2) {
        const dtHit = elapsed - 5.2;
        if (dtHit < 1.35) {
          explosionSphere.visible = true;
          explosionSphere.position.set(shipPos.x + 0.3, shipPos.y, shipPos.z - 2.0);
          explosionSphere.scale.setScalar(0.7 + dtHit * 10.5);
          explosionFlashMat.opacity = Math.max(0, 1 - dtHit / 1.25) * 0.94;
        } else {
          explosionSphere.visible = false;
        }

        // Update 3D flying shrapnel & shattered asteroid chunks
        for (let i = 0; i < debrisCount; i++) {
          const d = debrisItems[i];
          dummy.position.set(
            shipPos.x + d.relPos.x + d.vel.x * dtHit * 0.48,
            shipPos.y + d.relPos.y + d.vel.y * dtHit * 0.48,
            shipPos.z + d.relPos.z + d.vel.z * dtHit * 0.48
          );
          dummy.rotation.set(
            d.angle + dtHit * d.rotSpeed * d.rotAxis.x,
            d.angle + dtHit * d.rotSpeed * d.rotAxis.y,
            d.angle + dtHit * d.rotSpeed * d.rotAxis.z
          );
          const shrink = Math.max(0.08, 1 - dtHit * 0.08);
          dummy.scale.setScalar(d.scale * shrink);
          dummy.updateMatrix();
          debrisInstanced.setMatrixAt(i, dummy.matrix);
        }
        debrisInstanced.instanceMatrix.needsUpdate = true;
      } else {
        explosionSphere.visible = false;
      }

      // 6. Gravitational Inflow Stream pulling plasma/debris from USSC HYPERION into Gargantua (Act IV)
      if (elapsed >= 6.5) {
        const streamOpacity = Math.min(0.85, (elapsed - 6.5) / 2.2);
        streamMat.opacity = streamOpacity;
        const posAttr = streamGeo.attributes.position as THREE.BufferAttribute;

        for (let i = 0; i < streamCount; i++) {
          const p = (streamPhase[i] + elapsed * 0.36) % 1.0;
          const sx = THREE.MathUtils.lerp(shipPos.x, blackHoleGroup.position.x, p);
          const sy =
            THREE.MathUtils.lerp(shipPos.y, blackHoleGroup.position.y, p) +
            Math.sin(p * Math.PI * 2 + i) * (1 - p) * 2.2;
          const sz =
            THREE.MathUtils.lerp(shipPos.z, blackHoleGroup.position.z, p) +
            Math.cos(p * Math.PI * 2 + i) * (1 - p) * 2.2;
          posAttr.setXYZ(i, sx, sy, sz);
        }
        posAttr.needsUpdate = true;
      } else {
        streamMat.opacity = 0;
      }

      // 7. Dynamic 4-Act Cinematic Camera Choreography (Starting in 3rd-Person View Directly Behind the Ship!)
      if (elapsed < 1.8) {
        // ACT I: Clear 3rd-Person Over-the-Shoulder View Behind USSC HYPERION's Stern (+X looking forward along -X)
        const p = elapsed / 1.8;
        camera.fov = THREE.MathUtils.lerp(52, 46, 1 - Math.pow(1 - p, 3));
        camera.updateProjectionMatrix();

        // Positioned directly behind the ship (+X = +10.2), slightly above (+Y = +2.6), centered on the ship's Z flight axis
        camera.position.set(shipPos.x + 10.2, shipPos.y + 2.6, shipPos.z + 0.4);
        camera.lookAt(shipPos.x - 14.0, shipPos.y + 0.1, shipPos.z - 1.5);
      } else if (elapsed < 5.2) {
        // ACT II: 3rd-Person Action Chase Camera Behind USSC HYPERION through the Asteroid Belt
        camera.fov = 47;
        camera.updateProjectionMatrix();

        const targetCamPos = new THREE.Vector3(
          shipPos.x + 10.4,
          shipPos.y * 0.72 + 2.6,
          shipPos.z * 0.8 + 1.8
        );
        if (forcedTime !== null) {
          camera.position.copy(targetCamPos);
        } else {
          camera.position.lerp(targetCamPos, 0.16);
        }
        camera.lookAt(shipPos.x - 12.0, shipPos.y * 0.65, shipPos.z * 0.5 - 3.5);
      } else if (elapsed < 7.0) {
        // ACT III: Violent Camera Shake on Asteroid Impact & Close-Up on Disabled Ship
        const dtHit = elapsed - 5.2;
        const shakeDecay = Math.max(0, 1 - dtHit / 1.1);
        const shakeX = (Math.random() - 0.5) * 1.25 * shakeDecay;
        const shakeY = (Math.random() - 0.5) * 1.25 * shakeDecay;

        const targetCamPos = new THREE.Vector3(
          shipPos.x + 6.8 + shakeX,
          shipPos.y + 1.9 + shakeY,
          shipPos.z + 9.2
        );
        if (forcedTime !== null) {
          camera.position.copy(targetCamPos);
        } else {
          camera.position.lerp(targetCamPos, 0.2);
        }
        camera.lookAt(shipPos.x - 2.5 + shakeX * 0.5, shipPos.y + shakeY * 0.5, shipPos.z - 3.0);
      } else {
        // ACT IV: Sweeping Shot revealing the Disabled Ship being dragged into Gargantua Black Hole
        const u = Math.min(1, (elapsed - 7.0) / 4.2);
        const smoothU = u * u * (3 - 2 * u);

        const wideCamPos = new THREE.Vector3(
          shipPos.x + 11.2 + Math.sin(elapsed * 0.25) * 0.6,
          shipPos.y + 4.8 + Math.cos(elapsed * 0.2) * 0.4,
          shipPos.z + 9.2
        );
        if (forcedTime !== null) {
          camera.position.copy(wideCamPos);
        } else {
          camera.position.lerp(wideCamPos, 0.08 + smoothU * 0.06);
        }

        // Frame the crippled USSC HYPERION in the lower-right foreground and the unobstructed Gargantua Black Hole ahead-left
        const lookX = THREE.MathUtils.lerp(shipPos.x - 10, -34, 0.58 + smoothU * 0.24);
        const lookY = THREE.MathUtils.lerp(shipPos.y + 1.6, 2.8, 0.58 + smoothU * 0.24);
        const lookZ = THREE.MathUtils.lerp(shipPos.z - 8, -46, 0.58 + smoothU * 0.24);
        camera.lookAt(lookX, lookY, lookZ);
      }

      // Keep Gargantua Black Hole perfectly aligned with the camera so its gravitational lensing halo
      // and foreground equatorial disk bridge are 100% symmetrical without perspective skew!
      blackHoleGroup.lookAt(camera.position);
      blackHoleGroup.rotateZ(-0.14);

      renderer.render(scene, camera);
      afterDraw(tick);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
      pmremGenerator.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  const handleSkipToMenu = () => {
    sound.playClick();
    updatePhase('menu');
  };

  const handleReplayCutscene = () => {
    sound.playClick();
    startTimeRef.current = performance.now();
    warpTriggeredRef.current = false;
    impactTriggeredRef.current = false;
    pullSoundTriggeredRef.current = false;
    updatePhase('warp');
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#010308] overflow-hidden select-none font-mono text-slate-100">
      {/* Full-Viewport 3D WebGL Scene */}
      <div ref={mountRef} className="absolute inset-0 w-full h-full" />

      {/* Top Cinematic Telemetry Bar */}
      <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between px-6 py-4 pointer-events-none bg-gradient-to-b from-black/80 via-black/35 to-transparent">
        <div className="flex items-center gap-3">
          <span
            className={`w-2.5 h-2.5 rounded-full animate-pulse ${
              phase === 'warp' || phase === 'asteroids'
                ? 'bg-cyan-400 shadow-[0_0_12px_#22d3ee]'
                : 'bg-red-500 shadow-[0_0_12px_#ef4444]'
            }`}
          />
          <div className="text-xs tracking-[0.22em] uppercase text-slate-300">
            КРЕЙСЕР «ГИПЕРИОН» //{' '}
            {phase === 'warp' && (
              <span className="text-cyan-400 font-bold">ФАЗА 1: ГИПЕРПРОСТРАНСТВЕННЫЙ ВАРП-ПРЫЖОК</span>
            )}
            {phase === 'asteroids' && (
              <span className="text-amber-400 font-bold">
                ФАЗА 2: ПОЯС АСТЕРОИДОВ — МАНЕВРЫ УКЛОНЕНИЯ
              </span>
            )}
            {phase === 'impact' && (
              <span className="text-red-500 font-bold">
                ФАЗА 3: СТОЛКНОВЕНИЕ С АСТЕРОИДОМ — ОТКАЗ МАРШЕВЫХ ДВИГАТЕЛЕЙ!
              </span>
            )}
            {(phase === 'blackhole' || phase === 'menu') && (
              <span className="text-orange-400 font-bold">
                ФАЗА 4: ПОТЕРЯ ХОДА — ГРАВИТАЦИОННЫЙ ЗАХВАТ ЧЁРНОЙ ДЫРОЙ
              </span>
            )}
          </div>
        </div>

        <div className="pointer-events-auto flex items-center gap-2.5">
          {phase !== 'menu' ? (
            <button
              onClick={handleSkipToMenu}
              className="px-4 py-1.5 text-xs tracking-[0.18em] uppercase bg-slate-950/90 hover:bg-slate-900 text-cyan-300 border border-cyan-500/40 rounded transition-colors cursor-pointer"
            >
              Пропустить заставку →
            </button>
          ) : (
            <button
              onClick={handleReplayCutscene}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs tracking-[0.15em] uppercase bg-slate-950/90 hover:bg-slate-900 text-slate-300 border border-slate-700 rounded transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Повторить сцену
            </button>
          )}
        </div>
      </div>

      {/* Live Narrative Subtitles during the 4-Act Cutscene */}
      {phase !== 'menu' && (
        <div className="absolute bottom-9 inset-x-0 z-20 flex flex-col items-center px-6 pointer-events-none">
          <div className="max-w-2xl w-full bg-[#050811]/90 border border-slate-800/90 rounded-lg px-6 py-4 text-center shadow-2xl">
            {phase === 'warp' && (
              <>
                <div className="text-[11px] text-cyan-400 tracking-[0.26em] uppercase mb-1 font-bold">
                  ВАРП-ПЕРЕХОД // ВЫХОД ИЗ ГИПЕРПРОСТРАНСТВА
                </div>
                <p className="text-sm text-slate-200">
                  Ударный крейсер «Гиперион» совершает варп-прыжок в неизведанном секторе... Прямо по курсу — плотный пояс астероидов!
                </p>
              </>
            )}
            {phase === 'asteroids' && (
              <>
                <div className="text-[11px] text-amber-400 tracking-[0.26em] uppercase mb-1 font-bold">
                  УГРОЗА СТОЛКНОВЕНИЯ // АВТОПИЛОТ УКЛОНЕНИЯ
                </div>
                <p className="text-sm text-slate-200">
                  Корабль на полном ходу уворачивается от гигантских каменных глыб, закладывая крутые виражи...
                </p>
              </>
            )}
            {phase === 'impact' && (
              <>
                <div className="text-[11px] text-red-500 tracking-[0.26em] uppercase mb-1 font-bold animate-pulse">
                  КРИТИЧЕСКИЙ УДАР // ЛЕВАЯ ВАРП-ГОНДОЛА И ДВИГАТЕЛИ РАЗРУШЕНЫ!
                </div>
                <p className="text-sm text-slate-200">
                  Один из астероидов настигает корабль! Маршевые двигатели заглохли — «Гиперион» больше не может двигаться самостоятельно.
                </p>
              </>
            )}
            {phase === 'blackhole' && (
              <>
                <div className="text-[11px] text-orange-400 tracking-[0.26em] uppercase mb-1 font-bold">
                  ГРАВИТАЦИОННАЯ ЛОВУШКА // ГОРИЗОНТ СОБЫТИЙ «ГАРГАНТЮА»
                </div>
                <p className="text-sm text-slate-200">
                  Обездвиженный крейсер постепенно затягивает в гравитационный колодец сверхмассивной чёрной дыры. Инженер Даниил должен перезапустить ядро!
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Smooth Fade-In Difficulty Selection Dock */}
      {phase === 'menu' && (
        <div
          className={`absolute bottom-0 inset-x-0 z-30 flex justify-center p-4 sm:p-6 bg-gradient-to-t from-black via-black/90 to-transparent transition-all duration-1000 ease-out ${
            menuFadeIn
              ? 'opacity-100 translate-y-0 scale-100'
              : 'opacity-0 translate-y-8 scale-[0.98]'
          }`}
        >
          <div className="w-full max-w-2xl bg-[#060a12]/95 border border-slate-800 rounded-xl p-5 sm:p-6 shadow-[0_0_50px_rgba(0,0,0,0.95)]">
            <div className="px-3.5 py-2.5 rounded-lg bg-cyan-950/60 border border-cyan-500/40 text-xs text-cyan-200 mb-4 text-center">
              <span className="font-bold text-cyan-400">ВАЖНО:</span> Выбранный уровень сложности{' '}
              <span className="underline decoration-cyan-400/60 font-semibold text-white">
                не влияет на результат прохождения
              </span>{' '}
              и концовку миссии.
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* NORMAL / ИЗИ */}
              <button
                type="button"
                onClick={() => {
                  sound.playClick();
                  onSelect('normal');
                }}
                className="flex items-center justify-center gap-2 py-4 px-5 rounded-lg border bg-emerald-950/45 border-emerald-500/60 hover:border-emerald-400 hover:bg-emerald-950/70 shadow-[0_0_20px_rgba(16,185,129,0.18)] transition-all cursor-pointer group"
              >
                <Shield className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-bold tracking-wider uppercase text-emerald-400">
                  Изи
                </span>
              </button>

              {/* HARD / ДЛЯ МАЛЬЧИКОВ */}
              <button
                type="button"
                onClick={() => {
                  sound.playClick();
                  onSelect('hard');
                }}
                className="flex items-center justify-center gap-2 py-4 px-5 rounded-lg border bg-orange-950/45 border-orange-500/60 hover:border-orange-400 hover:bg-orange-950/70 shadow-[0_0_20px_rgba(251,146,60,0.18)] transition-all cursor-pointer group"
              >
                <Flame className="w-4 h-4 text-orange-400" />
                <span className="text-sm font-bold tracking-wider uppercase text-orange-400">
                  Для мальчиков
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
