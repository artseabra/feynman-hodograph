import * as THREE from 'three';
import type {
  CameraFocus,
  CameraView,
  ConstructionLayout,
  OrbitalState,
  Point2,
  Point3,
  SceneBounds,
  ThemePalette,
} from '../types';
import {
  activeWedgeIndex,
  correspondenceBridge,
  hodographDisplayScale,
  hodographGridFrame,
  hodographWorld,
  orbitGridFrame,
  orbitWorld,
  sceneLayout,
} from '../model/embedding';
import { equalTimeSamples, hodographCircle, orbitalState, TAU } from '../model/orbit';
import { computeInstrumentBounds } from '../model/bounds';
import { CameraGestureController, CameraRig } from './cameraRig';
import { CanvasTooltipController, type CanvasTooltipTarget } from './canvasTooltips';
import {
  auxiliaryCircleOpacity,
  hodographCenterGlyphScale,
  velocitySampleRadius,
  velocityStepGlyphMetrics,
} from './glyphSizing';

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

function makePickMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
    colorWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
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
  private readonly tooltipController: CanvasTooltipController;
  private readonly construction = new THREE.Group();
  private readonly live = new THREE.Group();
  private readonly planet: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  private readonly planetGlow: THREE.PointLight;
  private readonly sun: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  private readonly sunOutline: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private readonly hodographPoint: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  private readonly hodographCenter: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private readonly positionArrow: THREE.ArrowHelper;
  private readonly velocityArrow: THREE.ArrowHelper;
  private readonly phaseBridge: THREE.Line<THREE.BufferGeometry, THREE.LineDashedMaterial>;
  private palette: ThemePalette;
  private parameters: ConstructionParameters;
  private layout: ConstructionLayout = 'merged';
  private latestState: OrbitalState;
  private bounds: SceneBounds;
  private cameraView: CameraView | null = 'spatial';
  private cameraFocus: CameraFocus = 'free';
  private lastTimestamp = performance.now();
  private activeWedge = -1;
  private wedgeMaterials: THREE.MeshStandardMaterial[] = [];
  private velocityStepMaterials: THREE.MeshStandardMaterial[] = [];
  private velocityMarkerMaterials: THREE.MeshStandardMaterial[] = [];
  private tooltipTargets: CanvasTooltipTarget[] = [];

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
    this.canvas.setAttribute('aria-describedby', 'stage-instructions');
    this.canvas.tabIndex = 0;
    container.replaceChildren(this.canvas);
    this.tooltipController = new CanvasTooltipController(
      this.canvas,
      container.parentElement ?? container,
      this.camera,
      palette,
    );

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
    this.sunOutline = new THREE.Mesh(
      new THREE.RingGeometry(0.227, 0.23, 96),
      new THREE.MeshBasicMaterial({
        color: palette.sun,
        transparent: true,
        opacity: 0.68,
        side: THREE.DoubleSide,
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
      new THREE.RingGeometry(0.072, 0.105, 36),
      new THREE.MeshBasicMaterial({
        color: palette.vector,
        transparent: true,
        opacity: 0.96,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.hodographCenter.renderOrder = 20;
    this.hodographCenter.add(new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 12, 12),
      makePickMaterial(),
    ));
    this.positionArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1, color(palette.orbit), 0.22, 0.09);
    this.velocityArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1, color(palette.vector), 0.2, 0.08);
    this.phaseBridge = new THREE.Line(
      lineGeometry([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineDashedMaterial({
        color: palette.ink,
        dashSize: 0.17,
        gapSize: 0.105,
        transparent: true,
        opacity: 0.88,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.phaseBridge.renderOrder = 24;
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

    this.gestureController = new CameraGestureController(
      this.canvas,
      this.rig,
      this.camera,
      () => this.markCameraInteraction(),
    );

    this.bounds = computeInstrumentBounds(parameters.eccentricity, parameters.wedges, this.layout);
    this.rebuildConstruction();
    this.applyOrbitalState(this.latestState);
  }

  setParameters(parameters: ConstructionParameters): void {
    this.parameters = parameters;
    this.latestState = orbitalState(parameters.eccentricity, this.latestState.meanAnomaly);
    this.bounds = computeInstrumentBounds(parameters.eccentricity, parameters.wedges, this.layout);
    this.rebuildConstruction();
    this.applyOrbitalState(this.latestState);
  }

  setLayout(layout: ConstructionLayout): void {
    if (layout === this.layout) return;
    this.layout = layout;
    this.bounds = computeInstrumentBounds(
      this.parameters.eccentricity,
      this.parameters.wedges,
      this.layout,
    );
    this.rebuildConstruction();
    const { position, focus, velocity } = this.applyOrbitalState(this.latestState);
    if (this.cameraFocus === 'sun') this.rig.trackPointOfView(focus, position);
    if (this.cameraFocus === 'planet') this.rig.trackFollow(position);
    if (this.cameraFocus === 'hodograph') this.rig.trackFollow(velocity);
  }

  setPalette(palette: ThemePalette): void {
    this.palette = palette;
    this.tooltipController.setPalette(palette);
    this.renderer.setClearColor(color(palette.background), 0);
    this.rebuildConstruction();
    this.planet.material.color.set(palette.orbit);
    this.planetGlow.color.set(palette.orbit);
    this.sun.material.color.set(palette.sun);
    this.sun.material.emissive.set(palette.sun);
    this.sunOutline.material.color.set(palette.sun);
    this.hodographPoint.material.color.set(palette.hodograph);
    this.hodographCenter.material.color.set(palette.vector);
    this.positionArrow.setColor(color(palette.orbit));
    this.velocityArrow.setColor(color(palette.vector));
    this.phaseBridge.material.color.set(palette.ink);
  }

  setView(view: CameraView): void {
    this.cameraView = view;
    this.cameraFocus = 'free';
    this.sun.visible = true;
    this.sunOutline.visible = false;
    this.rig.setView(view, this.bounds, this.camera, this.camera.aspect, this.fixedViewTarget());
  }

  setCameraFocus(focus: CameraFocus): void {
    this.cameraView = null;
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
      const anchor = vector(this.embedOrbit({ x: 0, y: 0 }, this.latestState.eccentricity, 0.18));
      const planet = vector(this.embedOrbit(this.latestState.position, this.latestState.eccentricity, 0.17));
      this.rig.beginPointOfView(
        anchor,
        planet,
      );
      return;
    }
    const target = focus === 'planet'
      ? vector(this.embedOrbit(this.latestState.position, this.latestState.eccentricity, 0.17))
      : vector(this.embedHodograph(this.latestState.velocity, this.latestState.eccentricity, 0.2));
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

  nudgeCamera(action: 'orbit-left' | 'orbit-right' | 'orbit-up' | 'orbit-down' | 'pan-left' | 'pan-right' | 'pan-up' | 'pan-down'): void {
    const orbitStep = 28;
    const panStep = 24;
    switch (action) {
      case 'orbit-left': this.rig.orbit(-orbitStep, 0); break;
      case 'orbit-right': this.rig.orbit(orbitStep, 0); break;
      case 'orbit-up': this.rig.orbit(0, -orbitStep); break;
      case 'orbit-down': this.rig.orbit(0, orbitStep); break;
      case 'pan-left': this.rig.pan(-panStep, 0, this.camera); break;
      case 'pan-right': this.rig.pan(panStep, 0, this.camera); break;
      case 'pan-up': this.rig.pan(0, -panStep, this.camera); break;
      case 'pan-down': this.rig.pan(0, panStep, this.camera); break;
    }
    this.markCameraInteraction();
  }

  getCameraFraming(): number {
    return this.rig.getFraming();
  }

  setCameraFraming(value: number): number {
    const framing = this.rig.setFraming(value);
    this.markCameraInteraction();
    return framing;
  }

  adjustCameraFraming(delta: number): number {
    return this.setCameraFraming(this.rig.getFraming() + delta);
  }

  resize(width: number, height: number): void {
    const safeWidth = Math.max(1, width);
    const safeHeight = Math.max(1, height);
    this.camera.aspect = safeWidth / safeHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(safeWidth, safeHeight, false);
    this.refitFixedView();
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
    this.hodographCenter.quaternion.copy(this.camera.quaternion);
    this.camera.updateMatrixWorld();
    this.tooltipController.update();
    this.renderer.render(this.scene, this.camera);
  }

  private applyOrbitalState(state: OrbitalState): {
    position: THREE.Vector3;
    focus: THREE.Vector3;
    velocity: THREE.Vector3;
  } {

    const position = vector(this.embedOrbit(state.position, state.eccentricity, 0.17));
    const focus = vector(this.embedOrbit({ x: 0, y: 0 }, state.eccentricity, 0.18));
    const circle = hodographCircle(state.eccentricity);
    const center = vector(this.embedHodograph(circle.center, state.eccentricity, 0.17));
    const velocity = vector(this.embedHodograph(state.velocity, state.eccentricity, 0.2));
    const bridge = this.embedBridge(state).map(vector);

    this.planet.position.copy(position);
    this.sun.position.copy(focus);
    this.sunOutline.position.copy(focus);
    this.hodographPoint.position.copy(velocity);
    this.hodographCenter.position.copy(center);
    this.hodographCenter.scale.setScalar(
      this.layout === 'merged' ? hodographCenterGlyphScale(state.eccentricity) : 1,
    );
    this.updateArrow(this.positionArrow, focus, position);
    this.updateArrow(this.velocityArrow, center, velocity);
    this.updateBridge(bridge);
    this.updateActiveConstruction(activeWedgeIndex(state.meanAnomaly, this.parameters.wedges));
    return { position, focus, velocity };
  }

  destroy(): void {
    this.gestureController.destroy();
    this.tooltipController.destroy();
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
    this.tooltipTargets = [];
    this.activeWedge = -1;

    const { eccentricity, wedges } = this.parameters;
    const samples = equalTimeSamples(eccentricity, wedges);
    this.addOrbitSpace(samples, eccentricity);
    this.addVelocitySpace(samples, eccentricity);
    this.registerLiveTooltipTargets();
    this.tooltipController.setTargets(this.tooltipTargets);
    this.refitFixedView();
  }

  private refitFixedView(): void {
    if (!this.cameraView) return;
    this.rig.setView(
      this.cameraView,
      this.bounds,
      this.camera,
      this.camera.aspect,
      this.fixedViewTarget(),
    );
  }

  private fixedViewTarget(): Point3 {
    return this.layout === 'merged' ? { x: 0, y: 0, z: 0 } : this.bounds.center;
  }

  private embedOrbit(point: Point2, eccentricity: number, elevation = 0): Point3 {
    return orbitWorld(point, eccentricity, elevation, this.layout);
  }

  private embedHodograph(point: Point2, eccentricity: number, depth = 0): Point3 {
    return hodographWorld(point, eccentricity, depth, this.layout);
  }

  private embedBridge(state: OrbitalState): Point3[] {
    return correspondenceBridge(state, this.layout);
  }

  private addTooltipTarget(target: CanvasTooltipTarget): void {
    this.tooltipTargets.push(target);
  }

  private registerLiveTooltipTargets(): void {
    const worldPosition = (object: THREE.Object3D): THREE.Vector3 => object.getWorldPosition(new THREE.Vector3());
    const midpoint = (start: THREE.Object3D, end: THREE.Object3D): THREE.Vector3 => (
      worldPosition(start).add(worldPosition(end)).multiplyScalar(0.5)
    );

    this.addTooltipTarget({
      id: 'sun',
      objects: [this.sun, this.sunOutline],
      anchor: () => worldPosition(this.sun),
      priority: 8,
    });
    this.addTooltipTarget({
      id: 'planet',
      objects: [this.planet],
      anchor: () => worldPosition(this.planet),
      priority: 9,
    });
    this.addTooltipTarget({
      id: 'radius-vector',
      objects: [this.positionArrow],
      anchor: () => midpoint(this.sun, this.planet),
      priority: 7,
    });
    this.addTooltipTarget({
      id: 'hodograph-point',
      objects: [this.hodographPoint],
      anchor: () => worldPosition(this.hodographPoint),
      priority: 9,
    });
    this.addTooltipTarget({
      id: 'hodograph-radius',
      objects: [this.velocityArrow],
      anchor: () => midpoint(this.hodographCenter, this.hodographPoint),
      priority: 7,
    });
    this.addTooltipTarget({
      id: 'phase-bridge',
      objects: [this.phaseBridge],
      anchor: () => {
        const points = this.embedBridge(this.latestState).map(vector);
        return points[1].clone().add(points[2]).multiplyScalar(0.5);
      },
      priority: 6,
    });
  }

  private addOrbitSpace(samples: ReturnType<typeof equalTimeSamples>, eccentricity: number): void {
    const gridFrame = orbitGridFrame(eccentricity);
    const grid = new THREE.GridHelper(
      gridFrame.extent * 2 * sceneLayout.orbitScale,
      12,
      color(this.palette.grid),
      color(this.palette.grid),
    );
    const gridOrigin = this.embedOrbit(gridFrame.center, eccentricity, -0.12);
    grid.position.set(gridOrigin.x, gridOrigin.y, gridOrigin.z);
    const planePickProxy = new THREE.Mesh(
      new THREE.PlaneGeometry(gridFrame.extent * 2 * sceneLayout.orbitScale, gridFrame.extent * 2 * sceneLayout.orbitScale),
      makePickMaterial(),
    );
    planePickProxy.rotation.x = -Math.PI / 2;
    const planePickOrigin = this.embedOrbit(gridFrame.center, eccentricity);
    planePickProxy.position.set(planePickOrigin.x, planePickOrigin.y, planePickOrigin.z);
    materialsOf(grid).forEach(material => setOpacity(material, 0.25));
    this.construction.add(grid, planePickProxy);
    this.addTooltipTarget({
      id: 'orbital-plane',
      objects: [grid, planePickProxy],
      anchor: () => vector(this.embedOrbit(gridFrame.center, eccentricity, -0.12)),
      anchorAtIntersection: true,
      priority: 1,
    });

    const orbitPoints = Array.from({ length: SEGMENTS }, (_, index) => {
      const state = orbitalState(eccentricity, index / SEGMENTS * TAU);
      return vector(this.embedOrbit(state.position, eccentricity, 0.01));
    });
    const orbitMaterial = new THREE.MeshStandardMaterial({ color: this.palette.orbit, roughness: 0.32, metalness: 0.18 });
    const orbitTube = makeTube(orbitPoints, 0.036, orbitMaterial, true);
    const orbitPickProxy = makeTube(orbitPoints, 0.075, makePickMaterial(), true);
    this.construction.add(orbitTube, orbitPickProxy);
    this.addTooltipTarget({
      id: 'orbit',
      objects: [orbitTube, orbitPickProxy],
      anchor: () => orbitPoints[Math.floor(SEGMENTS / 2)].clone(),
      anchorAtIntersection: true,
      priority: 6,
    });

    const referenceOpacity = auxiliaryCircleOpacity(eccentricity);
    if (referenceOpacity > 0) {
      const referenceCircle = Array.from({ length: SEGMENTS }, (_, index) => {
        const angle = index / SEGMENTS * TAU;
        return vector(this.embedOrbit(
          { x: Math.cos(angle) - eccentricity, y: Math.sin(angle) },
          eccentricity,
          -0.055,
        ));
      });
      const referenceCircleLine = new THREE.LineLoop(
        lineGeometry(referenceCircle),
        new THREE.LineDashedMaterial({
          color: this.palette.construction,
          dashSize: 0.1,
          gapSize: 0.075,
          transparent: true,
          opacity: referenceOpacity,
          depthWrite: false,
        }),
      );
      referenceCircleLine.computeLineDistances();
      this.construction.add(referenceCircleLine);
      this.addTooltipTarget({
        id: 'reference-circle',
        objects: [referenceCircleLine],
        anchor: () => referenceCircle[Math.floor(SEGMENTS / 4)].clone(),
        anchorAtIntersection: true,
        priority: 5,
      });
    }
    const wedgeObjects: THREE.Object3D[] = [];
    samples.forEach((sample, index) => {
      const next = samples[(index + 1) % samples.length];
      const focus = vector(this.embedOrbit({ x: 0, y: 0 }, eccentricity));
      const start = vector(this.embedOrbit(sample.position, eccentricity));
      const end = vector(this.embedOrbit(next.position, eccentricity));
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
      const wedge = makeWedgePrism(focus, start, end, material);
      const radius = new THREE.Line(
        lineGeometry([focus.clone().add(new THREE.Vector3(0, 0.012, 0)), start.clone().add(new THREE.Vector3(0, 0.012, 0))]),
        new THREE.LineBasicMaterial({ color: this.palette.orbit, transparent: true, opacity: 0.34 }),
      );
      wedgeObjects.push(wedge, radius);
      this.construction.add(wedge, radius);
    });
    this.addTooltipTarget({
      id: 'equal-time-wedges',
      objects: wedgeObjects,
      anchor: () => {
        const index = Math.max(0, this.activeWedge) % samples.length;
        const start = vector(this.embedOrbit(samples[index].position, eccentricity));
        const end = vector(this.embedOrbit(samples[(index + 1) % samples.length].position, eccentricity));
        const focus = vector(this.embedOrbit({ x: 0, y: 0 }, eccentricity));
        return focus.add(start).add(end).multiplyScalar(1 / 3);
      },
      anchorAtIntersection: true,
      priority: 4,
    });
  }

  private addVelocitySpace(samples: ReturnType<typeof equalTimeSamples>, eccentricity: number): void {
    const circle = hodographCircle(eccentricity);
    const gridFrame = hodographGridFrame(eccentricity);
    const displayScale = hodographDisplayScale(eccentricity);
    const grid = new THREE.GridHelper(gridFrame.extent * 2 * displayScale, 12, color(this.palette.grid), color(this.palette.grid));
    grid.rotation.x = Math.PI / 2;
    const gridOrigin = this.embedHodograph(gridFrame.center, eccentricity, -0.14);
    grid.position.set(gridOrigin.x, gridOrigin.y, gridOrigin.z);
    const planePickProxy = new THREE.Mesh(
      new THREE.PlaneGeometry(gridFrame.extent * 2 * displayScale, gridFrame.extent * 2 * displayScale),
      makePickMaterial(),
    );
    const planePickOrigin = this.embedHodograph(gridFrame.center, eccentricity);
    planePickProxy.position.set(planePickOrigin.x, planePickOrigin.y, planePickOrigin.z);
    materialsOf(grid).forEach(material => setOpacity(material, 0.28));
    this.construction.add(grid, planePickProxy);
    this.addTooltipTarget({
      id: 'velocity-plane',
      objects: [grid, planePickProxy],
      anchor: () => vector(this.embedHodograph(gridFrame.center, eccentricity, -0.14)),
      anchorAtIntersection: true,
      priority: 1,
    });

    const circlePoints = Array.from({ length: SEGMENTS }, (_, index) => {
      const angle = index / SEGMENTS * TAU;
      return vector(this.embedHodograph({
        x: circle.center.x + Math.cos(angle) * circle.radius,
        y: circle.center.y + Math.sin(angle) * circle.radius,
      }, eccentricity, -0.01));
    });
    const circleMaterial = new THREE.MeshStandardMaterial({ color: this.palette.hodograph, transparent: true, opacity: 0.42, roughness: 0.3, metalness: 0.18 });
    const hodographTube = makeTube(circlePoints, 0.025, circleMaterial, true);
    const hodographPickProxy = makeTube(circlePoints, 0.07, makePickMaterial(), true);
    this.construction.add(hodographTube, hodographPickProxy);
    this.addTooltipTarget({
      id: 'hodograph-circle',
      objects: [hodographTube, hodographPickProxy],
      anchor: () => circlePoints[Math.floor(SEGMENTS / 4)].clone(),
      anchorAtIntersection: true,
      priority: 6,
    });

    const origin = vector(this.embedHodograph({ x: 0, y: 0 }, eccentricity));
    const center = vector(this.embedHodograph(circle.center, eccentricity));
    const centerObjects: THREE.Object3D[] = [this.hodographCenter];
    if (origin.distanceTo(center) > 0.0001) {
      const offsetMaterial = new THREE.MeshStandardMaterial({ color: this.palette.vector, transparent: true, opacity: 0.58, roughness: 0.35, metalness: 0.08 });
      const offsetTube = makeTube([origin, center], 0.014, offsetMaterial);
      const offsetPickProxy = makeTube([origin, center], 0.055, makePickMaterial());
      centerObjects.push(offsetTube, offsetPickProxy);
      this.construction.add(offsetTube, offsetPickProxy);
    }
    this.addTooltipTarget({
      id: 'hodograph-center',
      objects: centerObjects,
      anchor: () => this.hodographCenter.getWorldPosition(new THREE.Vector3()),
      anchorAtIntersection: true,
      priority: 8,
    });

    const samplePositions = samples.map(sample => (
      vector(this.embedHodograph(sample.velocity, eccentricity, 0.025))
    ));
    const nearestSampleGap = samplePositions.reduce((nearest, start, index) => (
      Math.min(nearest, start.distanceTo(samplePositions[(index + 1) % samplePositions.length]))
    ), Number.POSITIVE_INFINITY);
    const markerRadius = velocitySampleRadius(nearestSampleGap);
    const velocityStepObjects: THREE.Object3D[] = [];
    const velocitySampleObjects: THREE.Object3D[] = [];
    samplePositions.forEach((start, index) => {
      const end = samplePositions[(index + 1) % samplePositions.length];
      const direction = end.clone().sub(start);
      const length = direction.length();
      const material = new THREE.MeshStandardMaterial({ color: this.palette.hodograph, transparent: true, opacity: 0.35, roughness: 0.22, metalness: 0.3 });
      this.velocityStepMaterials.push(material);
      if (length > 0.0001) {
        const metrics = velocityStepGlyphMetrics(length);
        const step = makeTube([start, end], metrics.tubeRadius, material);
        const cone = new THREE.Mesh(new THREE.ConeGeometry(metrics.coneRadius, metrics.coneLength, 10), material);
        cone.position.copy(end).addScaledVector(direction.normalize(), -metrics.coneLength / 2);
        cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
        velocityStepObjects.push(step, cone);
        this.construction.add(step, cone);
      }
      const markerMaterial = new THREE.MeshStandardMaterial({ color: this.palette.hodograph, transparent: true, opacity: 0.62, roughness: 0.25, metalness: 0.18 });
      this.velocityMarkerMaterials.push(markerMaterial);
      const marker = new THREE.Mesh(new THREE.SphereGeometry(markerRadius, 14, 14), markerMaterial);
      marker.position.copy(start);
      const markerPickProxy = new THREE.Mesh(
        new THREE.SphereGeometry(Math.max(0.052, markerRadius * 2.25), 10, 10),
        makePickMaterial(),
      );
      markerPickProxy.position.copy(start);
      velocitySampleObjects.push(marker, markerPickProxy);
      this.construction.add(marker, markerPickProxy);
    });
    this.addTooltipTarget({
      id: 'velocity-change-chain',
      objects: velocityStepObjects,
      anchor: () => {
        const index = Math.max(0, this.activeWedge) % samples.length;
        const start = vector(this.embedHodograph(samples[index].velocity, eccentricity, 0.025));
        const end = vector(this.embedHodograph(
          samples[(index + 1) % samples.length].velocity,
          eccentricity,
          0.025,
        ));
        return start.add(end).multiplyScalar(0.5);
      },
      anchorAtIntersection: true,
      priority: 7,
    });
    this.addTooltipTarget({
      id: 'velocity-samples',
      objects: velocitySampleObjects,
      anchor: () => {
        const index = Math.max(0, this.activeWedge) % samplePositions.length;
        return samplePositions[index].clone();
      },
      anchorAtIntersection: true,
      priority: 8,
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

  private markCameraInteraction(): void {
    const becameCustom = this.cameraView !== null;
    this.cameraView = null;
    if (this.canvas.dataset.interacting !== 'true') this.canvas.dataset.interacting = 'true';
    if (!becameCustom) return;
    this.canvas.dispatchEvent(new CustomEvent('hodograph:interact', {
      bubbles: true,
      detail: { cameraView: 'custom', cameraFraming: this.rig.getFraming() },
    }));
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
      setOpacity(material, index === nextIndex ? 0.92 : 0.28);
      material.emissive.set(index === nextIndex ? this.palette.hodograph : '#000000');
      material.emissiveIntensity = index === nextIndex ? 0.28 : 0;
    });
  }
}
