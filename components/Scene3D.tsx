"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type {
  Footprint,
  PackagingRules,
  PalletContainerGrid,
  PalletSlotCenter,
  Placement,
  TransportRecord,
} from "@/lib/types";

export interface Scene3DProps {
  placements: Placement[];
  transport: TransportRecord;
  footprint: Footprint;
  baseHeight: number;
  maxH: number;
  packagingRules: PackagingRules;
  palletGrid: PalletContainerGrid | null;
  palletSlotCenters: PalletSlotCenter[];
  isDark: boolean;
  onBoxHover: (data: { code: string; name: string; l: number; w: number; h: number; rotated: boolean } | null, x: number, y: number) => void;
}

type BoxHoverData = {
  code: string;
  name: string;
  l: number;
  w: number;
  h: number;
  rotated: boolean;
};

function resolveBoxHoverData(object: THREE.Object3D): BoxHoverData | null {
  let current: THREE.Object3D | null = object;
  while (current) {
    const data = current.userData as Partial<BoxHoverData>;
    if (data.code && data.l != null && data.w != null && data.h != null) {
      return {
        code: data.code,
        name: data.name ?? data.code,
        l: data.l,
        w: data.w,
        h: data.h,
        rotated: Boolean(data.rotated),
      };
    }
    current = current.parent;
  }
  return null;
}

function disposeObject(child: THREE.Object3D) {
  const mesh = child as THREE.Mesh;
  if (mesh.geometry) mesh.geometry.dispose();
  if (mesh.material) {
    if (Array.isArray(mesh.material)) mesh.material.forEach((material) => material.dispose());
    else mesh.material.dispose();
  }
  child.children.forEach(disposeObject);
}

