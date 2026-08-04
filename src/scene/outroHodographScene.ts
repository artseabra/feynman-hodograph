import * as THREE from 'three';
import type { OrbitalState, Point3, ThemePalette } from '../types';
import { correspondenceBridge, hodographWorld, orbitWorld } from '../model/embedding';
import { hodographCircle, orbitalState, TAU } from '../model/orbit';

const CURVE_SEGMENTS = 144;

function vector(point: Point3): THREE.Vector3 {
  return new THREE.Vector3(point.x, point.y, point.z);
}

function staticLoop(material: THREE.LineBasicMaterial): THREE.LineLoop {
  return new THREE.LineLoop(new THREE.BufferGeometry(), material);
}

function dynamicLine(pointCount: number, material: THREE.LineBasicMaterial | THREE.LineDashedMaterial): THREE.Line {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pointCount * 3), 3));
  return new THREE.Line(geometry, material);
}

function updateDynamicLine(line: THREE.Line, points: THREE.Vector3[]): void {
  const positions = line.geometry.getAttribute('position') as THREE.BufferAttribute;
  points.forEach((point, index) => positions.setXYZ(index, point.x, point.y, point.z));
  positions.needsUpdate = true;
  line.geometry.computeBoundingSphere();
}

function disposeObject(object: THREE.Object3D): void {
  object.traverse(child => {
    const renderable = child as THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>;
    renderable.geometry?.dispose();
    if (!renderable.material) return;
    const materials = Array.isArray(renderable.material) ? renderable.material : [renderable.material];
    materials.forEach(material => material.dispose());
  });
}

