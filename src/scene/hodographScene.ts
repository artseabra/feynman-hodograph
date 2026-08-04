import * as THREE from 'three';
import type { CameraFocus, CameraView, OrbitalState, Point3, SceneBounds, ThemePalette } from '../types';
import {
  activeWedgeIndex,
  correspondenceBridge,
  hodographGridFrame,
  hodographWorld,
  orbitGridFrame,
  orbitWorld,
  sceneLayout,
} from '../model/embedding';
import { equalTimeSamples, hodographCircle, orbitalState, TAU } from '../model/orbit';
import { computeInstrumentBounds } from '../model/bounds';
import { CameraGestureController, CameraRig } from './cameraRig';

const SEGMENTS = 192;

interface ConstructionParameters {
  eccentricity: number;
  wedges: number;
}

function vector(point: Point3): THREE.Vector3 {
  return new THREE.Vector3(point.x, point.y, point.z);
}

function lineGeometry(points: THREE.Vector3[]): THREE.BufferGeometry {
  return new THREE.BufferGeometry().setFromPoints(points);
}

function color(value: string): THREE.Color {
  return new THREE.Color(value);
}

function materialsOf(object: THREE.Object3D): THREE.Material[] {
  const candidate = object as THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>;
  if (!candidate.material) return [];
  return Array.isArray(candidate.material) ? candidate.material : [candidate.material];
}

function disposeObject(object: THREE.Object3D): void {
  object.traverse(child => {
    const candidate = child as THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>;
    candidate.geometry?.dispose();
    materialsOf(child).forEach(material => material.dispose());
  });
}

function setOpacity(material: THREE.Material, opacity: number): void {
  material.transparent = true;
  material.opacity = opacity;
  material.needsUpdate = true;
}

function makeTube(
  points: THREE.Vector3[],
  radius: number,
  material: THREE.Material,
  closed = false,
): THREE.Mesh<THREE.TubeGeometry, THREE.Material> {
  const curve = new THREE.CatmullRomCurve3(points, closed, 'centripetal');
  const geometry = new THREE.TubeGeometry(curve, Math.max(12, points.length * 2), radius, 7, closed);
  return new THREE.Mesh(geometry, material);
}

function makeWedgePrism(
  focus: THREE.Vector3,
  start: THREE.Vector3,
  end: THREE.Vector3,
  material: THREE.Material,
): THREE.Mesh<THREE.BufferGeometry, THREE.Material> {
  const thickness = 0.055;
  const lower = [focus, start, end].map(point => point.clone().add(new THREE.Vector3(0, -thickness, 0)));
  const upper = [focus, start, end].map(point => point.clone().add(new THREE.Vector3(0, thickness, 0)));
  const geometry = new THREE.BufferGeometry().setFromPoints([...lower, ...upper]);
  geometry.setIndex([
    0, 2, 1,
    3, 4, 5,
    0, 1, 4, 0, 4, 3,
    1, 2, 5, 1, 5, 4,
    2, 0, 3, 2, 3, 5,
  ]);
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
}

export class HodographScene {
  readonly canvas: HTMLCanvasElement;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(42, 1, 0.05, 200);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly rig = new CameraRig();
  private readonly gestureController: CameraGestureController;
  private readonly construction = new THREE.Group();
  private readonly live = new THREE.Group();
  private readonly planet: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  private readonly planetGlow: THREE.PointLight;
  private readonly sun: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  private readonly sunOutline: THREE.LineLoop<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private readonly hodographPoint: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  private readonly hodographCenter: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  private readonly positionArrow: THREE.ArrowHelper;
  private readonly velocityArrow: THREE.ArrowHelper;
  private readonly phaseBridge: THREE.Line<THREE.BufferGeometry, THREE.LineDashedMaterial>;
  private palette: ThemePalette;
  private parameters: ConstructionParameters;
  private latestState: OrbitalState;
  private bounds: SceneBounds;
  private cameraFocus: CameraFocus = 'free';
  private lastTimestamp = performance.now();
  private activeWedge = -1;
  private wedgeMaterials: THREE.MeshStandardMaterial[] = [];
  private velocityStepMaterials: THREE.MeshStandardMaterial[] = [];
  private velocityMarkerMaterials: THREE.MeshStandardMaterial[] = [];