export default function Scene3D({
  placements,
  transport,
  footprint,
  baseHeight,
  maxH,
  packagingRules,
  palletGrid,
  palletSlotCenters,
  isDark,
  onBoxHover,
}: Scene3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const stackGroupRef = useRef<THREE.Group | null>(null);
  const groundMeshRef = useRef<THREE.Mesh | null>(null);
  const interactiveBoxesRef = useRef<THREE.Mesh[]>([]);
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  const frameRef = useRef<number>(0);
  const onBoxHoverRef = useRef(onBoxHover);

  onBoxHoverRef.current = onBoxHover;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf1f5f9);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 1, 3000);
    camera.position.set(260, 220, 260);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;
    controlsRef.current = controls;

    scene.add(new THREE.AmbientLight(0xffffff, 0.72));
    const directLight = new THREE.DirectionalLight(0xffffff, 0.55);
    directLight.position.set(160, 280, 120);
    directLight.castShadow = true;
    scene.add(directLight);

    const groundMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(3000, 3000),
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 1.0 }),
    );
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.receiveShadow = true;
    scene.add(groundMesh);
    groundMeshRef.current = groundMesh;

    const stackGroup = new THREE.Group();
    scene.add(stackGroup);
    stackGroupRef.current = stackGroup;

    const onMouseMove = (event: MouseEvent) => {
      if (!rendererRef.current || !cameraRef.current) return;
      const rect = rendererRef.current.domElement.getBoundingClientRect();
      mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);
      const hit = raycasterRef.current.intersectObjects(interactiveBoxesRef.current, false)[0];
      if (!hit) {
        onBoxHoverRef.current(null, 0, 0);
        return;
      }
      const data = resolveBoxHoverData(hit.object);
      if (!data) {
        onBoxHoverRef.current(null, 0, 0);
        return;
      }
      onBoxHoverRef.current(data, event.clientX, event.clientY);
    };

    const onMouseLeave = () => onBoxHoverRef.current(null, 0, 0);

    const onWindowResize = () => {
      if (!container || !cameraRef.current || !rendererRef.current) return;
      cameraRef.current.aspect = container.clientWidth / container.clientHeight;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(container.clientWidth, container.clientHeight);
    };

    container.addEventListener("mousemove", onMouseMove);
    container.addEventListener("mouseleave", onMouseLeave);
    window.addEventListener("resize", onWindowResize);

    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frameRef.current);
      container.removeEventListener("mousemove", onMouseMove);
      container.removeEventListener("mouseleave", onMouseLeave);
      window.removeEventListener("resize", onWindowResize);
      if (stackGroupRef.current) {
        while (stackGroupRef.current.children.length) {
          const child = stackGroupRef.current.children[0];
          stackGroupRef.current.remove(child);
          disposeObject(child);
        }
      }
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      controlsRef.current = null;
      stackGroupRef.current = null;
      groundMeshRef.current = null;
      interactiveBoxesRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (!sceneRef.current) return;
    sceneRef.current.background = new THREE.Color(isDark ? 0x0f172a : 0xf1f5f9);
    if (groundMeshRef.current) {
      (groundMeshRef.current.material as THREE.MeshStandardMaterial).color.set(
        isDark ? 0x111827 : 0xe2e8f0,
      );
    }
  }, [isDark]);

  useEffect(() => {
    const stackGroup = stackGroupRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!stackGroup || !camera || !controls) return;

    while (stackGroup.children.length) {
      const child = stackGroup.children[0];
      stackGroup.remove(child);
      disposeObject(child);
    }
    interactiveBoxesRef.current = [];

    const addPalletMesh = (width: number, height: number, length: number, x: number, z: number) => {
      const palletBase = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, length),
        new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.9 }),
      );
      palletBase.position.set(x, height / 2, z);
      palletBase.castShadow = true;
      palletBase.receiveShadow = true;
      stackGroup.add(palletBase);
    };

    if (baseHeight > 0) {
      if (
        transport.isPalletLoadedContainer &&
        packagingRules.palletLoadedContainer.showPalletsInsideContainer &&
        palletGrid
      ) {
        const pallet = palletGrid.pallet;
        const palletWidth = palletGrid.rotated ? pallet.length : pallet.width;
        const palletLength = palletGrid.rotated ? pallet.width : pallet.length;
        palletSlotCenters.forEach((slot) => {
          addPalletMesh(palletWidth, baseHeight, palletLength, slot.x, slot.z);
        });
      } else {
        addPalletMesh(transport.w, baseHeight, transport.l, 0, 0);
      }
    }

    const limitLines = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(footprint.w, maxH, footprint.l)),
      new THREE.LineBasicMaterial({ color: 0xff671f, transparent: true, opacity: 0.22 }),
    );
    limitLines.position.y = maxH / 2;
    stackGroup.add(limitLines);

    placements.forEach((placement) => {
      const product = placement.pack.product;
      const geo = new THREE.BoxGeometry(
        Math.max(1, placement.w - 0.5),
        Math.max(1, placement.h - 0.5),
        Math.max(1, placement.l - 0.5),
      );
      const mat = new THREE.MeshStandardMaterial({
        color: product.color,
        roughness: 0.58,
        metalness: 0.08,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(placement.x, placement.y, placement.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = {
        code: product.code,
        name: product.name,
        l: placement.l,
        w: placement.w,
        h: placement.h,
        rotated: placement.rotated,
      };

      const frame = new THREE.LineSegments(
        new THREE.EdgesGeometry(geo),
        new THREE.LineBasicMaterial({
          color: product.color === 0x0f172a ? 0xffffff : 0x000000,
          transparent: true,
          opacity: 0.24,
        }),
      );
      mesh.add(frame);
      stackGroup.add(mesh);
      interactiveBoxesRef.current.push(mesh);
    });

    const maxDimension = Math.max(footprint.w, footprint.l, maxH);
    const distance = maxDimension * (transport.type === "container" ? 0.9 : 1.35);
    camera.far = Math.max(3000, distance * 4);
    camera.updateProjectionMatrix();
    camera.position.set(distance, distance * 0.75, distance);
    controls.target.set(0, maxH / 3, 0);
  }, [
    placements,
    transport,
    footprint,
    baseHeight,
    maxH,
    packagingRules,
    palletGrid,
    palletSlotCenters,
  ]);

  return <div id="canvas-container" ref={containerRef} className="absolute inset-0" />;
}