export class OutroHodographScene {
  readonly canvas: HTMLCanvasElement;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly construction = new THREE.Group();
  private readonly live = new THREE.Group();
  private readonly orbitMaterial = new THREE.LineBasicMaterial();
  private readonly hodographMaterial = new THREE.LineBasicMaterial();
  private readonly radiusMaterial = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.72 });
  private readonly velocityMaterial = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.84 });
  private readonly vectorMaterial = new THREE.LineBasicMaterial();
  private readonly bridgeMaterial = new THREE.LineDashedMaterial({ dashSize: 0.12, gapSize: 0.1, transparent: true, opacity: 0.72 });
  private readonly orbit = staticLoop(this.orbitMaterial);
  private readonly hodograph = staticLoop(this.hodographMaterial);
  private readonly positionRadius = dynamicLine(2, this.radiusMaterial);
  private readonly velocityVector = dynamicLine(2, this.velocityMaterial);
  private readonly hodographRadius = dynamicLine(2, this.vectorMaterial);
  private readonly bridge = dynamicLine(4, this.bridgeMaterial);
  private readonly orbitGrid = new THREE.GridHelper(7.2, 14);
  private readonly velocityGrid = new THREE.GridHelper(5.2, 12);
  private readonly orbitPlaneMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true, opacity: 0.025, depthWrite: false });
  private readonly velocityPlaneMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true, opacity: 0.025, depthWrite: false });
  private readonly planetMaterial = new THREE.MeshStandardMaterial({ roughness: 0.28, metalness: 0.16 });
  private readonly sunMaterial = new THREE.MeshStandardMaterial({ roughness: 0.32, metalness: 0.04 });
  private readonly velocityPointMaterial = new THREE.MeshStandardMaterial({ roughness: 0.24, metalness: 0.18 });
  private readonly centerMaterial = new THREE.MeshBasicMaterial();
  private readonly originMaterial = new THREE.MeshBasicMaterial();
  private readonly planet = new THREE.Mesh(new THREE.SphereGeometry(0.145, 20, 20), this.planetMaterial);
  private readonly sun = new THREE.Mesh(new THREE.SphereGeometry(0.205, 22, 22), this.sunMaterial);
  private readonly velocityPoint = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 20), this.velocityPointMaterial);
  private readonly hodographCenter = new THREE.Mesh(new THREE.SphereGeometry(0.065, 16, 16), this.centerMaterial);
  private readonly velocityOrigin = new THREE.Mesh(new THREE.SphereGeometry(0.052, 14, 14), this.originMaterial);
  private eccentricity = Number.NaN;
  private active = false;

  constructor(container: HTMLElement, palette: ThemePalette) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.setClearColor(new THREE.Color(palette.background), 0);
    this.canvas = this.renderer.domElement;
    this.canvas.setAttribute('aria-hidden', 'true');
    container.prepend(this.canvas);

    const orbitPlane = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 7.2), this.orbitPlaneMaterial);
    orbitPlane.rotation.x = -Math.PI / 2;
    orbitPlane.position.y = -0.035;
    this.orbitGrid.position.y = -0.03;

    const velocityPlane = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 5.2), this.velocityPlaneMaterial);
    velocityPlane.position.z = -0.035;
    this.velocityGrid.rotation.x = Math.PI / 2;
    this.velocityGrid.position.z = -0.03;

    this.construction.add(orbitPlane, this.orbitGrid, velocityPlane, this.velocityGrid, this.orbit, this.hodograph);
    this.live.add(
      this.positionRadius,
      this.velocityVector,
      this.hodographRadius,
      this.bridge,
      this.planet,
      this.sun,
      this.velocityPoint,
      this.hodographCenter,
      this.velocityOrigin,
    );
    this.scene.add(this.construction, this.live);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x22313b, 1.45));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(-4, 7, 6);
    this.scene.add(key);
    const blueFill = new THREE.PointLight(palette.hodograph, 1.1, 11);
    blueFill.position.set(2.2, 3.4, 2.7);
    this.scene.add(blueFill);

    this.orbit.renderOrder = 4;
    this.hodograph.renderOrder = 4;
    this.bridge.renderOrder = 8;
    this.setPalette(palette);
    this.rebuildConstruction(0.55);
  }

  setActive(active: boolean): void {
    this.active = active;
  }

  setPalette(palette: ThemePalette): void {
    this.renderer.setClearColor(new THREE.Color(palette.background), 0);
    this.orbitMaterial.color.set(palette.orbit);
    this.hodographMaterial.color.set(palette.hodograph);
    this.radiusMaterial.color.set(palette.orbit);
    this.velocityMaterial.color.set(palette.hodograph);
    this.vectorMaterial.color.set(palette.vector);
    this.bridgeMaterial.color.set(palette.ink);
    this.planetMaterial.color.set(palette.orbit);
    this.sunMaterial.color.set(palette.sun);
    this.sunMaterial.emissive.set(palette.sun);
    this.sunMaterial.emissiveIntensity = 0.55;
    this.velocityPointMaterial.color.set(palette.hodograph);
    this.centerMaterial.color.set(palette.vector);
    this.originMaterial.color.set(palette.ink);
    this.orbitPlaneMaterial.color.set(palette.orbit);
    this.velocityPlaneMaterial.color.set(palette.hodograph);
    [this.orbitGrid, this.velocityGrid].forEach(grid => {
      const materials = Array.isArray(grid.material) ? grid.material : [grid.material];
      materials.forEach(material => {
        const lineMaterial = material as THREE.LineBasicMaterial;
        lineMaterial.color.set(palette.grid);
        lineMaterial.transparent = true;
        lineMaterial.opacity = 0.23;
        lineMaterial.depthWrite = false;
      });
    });
  }

  resize(width: number, height: number): void {
    const safeWidth = Math.max(1, width);
    const safeHeight = Math.max(1, height);
    this.camera.aspect = safeWidth / safeHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(safeWidth, safeHeight, false);
  }

  update(state: OrbitalState, timestamp: number): void {
    if (!this.active) return;
    if (Math.abs(state.eccentricity - this.eccentricity) > 1e-6) this.rebuildConstruction(state.eccentricity);

    const position = vector(orbitWorld(state.position, state.eccentricity, 0.12));
    const focus = vector(orbitWorld({ x: 0, y: 0 }, state.eccentricity, 0.12));
    const circle = hodographCircle(state.eccentricity);
    const center = vector(hodographWorld(circle.center, state.eccentricity, 0.1));
    const origin = vector(hodographWorld({ x: 0, y: 0 }, state.eccentricity, 0.1));
    const velocity = vector(hodographWorld(state.velocity, state.eccentricity, 0.12));
    const bridgePoints = correspondenceBridge(state).map(vector);

    this.planet.position.copy(position);
    this.sun.position.copy(focus);
    this.velocityPoint.position.copy(velocity);
    this.hodographCenter.position.copy(center);
    this.velocityOrigin.position.copy(origin);
    updateDynamicLine(this.positionRadius, [focus, position]);
    updateDynamicLine(this.velocityVector, [origin, velocity]);
    updateDynamicLine(this.hodographRadius, [center, velocity]);
    updateDynamicLine(this.bridge, bridgePoints);
    this.bridge.computeLineDistances();
    this.bridgeMaterial.opacity = 0.62 + Math.sin(timestamp * 0.0022) * 0.1;

    const sweep = Math.sin(timestamp * 0.000085) * 0.09;
    const azimuth = 0.72 + sweep;
    this.camera.position.set(Math.cos(azimuth) * 8.3, 5.15, Math.sin(azimuth) * 8.3);
    this.camera.lookAt(0, 0.05, 0);
    this.renderer.render(this.scene, this.camera);
  }

  destroy(): void {
    disposeObject(this.construction);
    disposeObject(this.live);
    this.renderer.dispose();
    this.canvas.remove();
  }

  private rebuildConstruction(eccentricity: number): void {
    this.eccentricity = eccentricity;
    const orbitPoints = Array.from({ length: CURVE_SEGMENTS }, (_, index) => {
      const sample = orbitalState(eccentricity, index / CURVE_SEGMENTS * TAU);
      return vector(orbitWorld(sample.position, eccentricity, 0.035));
    });
    const circle = hodographCircle(eccentricity);
    const hodographPoints = Array.from({ length: CURVE_SEGMENTS }, (_, index) => {
      const angle = index / CURVE_SEGMENTS * TAU;
      return vector(hodographWorld({
        x: circle.center.x + circle.radius * Math.cos(angle),
        y: circle.center.y + circle.radius * Math.sin(angle),
      }, eccentricity, 0.035));
    });

    this.orbit.geometry.dispose();
    this.orbit.geometry = new THREE.BufferGeometry().setFromPoints(orbitPoints);
    this.hodograph.geometry.dispose();
    this.hodograph.geometry = new THREE.BufferGeometry().setFromPoints(hodographPoints);
  }
}