  constructor(container: HTMLElement, parameters: ConstructionParameters, palette: ThemePalette) {
    this.parameters = parameters;
    this.palette = palette;
    this.latestState = orbitalState(parameters.eccentricity, 0);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.03;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(color(palette.background), 0);
    this.canvas = this.renderer.domElement;
    this.canvas.setAttribute('aria-label', 'Interactive spatial hodograph construction');
    container.replaceChildren(this.canvas);

    this.scene.add(this.construction, this.live);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x132231, 1.15));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.1);
    keyLight.position.set(-5, 8, 7);
    keyLight.castShadow = true;
    this.scene.add(keyLight);
    const fillLight = new THREE.PointLight(palette.hodograph, 1.2, 13);
    fillLight.position.set(2.8, 3.8, -3.2);
    this.scene.add(fillLight);

    const sphereGeometry = new THREE.SphereGeometry(0.155, 30, 30);
    this.planet = new THREE.Mesh(sphereGeometry, new THREE.MeshStandardMaterial({ color: palette.orbit, roughness: 0.27, metalness: 0.18 }));
    this.planet.castShadow = true;
    this.planetGlow = new THREE.PointLight(palette.orbit, 1.65, 4.5);
    this.planet.add(this.planetGlow);
    this.sun = new THREE.Mesh(
      new THREE.SphereGeometry(0.23, 32, 32),
      new THREE.MeshStandardMaterial({ color: palette.sun, emissive: palette.sun, emissiveIntensity: 0.8, roughness: 0.35 }),
    );
    this.sun.castShadow = true;
    this.sunOutline = new THREE.LineLoop(
      lineGeometry(Array.from({ length: 96 }, (_, index) => {
        const angle = index / 96 * TAU;
        return new THREE.Vector3(Math.cos(angle) * 0.23, Math.sin(angle) * 0.23, 0);
      })),
      new THREE.LineBasicMaterial({
        color: palette.sun,
        transparent: true,
        opacity: 0.52,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.sunOutline.visible = false;
    this.sunOutline.renderOrder = 20;
    this.hodographPoint = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 28, 28),
      new THREE.MeshStandardMaterial({ color: palette.hodograph, roughness: 0.2, metalness: 0.24 }),
    );
    this.hodographCenter = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 22, 22),
      new THREE.MeshStandardMaterial({ color: palette.vector, emissive: palette.vector, emissiveIntensity: 0.25, roughness: 0.3 }),
    );
    this.positionArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1, color(palette.orbit), 0.22, 0.09);
    this.velocityArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1, color(palette.vector), 0.2, 0.08);
    this.phaseBridge = new THREE.Line(
      lineGeometry([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineDashedMaterial({ color: palette.construction, dashSize: 0.13, gapSize: 0.08, transparent: true, opacity: 0.52 }),
    );
    this.live.add(
      this.planet,
      this.sun,
      this.sunOutline,
      this.hodographPoint,
      this.hodographCenter,
      this.positionArrow,
      this.velocityArrow,
      this.phaseBridge,
    );

    this.gestureController = new CameraGestureController(this.canvas, this.rig, this.camera, () => {
      this.canvas.dataset.interacting = 'true';
      this.canvas.dispatchEvent(new CustomEvent('hodograph:interact', { bubbles: true }));
    });

    this.bounds = computeInstrumentBounds(parameters.eccentricity, parameters.wedges);
    this.rebuildConstruction();
    this.applyOrbitalState(this.latestState);
  }

  setParameters(parameters: ConstructionParameters): void {
    this.parameters = parameters;
    this.latestState = orbitalState(parameters.eccentricity, this.latestState.meanAnomaly);
    this.bounds = computeInstrumentBounds(parameters.eccentricity, parameters.wedges);
    this.rebuildConstruction();
    this.applyOrbitalState(this.latestState);
  }

  setPalette(palette: ThemePalette): void {
    this.palette = palette;
    this.renderer.setClearColor(color(palette.background), 0);
    this.rebuildConstruction();
    this.planet.material.color.set(palette.orbit);
    this.planetGlow.color.set(palette.orbit);
    this.sun.material.color.set(palette.sun);
    this.sun.material.emissive.set(palette.sun);
    this.sunOutline.material.color.set(palette.sun);
    this.hodographPoint.material.color.set(palette.hodograph);
    this.hodographCenter.material.color.set(palette.vector);
    this.hodographCenter.material.emissive.set(palette.vector);
    this.positionArrow.setColor(color(palette.orbit));
    this.velocityArrow.setColor(color(palette.vector));
    this.phaseBridge.material.color.set(palette.construction);
  }

  setView(view: CameraView): void {
    this.rig.setView(view);
    this.rig.fit(this.bounds, this.camera, this.camera.aspect);
  }

  frameAll(): void {
    this.rig.frameAll();
    this.rig.fit(this.bounds, this.camera, this.camera.aspect);
  }

  setCameraFocus(focus: CameraFocus): void {
    this.cameraFocus = focus;
    // A first-person camera should not render the solid body that contains
    // it. Keep only a hollow, camera-facing silhouette when the visitor turns
    // back toward the Sun; the scene remains visible through its centre.
    this.sun.visible = focus !== 'sun';
    this.sunOutline.visible = focus === 'sun';
    if (focus === 'free') {
      this.rig.releaseFollow();
      return;
    }
    if (focus === 'sun') {
      const anchor = vector(orbitWorld({ x: 0, y: 0 }, 0.18));
      const planet = vector(orbitWorld(this.latestState.position, 0.17));
      this.rig.beginPointOfView(
        anchor,
        planet,
      );
      return;
    }
    const target = focus === 'planet'
      ? vector(orbitWorld(this.latestState.position, 0.17))
      : vector(hodographWorld(this.latestState.velocity, 0.2));
    this.rig.beginFollow(
      target,
      focus === 'planet' ? 4.7 : 4.15,
      focus === 'planet'
        ? { yaw: -0.76, pitch: 0.23 }
        : { yaw: 0.96, pitch: 0.17 },
    );
  }

  setExploring(exploring: boolean): void {
    this.gestureController.setExploring(exploring);
  }

  resize(width: number, height: number): void {
    const safeWidth = Math.max(1, width);
    const safeHeight = Math.max(1, height);
    this.camera.aspect = safeWidth / safeHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(safeWidth, safeHeight, false);
    this.rig.fit(this.bounds, this.camera, this.camera.aspect);
  }

  update(state: OrbitalState, timestamp: number): void {
    const deltaSeconds = Math.min(0.08, Math.max(0, (timestamp - this.lastTimestamp) / 1000));
    this.lastTimestamp = timestamp;
    this.latestState = state;

    const { position, focus, velocity } = this.applyOrbitalState(state);
    if (this.cameraFocus === 'sun') this.rig.trackPointOfView(focus, position);
    if (this.cameraFocus === 'planet') this.rig.trackFollow(position);
    if (this.cameraFocus === 'hodograph') this.rig.trackFollow(velocity);
    this.rig.update(this.camera, deltaSeconds);
    if (this.sunOutline.visible) this.sunOutline.quaternion.copy(this.camera.quaternion);
    this.renderer.render(this.scene, this.camera);
  }

  private applyOrbitalState(state: OrbitalState): {
    position: THREE.Vector3;
    focus: THREE.Vector3;
    velocity: THREE.Vector3;
  } {

    const position = vector(orbitWorld(state.position, 0.17));
    const focus = vector(orbitWorld({ x: 0, y: 0 }, 0.18));
    const circle = hodographCircle(state.eccentricity);
    const center = vector(hodographWorld(circle.center, 0.17));
    const velocity = vector(hodographWorld(state.velocity, 0.2));
    const bridge = correspondenceBridge(state).map(vector);

    this.planet.position.copy(position);
    this.sun.position.copy(focus);
    this.sunOutline.position.copy(focus);
    this.hodographPoint.position.copy(velocity);
    this.hodographCenter.position.copy(center);
    this.updateArrow(this.positionArrow, focus, position);
    this.updateArrow(this.velocityArrow, center, velocity);
    this.updateBridge(bridge);
    this.updateActiveConstruction(activeWedgeIndex(state.meanAnomaly, this.parameters.wedges));
    return { position, focus, velocity };
  }

  destroy(): void {
    this.gestureController.destroy();
    disposeObject(this.construction);
    disposeObject(this.live);
    this.renderer.dispose();
  }

  private rebuildConstruction(): void {
    disposeObject(this.construction);
    this.construction.clear();
    this.wedgeMaterials = [];
    this.velocityStepMaterials = [];
    this.velocityMarkerMaterials = [];
    this.activeWedge = -1;

    const { eccentricity, wedges } = this.parameters;
    const samples = equalTimeSamples(eccentricity, wedges);
    this.addOrbitSpace(samples, eccentricity);
    this.addVelocitySpace(samples, eccentricity);
    this.rig.fit(this.bounds, this.camera, this.camera.aspect);
  }

  private addOrbitSpace(samples: ReturnType<typeof equalTimeSamples>, eccentricity: number): void {
    const gridFrame = orbitGridFrame(eccentricity);
    const grid = new THREE.GridHelper(
      gridFrame.extent * 2 * sceneLayout.orbitScale,
      12,
      color(this.palette.grid),
      color(this.palette.grid),
    );
    const gridOrigin = orbitWorld(gridFrame.center, -0.12);
    grid.position.set(gridOrigin.x, gridOrigin.y, gridOrigin.z);
    materialsOf(grid).forEach(material => setOpacity(material, 0.25));
    this.construction.add(grid);

    const orbitPoints = Array.from({ length: SEGMENTS }, (_, index) => {
      const state = orbitalState(eccentricity, index / SEGMENTS * TAU);
      return vector(orbitWorld(state.position, 0.01));
    });
    const orbitMaterial = new THREE.MeshStandardMaterial({ color: this.palette.orbit, roughness: 0.32, metalness: 0.18 });
    this.construction.add(makeTube(orbitPoints, 0.036, orbitMaterial, true));

    const referenceCircle = Array.from({ length: SEGMENTS }, (_, index) => {
      const angle = index / SEGMENTS * TAU;
      return vector(orbitWorld({ x: Math.cos(angle) - eccentricity, y: Math.sin(angle) }, -0.015));
    });
    const referenceMaterial = new THREE.MeshStandardMaterial({ color: this.palette.construction, transparent: true, opacity: 0.38, roughness: 0.45, metalness: 0.05 });
    this.construction.add(makeTube(referenceCircle, 0.014, referenceMaterial, true));

    samples.forEach((sample, index) => {
      const next = samples[(index + 1) % samples.length];
      const focus = vector(orbitWorld({ x: 0, y: 0 }));
      const start = vector(orbitWorld(sample.position));
      const end = vector(orbitWorld(next.position));
      const material = new THREE.MeshStandardMaterial({
        color: this.palette.wedge,
        transparent: true,
        opacity: 0.09,
        side: THREE.DoubleSide,
        depthWrite: false,
        roughness: 0.28,
        metalness: 0.08,
      });
      this.wedgeMaterials.push(material);
      this.construction.add(makeWedgePrism(focus, start, end, material));
      this.construction.add(new THREE.Line(
        lineGeometry([focus.clone().add(new THREE.Vector3(0, 0.012, 0)), start.clone().add(new THREE.Vector3(0, 0.012, 0))]),
        new THREE.LineBasicMaterial({ color: this.palette.orbit, transparent: true, opacity: 0.34 }),
      ));
    });
  }

  private addVelocitySpace(samples: ReturnType<typeof equalTimeSamples>, eccentricity: number): void {
    const circle = hodographCircle(eccentricity);
    const gridFrame = hodographGridFrame(eccentricity);
    const grid = new THREE.GridHelper(gridFrame.extent * 2 * sceneLayout.hodographScale, 12, color(this.palette.grid), color(this.palette.grid));
    grid.rotation.x = Math.PI / 2;
    const gridOrigin = hodographWorld(gridFrame.center, -0.14);
    grid.position.set(gridOrigin.x, gridOrigin.y, gridOrigin.z);
    materialsOf(grid).forEach(material => setOpacity(material, 0.28));
    this.construction.add(grid);

    const circlePoints = Array.from({ length: SEGMENTS }, (_, index) => {
      const angle = index / SEGMENTS * TAU;
      return vector(hodographWorld({
        x: circle.center.x + Math.cos(angle) * circle.radius,
        y: circle.center.y + Math.sin(angle) * circle.radius,
      }, -0.01));
    });
    const circleMaterial = new THREE.MeshStandardMaterial({ color: this.palette.hodograph, transparent: true, opacity: 0.42, roughness: 0.3, metalness: 0.18 });
    this.construction.add(makeTube(circlePoints, 0.025, circleMaterial, true));

    const origin = vector(hodographWorld({ x: 0, y: 0 }));
    const center = vector(hodographWorld(circle.center));
    const offsetMaterial = new THREE.MeshStandardMaterial({ color: this.palette.vector, transparent: true, opacity: 0.68, roughness: 0.35, metalness: 0.08 });
    this.construction.add(makeTube([origin, center], 0.018, offsetMaterial));

    samples.forEach((sample, index) => {
      const next = samples[(index + 1) % samples.length];
      const start = vector(hodographWorld(sample.velocity, 0.025));
      const end = vector(hodographWorld(next.velocity, 0.025));
      const direction = end.clone().sub(start);
      const length = direction.length();
      const material = new THREE.MeshStandardMaterial({ color: this.palette.hodograph, transparent: true, opacity: 0.35, roughness: 0.22, metalness: 0.3 });
      this.velocityStepMaterials.push(material);
      if (length > 0.0001) {
        this.construction.add(makeTube([start, end], 0.021, material));
        const headLength = Math.min(0.16, length * 0.45);
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.054, headLength, 10), material);
        cone.position.copy(end).addScaledVector(direction.normalize(), -headLength / 2);
        cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
        this.construction.add(cone);
      }
      const markerMaterial = new THREE.MeshStandardMaterial({ color: this.palette.hodograph, transparent: true, opacity: 0.62, roughness: 0.25, metalness: 0.18 });
      this.velocityMarkerMaterials.push(markerMaterial);
      const marker = new THREE.Mesh(new THREE.SphereGeometry(0.046, 16, 16), markerMaterial);
      marker.position.copy(start);
      this.construction.add(marker);
    });
  }

  private updateArrow(arrow: THREE.ArrowHelper, start: THREE.Vector3, end: THREE.Vector3): void {
    const direction = end.clone().sub(start);
    const length = direction.length();
    arrow.visible = length > 0.0001;
    if (!arrow.visible) return;
    arrow.position.copy(start);
    arrow.setDirection(direction.normalize());
    arrow.setLength(length, Math.min(0.24, length * 0.22), Math.min(0.1, length * 0.1));
  }

  private updateBridge(points: THREE.Vector3[]): void {
    const positions = this.phaseBridge.geometry.getAttribute('position') as THREE.BufferAttribute;
    points.forEach((point, index) => positions.setXYZ(index, point.x, point.y, point.z));
    positions.needsUpdate = true;
    this.phaseBridge.geometry.computeBoundingSphere();
    this.phaseBridge.computeLineDistances();
  }

  private updateActiveConstruction(nextIndex: number): void {
    if (nextIndex === this.activeWedge) return;
    this.activeWedge = nextIndex;
    this.wedgeMaterials.forEach((material, index) => {
      setOpacity(material, index === nextIndex ? 0.4 : 0.075);
      material.emissive.set(index === nextIndex ? this.palette.wedge : '#000000');
      material.emissiveIntensity = index === nextIndex ? 0.16 : 0;
    });
    this.velocityStepMaterials.forEach((material, index) => {
      setOpacity(material, index === nextIndex ? 1 : 0.28);
      material.emissive.set(index === nextIndex ? this.palette.hodograph : '#000000');
      material.emissiveIntensity = index === nextIndex ? 0.3 : 0;
    });
    this.velocityMarkerMaterials.forEach((material, index) => {
      setOpacity(material, index === nextIndex ? 1 : 0.48);
      material.emissive.set(index === nextIndex ? this.palette.hodograph : '#000000');
      material.emissiveIntensity = index === nextIndex ? 0.34 : 0;
    });
  }
}
