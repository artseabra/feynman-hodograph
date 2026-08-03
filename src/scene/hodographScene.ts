import * as THREE from 'three';
import type { CameraView, OrbitalState, SceneBounds, ThemePalette } from '../types';
import { equalTimeSamples, hodographCircle, orbitalState, TAU } from '../model/orbit';
import { computeInstrumentBounds, sceneLayout } from '../model/bounds';
import { CameraGestureController, CameraRig } from './cameraRig';

const SEGMENTS = 240;

interface ConstructionParameters {
  eccentricity: number;
  wedges: number;
}

function lineGeometry(points: THREE.Vector3[]): THREE.BufferGeometry {
  return new THREE.BufferGeometry().setFromPoints(points);
}

function color(value: string): THREE.Color {
  return new THREE.Color(value);
}

function disposeObject(object: THREE.Object3D): void {
  object.traverse(child => {
    const mesh = child as THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>;
    mesh.geometry?.dispose();
    const materials = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
    materials.forEach(material => material.dispose());
  });
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
  private readonly planet: THREE.Mesh;
  private readonly planetGlow: THREE.PointLight;
  private readonly sun: THREE.Mesh;
  private readonly positionLine: THREE.Line;
  private readonly velocityLine: THREE.Line;
  private readonly hodographPoint: THREE.Mesh;
  private palette: ThemePalette;
  private parameters: ConstructionParameters;
  private bounds: SceneBounds;
  private lastTimestamp = performance.now();

  constructor(container: HTMLElement, parameters: ConstructionParameters, palette: ThemePalette) {
    this.parameters = parameters;
    this.palette = palette;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.canvas = this.renderer.domElement;
    this.canvas.setAttribute('aria-label', 'Interactive 3D hodograph construction');
    container.replaceChildren(this.canvas);

    this.scene.add(this.construction, this.live);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x132231, 1.25));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.7);
    keyLight.position.set(-4, 6, 8);
    this.scene.add(keyLight);

    const sphereGeometry = new THREE.SphereGeometry(0.13, 28, 28);
    this.planet = new THREE.Mesh(sphereGeometry, new THREE.MeshStandardMaterial({ color: palette.orbit, roughness: 0.35, metalness: 0.16 }));
    this.planetGlow = new THREE.PointLight(palette.orbit, 1.5, 4);
    this.planet.add(this.planetGlow);
    this.sun = new THREE.Mesh(new THREE.SphereGeometry(0.19, 28, 28), new THREE.MeshStandardMaterial({ color: palette.sun, emissive: palette.sun, emissiveIntensity: 0.65, roughness: 0.4 }));
    this.hodographPoint = new THREE.Mesh(new THREE.SphereGeometry(0.12, 24, 24), new THREE.MeshStandardMaterial({ color: palette.hodograph, roughness: 0.3, metalness: 0.1 }));
    this.positionLine = new THREE.Line(lineGeometry([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: palette.orbit, transparent: true, opacity: 0.95 }));
    this.velocityLine = new THREE.Line(lineGeometry([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: palette.vector, transparent: true, opacity: 0.95 }));
    this.live.add(this.planet, this.sun, this.hodographPoint, this.positionLine, this.velocityLine);

    this.gestureController = new CameraGestureController(this.canvas, this.rig, this.camera, () => {
      this.canvas.dataset.interacting = 'true';
    });

    this.bounds = computeInstrumentBounds(parameters.eccentricity, parameters.wedges);
    this.rebuildConstruction();
  }

  setParameters(parameters: ConstructionParameters): void {
    this.parameters = parameters;
    this.bounds = computeInstrumentBounds(parameters.eccentricity, parameters.wedges);
    this.rebuildConstruction();
  }

  setPalette(palette: ThemePalette): void {
    this.palette = palette;
    this.renderer.setClearColor(color(palette.background), 0);
    this.rebuildConstruction();
    const planetMaterial = this.planet.material as THREE.MeshStandardMaterial;
    planetMaterial.color.set(palette.orbit);
    this.planetGlow.color.set(palette.orbit);
    const sunMaterial = this.sun.material as THREE.MeshStandardMaterial;
    sunMaterial.color.set(palette.sun);
    sunMaterial.emissive.set(palette.sun);
    const hodoMaterial = this.hodographPoint.material as THREE.MeshStandardMaterial;
    hodoMaterial.color.set(palette.hodograph);
    (this.positionLine.material as THREE.LineBasicMaterial).color.set(palette.orbit);
    (this.velocityLine.material as THREE.LineBasicMaterial).color.set(palette.vector);
  }

  setView(view: CameraView): void {
    this.rig.setView(view);
  }

  resetCamera(): void {
    this.rig.reset();
    this.rig.fit(this.bounds, this.camera, this.camera.aspect);
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
    this.rig.update(this.camera, deltaSeconds);

    const position = this.positionWorld(state.position.x, state.position.y, 0.12);
    const focus = this.positionWorld(0, 0, 0.12);
    const circle = hodographCircle(state.eccentricity);
    const center = this.hodographWorld(circle.center.x, circle.center.y, 0.1);
    const velocity = this.hodographWorld(state.velocity.x, state.velocity.y, 0.15);

    this.planet.position.copy(position);
    this.sun.position.copy(focus);
    this.hodographPoint.position.copy(velocity);
    this.updateLine(this.positionLine, focus, position);
    this.updateLine(this.velocityLine, center, velocity);
    this.renderer.render(this.scene, this.camera);
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

    const { eccentricity, wedges } = this.parameters;
    const samples = equalTimeSamples(eccentricity, wedges);
    this.addPositionSpace(samples, eccentricity);
    this.addVelocitySpace(samples, eccentricity);
    this.rig.fit(this.bounds, this.camera, this.camera.aspect);
  }

  private addPositionSpace(samples: ReturnType<typeof equalTimeSamples>, eccentricity: number): void {
    this.construction.add(this.makeGrid(sceneLayout.positionOffset, 2.35, 8));

    const orbitPoints = Array.from({ length: SEGMENTS + 1 }, (_, index) => {
      const sample = orbitalState(eccentricity, (index / SEGMENTS) * TAU);
      return this.positionWorld(sample.position.x, sample.position.y, 0.02);
    });
    this.construction.add(new THREE.Line(
      lineGeometry(orbitPoints),
      new THREE.LineBasicMaterial({ color: this.palette.orbit, transparent: true, opacity: 0.92 }),
    ));

    const centerX = eccentricity * sceneLayout.positionScale;
    const auxiliary = new THREE.EllipseCurve(
      sceneLayout.positionOffset.x + centerX,
      sceneLayout.positionOffset.y,
      sceneLayout.positionScale,
      sceneLayout.positionScale,
      0,
      TAU,
      false,
      0,
    ).getPoints(SEGMENTS).map(point => new THREE.Vector3(point.x, point.y, sceneLayout.positionOffset.z - 0.04));
    const auxiliaryLine = new THREE.Line(
      lineGeometry(auxiliary),
      new THREE.LineDashedMaterial({ color: this.palette.construction, dashSize: 0.09, gapSize: 0.07, transparent: true, opacity: 0.7 }),
    );
    auxiliaryLine.computeLineDistances();
    this.construction.add(auxiliaryLine);

    const wedgeMaterial = new THREE.MeshBasicMaterial({ color: this.palette.wedge, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false });
    samples.forEach((sample, index) => {
      const next = samples[(index + 1) % samples.length];
      const focus = this.positionWorld(0, 0, -0.03);
      const start = this.positionWorld(sample.position.x, sample.position.y, -0.03);
      const end = this.positionWorld(next.position.x, next.position.y, -0.03);
      const geometry = new THREE.BufferGeometry().setFromPoints([focus, start, end]);
      geometry.setIndex([0, 1, 2]);
      this.construction.add(new THREE.Mesh(geometry, wedgeMaterial.clone()));

      const spoke = new THREE.Line(
        lineGeometry([focus, this.positionWorld(sample.position.x, sample.position.y, 0.01)]),
        new THREE.LineBasicMaterial({ color: this.palette.orbit, transparent: true, opacity: 0.26 }),
      );
      this.construction.add(spoke);
    });
  }

  private addVelocitySpace(samples: ReturnType<typeof equalTimeSamples>, eccentricity: number): void {
    this.construction.add(this.makeGrid(sceneLayout.hodographOffset, 2.9, 8));
    const circle = hodographCircle(eccentricity);
    const circlePoints = Array.from({ length: SEGMENTS + 1 }, (_, index) => {
      const angle = (index / SEGMENTS) * TAU;
      return this.hodographWorld(
        circle.center.x + Math.cos(angle) * circle.radius,
        circle.center.y + Math.sin(angle) * circle.radius,
        -0.04,
      );
    });
    const theoreticalCircle = new THREE.Line(
      lineGeometry(circlePoints),
      new THREE.LineDashedMaterial({ color: this.palette.construction, dashSize: 0.1, gapSize: 0.07, transparent: true, opacity: 0.78 }),
    );
    theoreticalCircle.computeLineDistances();
    this.construction.add(theoreticalCircle);

    const velocityPoints = samples.map(sample => this.hodographWorld(sample.velocity.x, sample.velocity.y, 0.02));
    velocityPoints.push(velocityPoints[0].clone());
    this.construction.add(new THREE.Line(
      lineGeometry(velocityPoints),
      new THREE.LineBasicMaterial({ color: this.palette.hodograph, transparent: true, opacity: 0.9 }),
    ));

    samples.forEach((sample, index) => {
      const next = samples[(index + 1) % samples.length];
      const start = this.hodographWorld(sample.velocity.x, sample.velocity.y, 0.04);
      const end = this.hodographWorld(next.velocity.x, next.velocity.y, 0.04);
      const direction = end.clone().sub(start);
      const length = direction.length();
      if (length < 0.001) return;
      const arrow = new THREE.Mesh(
        new THREE.ConeGeometry(0.045, Math.min(0.14, length * 0.55), 10),
        new THREE.MeshBasicMaterial({ color: this.palette.hodograph, transparent: true, opacity: 0.82 }),
      );
      arrow.position.copy(start).lerp(end, 0.5);
      arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
      this.construction.add(arrow);
    });

    const origin = this.hodographWorld(0, 0, 0.01);
    const center = this.hodographWorld(circle.center.x, circle.center.y, 0.01);
    this.construction.add(new THREE.Line(
      lineGeometry([origin, center]),
      new THREE.LineBasicMaterial({ color: this.palette.vector, transparent: true, opacity: 0.7 }),
    ));

    samples.forEach((sample, index) => {
      const point = this.hodographWorld(sample.velocity.x, sample.velocity.y, 0.06);
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.035, 12, 12),
        new THREE.MeshBasicMaterial({ color: index % 2 === 0 ? this.palette.hodograph : this.palette.construction }),
      );
      marker.position.copy(point);
      this.construction.add(marker);
    });
  }

  private makeGrid(offset: { x: number; y: number; z: number }, extent: number, divisions: number): THREE.LineSegments {
    const points: THREE.Vector3[] = [];
    for (let index = 0; index <= divisions; index += 1) {
      const position = -extent + (index / divisions) * extent * 2;
      points.push(
        new THREE.Vector3(offset.x - extent, offset.y + position, offset.z - 0.1),
        new THREE.Vector3(offset.x + extent, offset.y + position, offset.z - 0.1),
        new THREE.Vector3(offset.x + position, offset.y - extent, offset.z - 0.1),
        new THREE.Vector3(offset.x + position, offset.y + extent, offset.z - 0.1),
      );
    }
    return new THREE.LineSegments(
      lineGeometry(points),
      new THREE.LineBasicMaterial({ color: this.palette.grid, transparent: true, opacity: 0.46 }),
    );
  }

  private positionWorld(x: number, y: number, depth: number): THREE.Vector3 {
    return new THREE.Vector3(
      sceneLayout.positionOffset.x + x * sceneLayout.positionScale,
      sceneLayout.positionOffset.y + y * sceneLayout.positionScale,
      sceneLayout.positionOffset.z + depth,
    );
  }

  private hodographWorld(x: number, y: number, depth: number): THREE.Vector3 {
    return new THREE.Vector3(
      sceneLayout.hodographOffset.x + x * sceneLayout.hodographScale,
      sceneLayout.hodographOffset.y + y * sceneLayout.hodographScale,
      sceneLayout.hodographOffset.z + depth,
    );
  }

  private updateLine(line: THREE.Line, start: THREE.Vector3, end: THREE.Vector3): void {
    const positions = line.geometry.getAttribute('position') as THREE.BufferAttribute;
    positions.setXYZ(0, start.x, start.y, start.z);
    positions.setXYZ(1, end.x, end.y, end.z);
    positions.needsUpdate = true;
    line.geometry.computeBoundingSphere();
  }
}
